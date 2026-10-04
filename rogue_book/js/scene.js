// Echowake: SCENE: the canvas combat stage. Actors, VFX, numbers, banners, shake, target rings, the aim arrow, barks and ALL combat SFX.
// Owner: combat scene engineer. This header is the contract of record for scene.js (DESIGN 5.9 is the design, this is what shipped).
//
// PUBLIC API (DESIGN 5.9)
//   SCENE.mount({C, chapter, boss, layout?, banners?, heroes?, enemies?, seed?, instant?})   builds actors from C (heroes by row, living enemies by lane). `boss` picks the
//        boss backdrop; `chapter` defaults to C.chapter. `layout` overrides SCENE.LAYOUT values for this mount only. `banners:true` opts in to the automatic turn
//        banners and boss intro raised by play() (off by default: screen_combat draws its own DOM turn banners and asks for the boss banner itself).
//        Without C, `heroes` ([id | {id,row,hp,maxHp}]) and `enemies` ([defId | {def,id,lane,hp,maxHp,tier,size}]) build a synthetic stage (demos, tests).
//        Mount reads C's FINAL state, so the screen follows it with setViewState for each unit before it drains the opening events. Heroes slide in and
//        enemies fade in over about 0.7 s (instant:true, reduce motion and headless skip the slide).
//   SCENE.unmount()                     resolves every pending gate at once, drops all actors, VFX and timers. play() afterwards resolves immediately.
//   SCENE.LAYOUT                        live layout object (ground y 520, hero marks, five enemy lanes), see below.
//   SCENE.update(dt)                    dt seconds (the caller clamps it to 0.05). Everything runs on this clock, never on wall time, so GAME.debug.tick is exact.
//   SCENE.draw(ctx, t)                  paints backdrop, ambient particles, rings, actors, VFX, particles, numbers, banners, bubbles and the aim arrow on the
//                                       #view context (1280 x 720 stage px, already scaled by UI). Never throws: every ART call is guarded.
//   SCENE.play(evt[, next]) -> Promise  animate one engine event (DESIGN 5.2). Resolves at its GATE; tails keep animating. `next` is an OPTIONAL look-ahead (the
//                                       following event of the FIFO, or null at its end): with it, AoE hits are truly simultaneous (see GATES).
//   SCENE.anchor(kind, id) -> {x,y,w,h,top,feet,head} | null      stage coordinates at REST (no bob, lunge, hop or shake); kind 'hero' | 'enemy'
//   SCENE.hitTest(x, y) -> {kind, id} | null                      a living actor whose bounds rect OR 96 x 96 body box holds the point. Where several answer,
//                                       those whose body box holds it win (front-most first), else the smallest rect: a sprawling boss never steals a tap from a small foe
//   SCENE.setHover(kind, id)  SCENE.setTargetable([ids])          gold rings on the ground under legal targets, a brighter one under the hovered actor (a red
//                                       danger ring also shows under any enemy that is telegraphing a heavy attack)
//   SCENE.aim(fromXY | null, toXY, targetId | null)               calligraphic bezier from the card to the pointer, gold on a legal target (any truthy third
//                                       argument); aim(null) releases it and it fades out in about 120 ms
//   SCENE.bark(heroId, text)            manga speech bubble above the hero for 1.8 s (wall time, frozen only by hit-stop); UI.opt.textScale scales its type
//   SCENE.banner(text, kind)            'YOUR TURN' | 'ENEMY TURN' | 'BOSS' (kind or text). BOSS reads the boss name and DATA.enemies title from the stage (text may
//                                       be the boss name, an enemy id or 'BOSS'); it plays no sound (the screen plays boss_intro). A repeat of the same banner within
//                                       400 ms is ignored and nothing interrupts a running boss banner.
//   SCENE.shake(mag, ms)  SCENE.flash(color, ms)  SCENE.hitstop(ms)    camera shake (px), full-screen colour flash, freeze of the animation clock (max 160 ms)
//   SCENE.speed(k)                      fastAnim factor (1, 1.6, 2.5): gates are divided by it and every beat runs k times faster; speed() reads it
//   SCENE.flush()                       finishes every running beat instantly (tap to skip, and the screen calls it at leave); nothing is replayed, no sound
//   SCENE.setViewState(id, {hp, block, ...})   snap one unit to a state without animating (mount and resync). Also accepts maxHp st down row phase intent
//   SCENE.MAX_PARTICLES = 500
//
// EXTRAS BEYOND DESIGN (all optional for callers)
//   SCENE.autoBanners(on?)              read or set the opt-in above at run time
//   SCENE.gateMs(evt, prev, next?, lookahead?) -> ms     the pure gate table (DESIGN 5.9 item 5), used by play() and by the suite
//   SCENE.sfxForEvent(evt) -> [[id, opts?]]              the pure SFX map (DESIGN 5.9 item 7), used by play() and by the suite
//   SCENE.actorInfo(kind, id) -> snapshot | null         pose, hp, block, st, down, row, lane, phase, x, y, offsets (for tests and tooling)
//   SCENE.stats() -> {mounted, at, particles, fx, numbers, timers, gates, banners, bubbles, shake, freeze, speed, fit, aim, ...}   SCENE.signature() -> int (a hash of the visible state)
//   SCENE.shout(unitId, text)           jagged enemy speech bubble (raised for enemy_act.say and enemy_phase.say)
//   SCENE.demo(name?, opts) / SCENE.stage(opts)   scene-only debugging aids for tools/rogue_book/shot.mjs --js. `SCENE.stage({boss, chapter, enemies, heroes, seed,
//        instant})` mounts a synthetic stage on a private screen (so GAME.debug.tick drives it); `SCENE.demo('kill')` plays one named beat on it (staging first when
//        nothing is mounted); SCENE.demo() lists the names. Example: --js "SCENE.demo('crit'); 0" --frames 14
//   SCENE.GATES, SCENE.SFX (every sound id SCENE may play), SCENE.EVENTS (the event types it handles)
//
// LAYOUT (stage px)    ground y 520; front hero (330, 520, s 1), back hero (170, 508, s 0.94); enemy lanes x = [560, 705, 850, 995, 1120], lane 4 nearest the right edge.
//   Lanes are FIXED for the whole fight (a unit never changes lane, a dead unit leaves its lane empty until a summon takes it). Draw order: by ground y, then x,
//   with an attacker or a hopping hero lifted above the rest. `anchor` is the actor bounds rect scaled from ART.*.bounds, `head` and `feet` inside it.
//   STAGE FIT: when an enemy's art reaches past the right screen edge from its lane (ART.enemy.bounds `right`: an xl boss's tails and wings, the tengu's wing, the
//   boss and elite ground ring), the whole enemy line slides left by that overhang plus 10 px at mount (never more than 240). Gaps between lanes are unchanged, so
//   screen_combat's bar widths and chip caps (which only use lane DISTANCES) stay right, and SCENE.anchor already reports the shifted positions. stats().fit is the shift.
//
// GATES (ms at speed 1, DESIGN 5.9 item 5): hit 70 (non-final hit of a group on the same dst), 120 (final), 200 (killed); 0 when the PREVIOUS event has the same group
//   and another dst (AoE). With the optional look-ahead the rule is exact instead: 0 when the NEXT event has the same group and another dst. play 0 block 0 heal 60 status 0
//   draw 40 discard 0 exhaust 0 energy 0 swap 380 enemy_act 260 summon 400 death 420 enemy_phase 900 hero_down 500 hero_revive 500 turn_start 500 end 700, unlisted 0.
//   A hit that follows a card or an enemy_act is held back until the swing connects (hero 180 ms, enemy 250 ms after the act began); that hold is ADDED to the gate.
//   Hit-stop freezes the animation clock, so it also delays the gates that are running. With window.__HEADLESS every play() resolves on the next microtask and the
//   visual holds collapse to zero (state changes are immediate, so a headless suite can assert them right after `await play()`).
//
// POSES (DESIGN 5.9 item 8): enemies idle; telegraph while the intent kind is heavy (each `intent` event); attack on enemy_act; hurt on a hit that removed HP; block on Block
//   gained; buff on a buff status gained during the enemy phase; die on death. Heroes idle; attack when the played card has a dmg op, else cast; hurt; block; down on hero_down;
//   cheer on a winning end. One-shots return to the actor's base pose after ART.*.poseMs (a held pose such as down or telegraph keeps its end frame, cheer loops).
//
// SFX: SCENE plays every combat sound through AUDIO.sfx, following the map of DESIGN 5.9 item 7 exactly (SCENE.sfxForEvent is that map). Extras beyond the map, all
//   quiet and documented: `hurt` ticks (poison_tick, flame, hit_light), `immune` (block_hit), the `end` stingers (victory, defeat), `boss_intro` with the AUTOMATIC boss
//   intro only, and staggered repeats of card_draw for multi-card draws (at most 4, delay 55 ms each). Hit sounds pan with the stage x of the target.
//
// SETTINGS: UI.opt.reduceMotion (and ART.tk.opt.reduceMotion) turns off shake, zoom, impact frames, chromatic split, full-screen speed lines and flashes (a 60 ms tint replaces
//   a flash), zeroes the parallax, cuts particles to x0.3 and drops the entrance slides. UI.opt.shake scales shake, UI.opt.damageNumbers hides numbers, UI.opt.textScale
//   scales speech bubbles, ART.tk.opt.quality 'low' halves particles and skips afterimages, speed lines, the hit-flash pass and the chromatic pass.
//
// DETERMINISM: every random choice comes from U.rng(U.hash(C.seed, 'fx', eventIndex)) (one stream per played event, kept by every callback that event schedules) or from a
//   per-actor stream for auras; ambient particles are pure functions of the loop clock. No banned random call, no wall clock. The same event stream and the same dt sequence
//   give the same picture (SCENE.signature() proves it in the suite).
//
// ART FALLBACKS: the art modules land at different times. An ART.fx effect that is still the art.js placeholder (or throws), or a scene id whose ART.scene is still the
//   placeholder, is replaced by a small painter of our own so the stage never looks broken. Real art wins the moment it is declared (ART.declare) or replaced. The ground
//   shock ring is SCENE's own effect ('ringGround', never ART.fx.ring) so it cannot depend on how ART.fx.ring is oriented. ART.fx.shield is called with (x, y) at the
//   CENTRE of the actor's bounds and {w, h} its size; the chromatic pass has no stand-in.
//
// PERFORMANCE: the pools are fixed (500 particles, 96 fx, 48 numbers), nothing is allocated per particle, ambient particles are analytic, the backdrop is one ART.scene
//   call. Heroes and enemies are drawn once per frame; the hit flash and afterimages add a draw or two for a few frames.
const SCENE = (() => {
  'use strict';

  // ==================================================================================================================
  // constants and small helpers
  // ==================================================================================================================
  const W = 1280, H = 720, TAU = Math.PI * 2, PI = Math.PI;
  const MAX_PARTICLES = 500, MAX_FX = 96, MAX_NUMS = 48;
  const clamp = U.clamp, lerp = U.lerp;
  const EASE = U.ease;
  const sin = Math.sin, cos = Math.cos, abs = Math.abs, min = Math.min, max = Math.max, floor = Math.floor;
  const sgn = (v) => (v < 0 ? -1 : 1);
  const fin = (v, d) => (typeof v === 'number' && isFinite(v) ? v : (d === undefined ? 0 : d));
  const smooth = U.smooth;
  const pulse01 = (t, hz) => 0.5 + 0.5 * sin(t * hz * TAU);

  const DEFAULT_LAYOUT = {
    W, H, groundY: 520,
    front: { x: 330, y: 520, s: 1 },
    back: { x: 170, y: 508, s: 0.94 },
    lanes: [560, 705, 850, 995, 1120],
    laneY: 520,
    hopMs: 380, hopLift: 96, hopLiftBack: 56,
  };
  const cloneLayout = (l) => ({ W: l.W, H: l.H, groundY: l.groundY, front: Object.assign({}, l.front), back: Object.assign({}, l.back), lanes: l.lanes.slice(), laneY: l.laneY, hopMs: l.hopMs, hopLift: l.hopLift, hopLiftBack: l.hopLiftBack });
  const LAYOUT = cloneLayout(DEFAULT_LAYOUT);
  function applyLayout(over) {
    const d = cloneLayout(DEFAULT_LAYOUT);
    if (over && typeof over === 'object') {
      Object.keys(over).forEach((k) => {
        const v = over[k];
        if (k === 'front' || k === 'back') { if (v && typeof v === 'object') Object.assign(d[k], v); }
        else if (k === 'lanes') { if (Array.isArray(v) && v.length) d.lanes = v.map((n) => fin(n, 0)); }
        else if (typeof v === 'number' && isFinite(v)) d[k] = v;
      });
    }
    LAYOUT.groundY = d.groundY; LAYOUT.laneY = d.laneY; LAYOUT.hopMs = d.hopMs; LAYOUT.hopLift = d.hopLift; LAYOUT.hopLiftBack = d.hopLiftBack;
    LAYOUT.front.x = d.front.x; LAYOUT.front.y = d.front.y; LAYOUT.front.s = d.front.s;
    LAYOUT.back.x = d.back.x; LAYOUT.back.y = d.back.y; LAYOUT.back.s = d.back.s;
    LAYOUT.lanes.length = 0; d.lanes.forEach((n) => LAYOUT.lanes.push(n));
  }

  // The gate table of DESIGN 5.9 item 5 (ms at speed 1). Frozen: the suite reads it.
  const GATES = Object.freeze({ hit: 70, hitFinal: 120, hitKill: 200, play: 0, block: 0, heal: 60, status: 0, draw: 40, discard: 0, exhaust: 0, energy: 0, swap: 380, enemy_act: 260, summon: 400, death: 420, enemy_phase: 900, hero_down: 500, hero_revive: 500, turn_start: 500, end: 700 });

  // The sound ids SCENE may play (every one is in DATA.LISTS.sfx; the suite checks it).
  const SFX = Object.freeze(['card_play_attack', 'card_play_skill', 'card_play_power', 'hit_light', 'hit_heavy', 'hit_crit', 'hit_multi', 'block_hit', 'block_break', 'block_gain', 'heal', 'stun', 'buff', 'debuff',
    'dodge', 'thorn', 'swap', 'card_draw', 'shuffle', 'card_discard', 'card_exhaust', 'energy_gain', 'turn_start', 'enemy_turn', 'enemy_die', 'boss_die', 'hero_down', 'hero_revive', 'phase_change',
    'flame', 'ice', 'zap', 'poison_tick', 'slash', 'thud', 'boss_intro', 'victory', 'defeat']);
  const ELEMENT_SFX = { fire: 'flame', ice: 'ice', lightning: 'zap', poison: 'poison_tick', slash: 'slash', ink: 'slash', holy: 'slash' };
  const EVENTS = Object.freeze(['combat_start', 'turn_start', 'turn_end', 'draw', 'shuffle', 'discard', 'exhaust', 'add_card', 'card_move', 'card_upgrade', 'retain', 'energy', 'play', 'hit', 'dodge', 'thorns',
    'block', 'block_lost', 'heal', 'hurt', 'status', 'immune', 'swap', 'intent', 'enemy_act', 'skip', 'summon', 'enemy_phase', 'death', 'flee', 'hero_down', 'hero_revive', 'pick_needed', 'relic', 'gold', 'ink',
    'max_hp', 'end']);

  // element look: main colour, hot accent, the ART.fx effect that carries it, and the onomatopoeia
  const EL = {
    slash: { c: '#fff8f0', c2: '#ffe9a8', fx: 'slash', word: 'ZAN!' },
    fire: { c: '#ff9a2e', c2: '#ffe45e', fx: 'flame', word: 'BAN!' },
    ice: { c: '#8fdcff', c2: '#ffffff', fx: 'frost', word: 'KIN!' },
    lightning: { c: '#ffe45e', c2: '#eaffff', fx: 'lightning', word: 'PIKA!' },
    ink: { c: '#7a6bff', c2: '#5ff5ff', fx: 'inkSplash', word: 'WAAN!' },
    poison: { c: '#3fd6b0', c2: '#c8fff0', fx: 'poison', word: 'BUKU!' },
    holy: { c: '#ffe9a8', c2: '#ffffff', fx: 'sparkle', word: 'PIKA!' },
  };
  // buff and status colours for auras, pops and glows
  const ST_COL = { might: '#ff7a3a', bulwark: '#5fb4ff', regen: '#7dffb0', thorns: '#9be34a', dodge: '#5ff5ff', taunt: '#f5c96a', ritual: '#b58bff', plating: '#b8c4e0', bloom: '#ff7eb6', sumi: '#7a6bff', ward: '#a9c4ff',
    charge: '#ffe45e', vulnerable: '#ff5a5a', weak: '#8a86a8', frail: '#c4a0ff', poison: '#3fd6b0', burn: '#ff9a2e', stun: '#ffe45e', bind: '#c8b890', mark: '#f5c96a' };
  const GLOW_PRIORITY = ['burn', 'poison', 'might', 'taunt', 'bulwark', 'regen', 'ritual', 'thorns'];

  // ART, AUDIO and UI are reached through accessors so a fake or a missing namespace never throws
  const AR = () => (typeof ART !== 'undefined' ? ART : null);
  const AU = () => (typeof AUDIO !== 'undefined' ? AUDIO : null);
  const UO = () => (typeof UI !== 'undefined' && UI && UI.opt ? UI.opt : null);
  const TK = () => { const a = AR(); return a && a.tk ? a.tk : null; };
  const headless = () => typeof window !== 'undefined' && window.__HEADLESS === true;
  function rmotion() {
    const o = UO();
    if (o && o.reduceMotion) return true;
    const t = TK();
    return !!(t && t.opt && t.opt.reduceMotion);
  }
  function lowQ() {
    const o = UO();
    if (o && o.quality === 'low') return true;
    const t = TK();
    return !!(t && t.opt && t.opt.quality === 'low');
  }
  const shakeScale = () => { const o = UO(); return o && typeof o.shake === 'number' ? clamp(o.shake, 0, 1) : 1; };
  const textScale = () => { const o = UO(); return o && typeof o.textScale === 'number' ? clamp(o.textScale, 1, 1.3) : 1; };      // speech bubbles follow the text size setting
  const numbersOn = () => { const o = UO(); return !(o && o.damageNumbers === false); };
  // particle budget multiplier: reduceMotion x0.3, low quality x0.55
  const pcount = (n) => { const k = rmotion() ? 0.3 : (lowQ() ? 0.55 : 1); return n <= 0 ? 0 : max(1, Math.round(n * k)); };

  const warned = {};
  function warnOnce(key, e) {
    if (warned[key]) return;
    warned[key] = true;
    if (typeof console !== 'undefined' && console.warn) console.warn('[scene] ' + key + ': ' + ((e && e.message) || e));
  }

  // ==================================================================================================================
  // state
  // ==================================================================================================================
  // particle kinds
  const P_DOT = 0, P_SPARK = 1, P_PETAL = 2, P_INK = 3, P_SHARD = 4, P_STAR = 5, P_EMBER = 6, P_BUBBLE = 7, P_MOTE = 8, P_PUFF = 9, P_NOTE = 10;
  // one preallocated pool (DESIGN 5.8: particles capped at 500). Nothing is allocated per particle.
  const PART = [];
  for (let i = 0; i < MAX_PARTICLES; i++) PART.push({ on: false, k: 0, x: 0, y: 0, vx: 0, vy: 0, ay: 0, drag: 0, age: 0, life: 1, s: 1, s1: 0, rot: 0, vr: 0, col: '#fff', a: 1, add: false, front: true });

  let speedK = 1;                                  // survives mounts: UI.applySettings sets it once
  const S = { mounted: false };                    // every other field is (re)built by resetState
  function resetState() {
    Object.assign(S, {
      mounted: false, flushing: false, seed: 1, chapter: 1, boss: false, sceneId: 'ch1', C: null,
      at: 0, lt: 0, freeze: 0, evi: 0, prev: null, phase: 'setup', rng: U.rng(1), arng: U.rng(2),
      actors: [], order: [], hmap: {}, emap: {}, timers: [], tseq: 0, bcache: {}, enemySerial: {}, acting: null,
      fit: 0, pcur: 0, fx: [], nums: [], banners: [], barks: {}, shouts: [],
      shk: { mag: 0, t0: 0, dur: 1 }, zoom: { k: 0, x: 640, y: 360, t0: 0, dur: 1 }, dim: { a: 0, t0: 0, dur: 1, x: 640, y: 420 }, flashes: [],
      targetable: {}, hover: null, aim: null, ptr: { x: 640, y: 360 }, par: 0, inkFadeT0: -1, win: false, lose: false,
      drawErrors: 0, autoBanners: false, bossShown: false,
    });
    for (let i = 0; i < PART.length; i++) PART[i].on = false;
  }
  resetState();

  const _rp = { x: 0, y: 0, s: 1, lift: 0 }, _bp = { x: 0, y: 0, s: 1, lift: 0, cx: 0, cy: 0 };

  // ==================================================================================================================
  // timeline: delayed callbacks and gates share one list driven by SCENE.update (never a wall-clock timer)
  // ==================================================================================================================
  // Every delayed callback keeps the random stream of the event that scheduled it, so the picture never depends on interleaving.
  function later(ms, fn) {
    const r = S.rng;
    const run = () => { const keep = S.rng; S.rng = r; try { fn(); } finally { S.rng = keep; } };
    if (!(ms > 0) || headless() || S.flushing) { run(); return; }
    S.timers.push({ at: S.at + ms, seq: ++S.tseq, fn: run, gate: false });
  }
  function gatePromise(ms) {
    if (!S.mounted || !(ms > 0) || headless()) return Promise.resolve();
    return new Promise((res) => { S.timers.push({ at: S.at + ms, seq: ++S.tseq, fn: res, gate: true }); });
  }
  function runTimers() {
    for (let guard = 0; guard < 4000; guard++) {
      let best = -1;
      for (let i = 0; i < S.timers.length; i++) {
        const t = S.timers[i];
        if (t.at <= S.at && (best < 0 || t.at < S.timers[best].at || (t.at === S.timers[best].at && t.seq < S.timers[best].seq))) best = i;
      }
      if (best < 0) return;
      const t = S.timers.splice(best, 1)[0];
      try { t.fn(); } catch (e) { warnOnce('timer', e); }
    }
  }

  // ==================================================================================================================
  // actors
  // ==================================================================================================================
  function newActor(kind, id) {
    return {
      kind, id, def: id, tier: '', size: 'm', lane: -1, row: '', phase: 0, scale: 1,
      hp: 1, maxHp: 1, block: 0, st: {}, down: false, gone: false, dying: false, fled: false,
      pose: 'idle', base: 'idle', poseT0: 0, poseDur: 0, poseScale: 1, atkT0: -1e9, intent: '',
      ox: 0, oy: 0, rot: 0, sx: 1, sy: 1, alpha: 1, flash: 0,
      lx: 0, ly: 0, ex: 0, ey: 0, rx: 0, rv: 0, ry: 0, ryv: 0, sq: 0, sqP: 0,
      lunge: null, hop: null, enter: null, flee: null, ghost: 0, ghostDir: 1, deathT0: 0, z: 0, zb: 0, auraAcc: 0, phaseOff: 0, arng: null,
    };
  }
  const copySt = (st) => { const o = {}; if (st && typeof st === 'object') Object.keys(st).forEach((k) => { const v = fin(st[k], 0); if (v !== 0) o[k] = v; }); return o; };
  const isBossActor = (a) => a.kind === 'enemy' && a.tier === 'boss';

  function makeHero(u, i) {
    const a = newActor('hero', u.id);
    a.row = u.row === 'back' || u.row === 'front' ? u.row : (i === 0 ? 'front' : 'back');
    const hd = DATA.heroes && DATA.heroes[u.id];
    a.maxHp = max(1, fin(u.maxHp, hd ? hd.maxHp : 60)); a.hp = clamp(fin(u.hp, a.maxHp), 0, a.maxHp); a.block = max(0, fin(u.block, 0));
    a.st = copySt(u.st); a.down = !!u.down || a.hp <= 0;
    a.phaseOff = i * 0.7 + 0.3;
    if (a.down) { a.pose = 'down'; a.base = 'down'; a.st = {}; a.block = 0; }
    return a;
  }
  function makeEnemy(u, lane) {
    const d = (DATA.enemies && DATA.enemies[u.def || u.id]) || null;
    const a = newActor('enemy', u.id);
    a.def = u.def || String(u.id).split('#')[0];
    a.tier = u.tier || (d && d.tier) || 'normal'; a.size = u.size || (d && d.size) || 'm';
    a.lane = clamp(u.lane !== undefined ? u.lane | 0 : lane | 0, 0, max(0, LAYOUT.lanes.length - 1));
    a.maxHp = max(1, fin(u.maxHp, d && d.hp ? d.hp[1] : 20)); a.hp = clamp(fin(u.hp, a.maxHp), 0, a.maxHp); a.block = max(0, fin(u.block, 0));
    a.st = copySt(u.st); a.phase = fin(u.phase, 0) | 0;
    a.phaseOff = a.lane * 1.13 + 0.2;
    a.intent = u.intent && u.intent.kind ? u.intent.kind : '';
    if (a.intent === 'heavy') { a.pose = 'telegraph'; a.base = 'telegraph'; }
    return a;
  }
  function addActor(a) {
    S.actors.push(a); S.order.push(a);
    if (a.kind === 'hero') S.hmap[a.id] = a; else S.emap[a.id] = a;
    a.arng = U.rng(U.hash(S.seed, 'actor', a.kind, a.id));
    return a;
  }
  function actorOf(ref) {
    if (!ref) return null;
    const a = ref.kind === 'hero' ? S.hmap[ref.id] : ref.kind === 'enemy' ? S.emap[ref.id] : (S.hmap[ref.id] || S.emap[ref.id]);
    return a && !a.gone ? a : null;
  }
  const heroActor = (id) => { const a = S.hmap[id]; return a && !a.gone ? a : null; };
  const enemyActor = (id) => { const a = S.emap[id]; return a && !a.gone ? a : null; };
  const livingEnemies = () => S.actors.filter((a) => a.kind === 'enemy' && !a.gone && !a.dying && !a.fled);

  function normBounds(kind, id) {
    const A = AR();
    let b = null;
    try { b = kind === 'hero' ? A.hero.bounds(id) : A.enemy.bounds(id); } catch (e) { warnOnce('bounds:' + id, e); }
    const w = fin(b && b.w, 120), h = fin(b && b.h, kind === 'hero' ? 250 : 170);
    const pt = (p, dx, dy) => ({ x: fin(p && p.x, dx), y: fin(p && p.y, dy) });
    return { w, h, head: pt(b && b.head, 0, -h * 0.86), feet: pt(b && b.feet, 0, 0), body: pt(b && b.body, b && b.feet ? b.feet.x : 0, -h * 0.45), hand: pt(b && b.hand, 30, -h * 0.4), right: max(0, fin(b && b.right, 0)) };
  }
  function bnd(a) {
    const key = a.kind + ':' + a.def;
    return S.bcache[key] || (S.bcache[key] = normBounds(a.kind, a.def));
  }

  // STAGE FIT. An enemy whose picture reaches past the right screen edge from its lane (an xl boss's tails and wings, the tengu's wing, the boss ring) is not
  // cropped: the WHOLE enemy line slides left by the worst overhang (`bounds.right` is the visible reach right of the feet, art plus ring, see ART.enemy.bounds)
  // plus EDGE_PAD. Every enemy moves by the same amount, so the gaps between lanes stay exactly what screen_combat's bar and chip caps assume, and the
  // shift is fixed at mount (a dead unit never makes the line jump). The nominal lanes in SCENE.LAYOUT stay the DESIGN 5.9 numbers. SCENE.stats().fit reports it.
  const EDGE_PAD = 10, FIT_MAX = 240;
  function lineFit() {
    let need = 0;
    for (let i = 0; i < S.actors.length; i++) {
      const a = S.actors[i];
      if (a.kind !== 'enemy') continue;
      const right = bnd(a).right;
      if (!(right > 0)) continue;
      const lx = LAYOUT.lanes[clamp(a.lane, 0, LAYOUT.lanes.length - 1)];
      need = max(need, lx + right * a.scale + EDGE_PAD - LAYOUT.W);
    }
    return min(need, FIT_MAX);
  }

  // where the actor stands at rest (its mark or lane, less the stage fit)
  function restPos(a, o) {
    if (a.kind === 'hero') { const r = a.row === 'front' ? LAYOUT.front : LAYOUT.back; o.x = r.x; o.y = r.y; o.s = r.s; }
    else { const lx = LAYOUT.lanes[clamp(a.lane, 0, LAYOUT.lanes.length - 1)]; o.x = lx - S.fit; o.y = LAYOUT.laneY; o.s = a.scale; }
    o.lift = 0;
    return o;
  }
  // where it stands now: rest, or along its hop arc (no lunge, recoil or shake)
  function curPos(a, o) {
    const h = a.hop;
    if (!h) return restPos(a, o);
    const p = clamp((S.at - h.t0) / h.dur, 0, 1), e = EASE.inOutQuad(p), arc = h.lift * 4 * p * (1 - p);
    o.x = lerp(h.fx, h.tx, e); o.y = lerp(h.fy, h.ty, e) - arc; o.s = lerp(h.fs, h.ts, e); o.lift = arc;
    return o;
  }
  // where the feet are drawn this frame, and the body centre
  function livePos(a, o) {
    curPos(a, o);
    o.x += a.ox + a.rx; o.y += a.oy + a.ry;
    const b = bnd(a);
    o.cx = o.x + b.body.x * o.s; o.cy = o.y + b.body.y * o.s;
    return o;
  }
  const bodyOf = (a) => livePos(a, _bp);

  function anchorOf(a) {
    const r = restPos(a, { x: 0, y: 0, s: 1, lift: 0 }), b = bnd(a), s = r.s;
    const cx = r.x + b.feet.x * s, fy = r.y + b.feet.y * s, top = fy - b.h * s;
    return { x: cx - b.w * s / 2, y: top, w: b.w * s, h: b.h * s, top: { x: cx, y: top }, feet: { x: cx, y: fy }, head: { x: cx + (b.head.x - b.feet.x) * s, y: fy + (b.head.y - b.feet.y) * s } };
  }
  function findActor(kind, id) {
    if (kind === 'hero') return heroActor(id);
    if (kind === 'enemy') return enemyActor(id);
    return heroActor(id) || enemyActor(id);
  }
  function anchor(kind, id) {
    if (!S.mounted) return null;
    const a = findActor(kind, id);
    return a ? anchorOf(a) : null;
  }
  // Front-most living actor under (x, y). Every actor answers to its bounds rect OR a 96 x 96 box at its body centre. Where several answer, the
  // ones whose body box holds the point win (the front-most of them); otherwise the smallest rect does, so a sprawling boss never steals a tap
  // from the small foe standing inside its tails.
  function hitTest(x, y) {
    if (!S.mounted) return null;
    x = fin(x, -1e6); y = fin(y, -1e6);
    S.ptr.x = x; S.ptr.y = y;
    let best = null, bBox = false, bArea = 1e12, bz = -1e9;
    for (let i = 0; i < S.actors.length; i++) {
      const a = S.actors[i];
      if (a.gone || a.dying || a.fled || a.down) continue;
      const an = anchorOf(a), b = bnd(a), r = restPos(a, _rp);
      const bx = an.feet.x + (b.body.x - b.feet.x) * r.s, by = an.feet.y + (b.body.y - b.feet.y) * r.s;
      const inRect = x >= an.x && x <= an.x + an.w && y >= an.y && y <= an.y + an.h;
      const inBox = abs(x - bx) <= 48 && abs(y - by) <= 48;
      if (!inRect && !inBox) continue;
      const z = zOf(a), area = an.w * an.h;
      let better;
      if (inBox !== bBox) better = inBox;
      else if (inBox) better = z > bz;
      else better = area < bArea - 1e-6 || (abs(area - bArea) <= 1e-6 && z > bz);
      if (better || !best) { best = a; bBox = inBox; bArea = area; bz = z; }
    }
    return best ? { kind: best.kind, id: best.id } : null;
  }
  // draw order key: ground y first, then x; a lunging attacker or a hopping hero is lifted above the rest
  function zOf(a) {
    const r = restPos(a, _rp);
    return r.y * 4 + r.x * 0.001 + a.zb + (a.kind === 'enemy' ? a.lane * 0.01 : 0);
  }
  const cmpZ = (p, q) => p.z - q.z;

  // ==================================================================================================================
  // particles, fx and numbers (pooled, capped)
  // ==================================================================================================================
  const HUE_RAMP = ['#ff7eb6', '#ff9a2e', '#f5c96a', '#3fd6b0', '#5fb4ff', '#7a6bff', '#c49bff'];
  function spawnP(k, x, y, vx, vy, life, s, col, o) {
    if (S.flushing || !S.mounted) return null;
    o = o || {};
    let p = null;
    for (let n = 0; n < MAX_PARTICLES; n++) {
      const c = PART[(S.pcur + n) % MAX_PARTICLES];
      if (!c.on) { p = c; S.pcur = (S.pcur + n + 1) % MAX_PARTICLES; break; }
    }
    if (!p) { p = PART[S.pcur]; S.pcur = (S.pcur + 1) % MAX_PARTICLES; }      // full: the oldest slot is recycled, the cap holds
    p.on = true;
    p.k = k; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.ay = o.ay === undefined ? 0 : o.ay; p.drag = o.drag === undefined ? 0 : o.drag;
    p.age = -(o.delay || 0); p.life = max(30, life); p.s = s; p.s1 = o.s1 === undefined ? s : o.s1; p.rot = o.rot === undefined ? 0 : o.rot; p.vr = o.vr === undefined ? 0 : o.vr;
    p.col = col; p.a = o.a === undefined ? 1 : o.a; p.add = !!o.add; p.front = o.front !== false;
    return p;
  }
  // a radial burst of n particles of kind k around (x, y). spd px/s, spread 0..1 of 360 degrees around ang
  function burstP(k, n, x, y, spd, life, size, col, o) {
    o = o || {};
    const r = o.rng || S.rng, cnt = o.raw ? n : pcount(n), ang0 = o.ang === undefined ? 0 : o.ang, spread = o.spread === undefined ? 1 : o.spread;
    for (let i = 0; i < cnt; i++) {
      const a = ang0 + (r() - 0.5) * TAU * spread, sp = spd * (0.35 + r() * 0.75);
      spawnP(k, x + (r() - 0.5) * (o.jit || 0), y + (r() - 0.5) * (o.jit || 0), cos(a) * sp, sin(a) * sp - (o.up || 0), life * (0.6 + r() * 0.6), size * (0.6 + r() * 0.7), typeof col === 'function' ? col(r) : col,
        { ay: o.ay, drag: o.drag === undefined ? 1.6 : o.drag, s1: o.s1 === undefined ? undefined : o.s1 * (0.6 + r() * 0.7), rot: r() * TAU, vr: (r() - 0.5) * 8, add: o.add, a: o.a, front: o.front, delay: o.delay });
    }
  }

  function fxMs(name) { const A = AR(); return fin(A && A.fx && A.fx.ms && A.fx.ms[name], 500); }
  // spawn an ART.fx effect. o: {s, color, color2, x2, y2, ang, dir, text, kind, w, h, ms, delay, layer 0 under | 1 over | 2 screen, follow: actor, seed}
  function spawnFx(name, x, y, o) {
    if (S.flushing || !S.mounted) return null;
    o = o || {};
    if (rmotion() && (name === 'impactFrame' || name === 'chromatic' || (name === 'speedLines' && (o.layer === 2)))) return null;       // no impact frames or flashes under reduce motion
    let f = null;
    for (let i = 0; i < S.fx.length; i++) if (!S.fx[i].on) { f = S.fx[i]; break; }
    if (!f) {
      if (S.fx.length < MAX_FX) { f = { on: false, name: '', t0: 0, ms: 1, layer: 1, follow: null, dx: 0, dy: 0, o: { x: 0, y: 0, x2: 0, y2: 0, s: 1, color: '#fff', color2: '#fff', dir: 1, ang: 0, seed: 0, text: '', kind: '', w: W, h: H } }; S.fx.push(f); }
      else { f = S.fx[0]; for (let i = 1; i < S.fx.length; i++) if (S.fx[i].t0 < f.t0) f = S.fx[i]; }      // full: recycle the oldest
    }
    const q = f.o;
    f.on = true; f.name = name; f.t0 = S.at + (o.delay || 0); f.ms = max(40, o.ms || fxMs(name)); f.layer = o.layer === undefined ? 1 : o.layer;
    f.follow = o.follow || null; f.dx = fin(o.dx, 0); f.dy = fin(o.dy, 0);
    q.x = x; q.y = y; q.x2 = o.x2 === undefined ? x : o.x2; q.y2 = o.y2 === undefined ? y : o.y2; q.s = o.s === undefined ? 1 : o.s;
    q.color = o.color || '#ffffff'; q.color2 = o.color2 || q.color; q.dir = o.dir === undefined ? 1 : o.dir; q.ang = o.ang === undefined ? 0 : o.ang;
    q.seed = o.seed === undefined ? floor(S.rng() * 1e9) : o.seed; q.text = o.text === undefined ? '' : o.text; q.kind = o.kind || ''; q.w = o.w === undefined ? W : o.w; q.h = o.h === undefined ? H : o.h;
    return f;
  }
  // floating number (damage, heal, block, poison) or status icon pop
  function spawnNum(x, y, text, kind, o) {
    if (S.flushing || !S.mounted) return null;
    o = o || {};
    if (kind !== 'status' && !numbersOn()) return null;
    let n = null;
    for (let i = 0; i < S.nums.length; i++) if (!S.nums[i].on) { n = S.nums[i]; break; }
    if (!n) {
      if (S.nums.length < MAX_NUMS) { n = { on: false }; S.nums.push(n); }
      else { n = S.nums[0]; for (let i = 1; i < S.nums.length; i++) if (S.nums[i].t0 < n.t0) n = S.nums[i]; }
    }
    n.on = true; n.x = x; n.y = y; n.text = String(text); n.kind = kind; n.t0 = S.at + (o.delay || 0); n.ms = o.ms || (kind === 'status' ? 1100 : fxMs('numberPop'));
    n.vx = o.vx === undefined ? 0 : o.vx; n.rise = o.rise === undefined ? 74 : o.rise; n.s = o.s === undefined ? 1 : o.s; n.icon = o.icon || ''; n.seed = floor(S.rng() * 1e9);
    return n;
  }

  // ==================================================================================================================
  // ART.fx dispatch, with a small painter of our own for every effect whose art is still the art.js placeholder (or throws)
  // ==================================================================================================================
  const stubCache = new Map();
  // ART.fx placeholders are all generated from one template, so their source text is identical across names; real effects always differ.
  function fxIsReal(name) {
    const A = AR();
    if (!A || !A.fx || typeof A.fx[name] !== 'function') return false;
    if (typeof A.has === 'function' && A.has('fx', name)) return true;
    const fn = A.fx[name];
    let v = stubCache.get(fn);
    if (v === undefined) {
      const src = Function.prototype.toString.call(fn);
      let dup = 0;
      (A.fx.names || []).forEach((n) => { const g = A.fx[n]; if (g !== fn && typeof g === 'function' && Function.prototype.toString.call(g) === src) dup++; });
      v = dup === 0;
      stubCache.set(fn, v);
    }
    return v;
  }
  function callFx(name, ctx, o, p) {
    const A = AR();
    if (!OWN[name] && fxIsReal(name)) {
      try { A.fx[name](ctx, o, p); return; } catch (e) { warnOnce('ART.fx.' + name, e); }
    }
    const fb = FB[name];
    if (fb) { try { fb(ctx, o, p); } catch (e) { warnOnce('fallback.' + name, e); } }
  }
  const OWN = { ringGround: true };                 // effects that belong to SCENE alone (not in ART.fx): always drawn by our own painter
  const hexOr = (c, d) => (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c : d);
  const vs = (seed, i) => { let h = (seed ^ (i * 374761393)) >>> 0; h = Math.imul(h ^ (h >>> 15), 2246822519); h = Math.imul(h ^ (h >>> 13), 3266489917); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

  const FB = {
    slash(ctx, o, p) {
      const T = TK(), r = 84 * o.s, e = EASE.outCubic(min(1, p * 1.9)), a0 = (o.dir < 0 ? PI + 0.55 - o.ang : -0.55 + o.ang) - 1.05, a1 = a0 + 2.1 * e, am = (a0 + a1) / 2, bulge = 1.32 - 0.1 * p;
      T.glow(ctx, o.x, o.y, r * 1.25, hexOr(o.color, '#ffffff'), 0.45 * (1 - p));
      ctx.save(); ctx.translate(o.x, o.y); ctx.globalAlpha *= clamp(1.5 * (1 - p), 0, 1);
      ctx.beginPath(); ctx.moveTo(cos(a0) * r, sin(a0) * r);
      ctx.quadraticCurveTo(cos(am) * r * bulge, sin(am) * r * bulge, cos(a1) * r, sin(a1) * r);           // a slim crescent: the outer edge bulges, the inner one hugs the chord
      ctx.quadraticCurveTo(cos(am) * r * 0.74, sin(am) * r * 0.74, cos(a0) * r, sin(a0) * r);
      ctx.closePath(); ctx.fillStyle = o.color; ctx.fill(); ctx.lineJoin = 'round'; ctx.lineWidth = 2; ctx.strokeStyle = '#140f2e'; ctx.stroke();
      ctx.restore();
    },
    cross(ctx, o, p) { const q = { x: o.x, y: o.y, s: o.s, color: o.color, dir: o.dir, ang: o.ang - 0.7 }; FB.slash(ctx, q, p); q.ang = o.ang + 0.9; FB.slash(ctx, q, clamp(p - 0.08, 0, 1)); },
    thrust(ctx, o, p) {
      const dx = o.x2 - o.x, dy = o.y2 - o.y, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, e = EASE.outCubic(min(1, p * 2.2)), w = 15 * o.s * (1 - p * 0.6);
      ctx.save(); ctx.globalAlpha *= clamp(1.5 * (1 - p), 0, 1);
      ctx.beginPath(); ctx.moveTo(o.x + dx * e, o.y + dy * e); ctx.lineTo(o.x + dx * max(0, e - 0.6) + nx * w, o.y + dy * max(0, e - 0.6) + ny * w); ctx.lineTo(o.x + dx * max(0, e - 0.6) - nx * w, o.y + dy * max(0, e - 0.6) - ny * w); ctx.closePath();
      ctx.fillStyle = o.color; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#140f2e'; ctx.stroke(); ctx.restore();
    },
    burst(ctx, o, p) {
      const e = EASE.outCubic(p), r = (26 + 78 * e) * o.s, n = 9;
      ctx.save(); ctx.translate(o.x, o.y); ctx.globalAlpha *= clamp(1.7 * (1 - p), 0, 1); ctx.rotate((o.seed % 17) * 0.4);
      ctx.beginPath();
      for (let i = 0; i < n * 2; i++) { const a = i * PI / n, rr = i % 2 ? r * 0.4 : r * (0.75 + vs(o.seed, i) * 0.45); ctx.lineTo(cos(a) * rr, sin(a) * rr); }
      ctx.closePath(); ctx.fillStyle = o.color; ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = '#140f2e'; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.28 * (1 - p), 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.restore();
    },
    ring(ctx, o, p) {
      const e = EASE.outCubic(p);
      ctx.save(); ctx.globalAlpha *= clamp(1.3 * (1 - p), 0, 1); ctx.strokeStyle = o.color; ctx.lineWidth = 2 + 7 * (1 - p);
      ctx.beginPath(); ctx.arc(o.x, o.y, (12 + 130 * e) * o.s, 0, TAU); ctx.stroke(); ctx.restore();
    },
    // a shock ring lying on the ground (flattened to a perspective ellipse): SCENE's own, so it never depends on how ART.fx.ring is oriented
    ringGround(ctx, o, p) {
      const e = EASE.outCubic(p);
      ctx.save(); ctx.translate(o.x, o.y); ctx.scale(1, 0.26); ctx.globalAlpha *= clamp(1.3 * (1 - p), 0, 1); ctx.strokeStyle = o.color; ctx.lineWidth = 2 + 8 * (1 - p);
      ctx.beginPath(); ctx.arc(0, 0, (14 + 130 * e) * o.s, 0, TAU); ctx.stroke();
      ctx.lineWidth = 1.6; ctx.globalAlpha *= 0.6; ctx.beginPath(); ctx.arc(0, 0, (8 + 88 * e) * o.s, 0, TAU); ctx.stroke(); ctx.restore();
    },
    inkSplash(ctx, o, p) {
      // cheap stand-in for ART.fx.inkSplash (a sound burst): three expanding rings, sound spikes and a few note heads
      const T = TK(), e = EASE.outCubic(min(1, p * 1.8)), a = p < 0.5 ? 1 : 1 - (p - 0.5) / 0.5, col = hexOr(o.color, '#7a6bff');
      ctx.save(); ctx.globalAlpha *= clamp(a, 0, 1); ctx.lineCap = 'round';
      for (let k = 0; k < 3; k++) {
        const u = clamp(e * 1.15 - k * 0.16, 0, 1);
        if (u <= 0) continue;
        ctx.globalAlpha = clamp(a * (1 - u) * 1.2, 0, 1); ctx.strokeStyle = k ? col : '#e8fbff'; ctx.lineWidth = (3.4 - k) * o.s;
        ctx.beginPath(); ctx.arc(o.x, o.y, (10 + 52 * u) * o.s, 0, TAU); ctx.stroke();
      }
      ctx.globalAlpha = clamp(a, 0, 1); ctx.strokeStyle = '#e8fbff'; ctx.lineWidth = 2.4 * o.s;
      for (let i = 0; i < 10; i++) {
        const an = i / 10 * TAU + vs(o.seed, i) * 0.4, r0 = (12 + 14 * e) * o.s, r1 = r0 + (10 + 26 * vs(o.seed, i + 20)) * e * o.s;
        ctx.beginPath(); ctx.moveTo(o.x + cos(an) * r0, o.y + sin(an) * r0); ctx.lineTo(o.x + cos(an) * r1, o.y + sin(an) * r1); ctx.stroke();
      }
      if (T.note) {
        for (let i = 0; i < 3; i++) {
          const an = -PI / 2 + (i - 1) * 0.9 + (vs(o.seed, i + 50) - 0.5) * 0.4, d = (24 + 34 * e) * o.s;
          T.note(ctx, o.x + cos(an) * d, o.y + sin(an) * d - 10 * e * o.s, 9 * o.s, { kind: i === 1 ? 'quarter' : 'eighth', color: i === 1 ? '#f5c96a' : col, alpha: clamp(a, 0, 1) });
        }
      }
      ctx.restore();
    },
    petals(ctx, o, p) {
      const T = TK();
      for (let i = 0; i < 14; i++) {
        const v = vs(o.seed, i), v2 = vs(o.seed, i + 40), a = -PI / 2 + (v - 0.5) * 2.6, sp = (60 + 120 * v2) * o.s, e = EASE.outCubic(p);
        T.petal(ctx, o.x + cos(a) * sp * e * 1.2 + sin(p * 6 + i) * 8, o.y + sin(a) * sp * e + p * p * 150 * o.s, (7 + 4 * v) * o.s, p * 5 + i, clamp(1.6 * (1 - p), 0, 1), hexOr(o.color, '#ff9cc6'));
      }
    },
    lightning(ctx, o, p) {
      const T = TK();
      ctx.save(); ctx.globalAlpha *= clamp(1.6 * (1 - p), 0, 1);
      T.bolt(ctx, o.x, o.y, o.x2, o.y2, { seed: floor(p * 11) + (o.seed % 97), w: 3.4 * o.s, jag: 30, n: 9, color: hexOr(o.color, '#5fd0ff'), core: '#ffffff' });
      ctx.restore();
      T.glow(ctx, o.x2, o.y2, 70 * o.s, hexOr(o.color, '#ffe45e'), 0.7 * (1 - p));
    },
    chain(ctx, o, p) {
      const T = TK();
      ctx.save(); ctx.globalAlpha *= clamp(1.6 * (1 - p), 0, 1);
      T.bolt(ctx, o.x, o.y, o.x2, o.y2, { seed: floor(p * 9) + (o.seed % 53), w: 2.4 * o.s, jag: 12, n: 8, color: hexOr(o.color, '#7a6bff'), core: '#ffffff' });
      ctx.restore();
    },
    flame(ctx, o, p) {
      const env = sin(min(1, p * 1.3) * PI), T = TK();
      T.glow(ctx, o.x, o.y - 30 * o.s, 90 * o.s, '#ff9a2e', 0.6 * env);
      ctx.save(); ctx.translate(o.x, o.y + 26 * o.s);
      for (let i = 0; i < 7; i++) {
        const v = vs(o.seed, i), bx = (i - 3) * 13 * o.s, h = (52 + 78 * v) * o.s * Math.pow(max(0, env), 0.7), w = (12 + 9 * v) * o.s, sway = sin(p * 9 + i * 1.7) * 10 * o.s;
        for (let k = 0; k < 2; k++) {
          const hh = h * (k ? 0.6 : 1), ww = w * (k ? 0.55 : 1);
          ctx.beginPath(); ctx.moveTo(bx - ww, 0); ctx.quadraticCurveTo(bx - ww, -hh * 0.55, bx + sway * (k ? 0.6 : 1), -hh); ctx.quadraticCurveTo(bx + ww, -hh * 0.5, bx + ww, 0); ctx.closePath();
          ctx.fillStyle = k ? '#ffe45e' : '#ff6a2e'; ctx.globalAlpha = 0.92 * env; ctx.fill();
        }
      }
      ctx.restore();
    },
    frost(ctx, o, p) {
      const e = EASE.outCubic(min(1, p * 1.8)), T = TK();
      T.glow(ctx, o.x, o.y, 84 * o.s, '#8fdcff', 0.7 * (1 - p));
      ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.seed % 11 * 0.3); ctx.globalAlpha *= clamp(1.5 * (1 - p), 0, 1);
      for (let i = 0; i < 8; i++) {
        const a = i * TAU / 8, l = (34 + 40 * vs(o.seed, i)) * o.s * e, w = 7 * o.s;
        ctx.save(); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(6 * o.s, 0); ctx.lineTo(l * 0.55, w); ctx.lineTo(l, 0); ctx.lineTo(l * 0.55, -w); ctx.closePath();
        ctx.fillStyle = i % 2 ? '#ffffff' : '#8fdcff'; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = '#1a3a6a'; ctx.stroke(); ctx.restore();
      }
      ctx.restore();
    },
    poison(ctx, o, p) {
      const T = TK();
      T.glow(ctx, o.x, o.y, 70 * o.s, '#3fd6b0', 0.45 * sin(p * PI));
      ctx.save();
      for (let i = 0; i < 8; i++) {
        const v = vs(o.seed, i), pp = clamp(p * 1.2 - v * 0.2, 0, 1);
        if (pp <= 0) continue;
        const r = (5 + 7 * v) * o.s * (pp > 0.85 ? 1 + (pp - 0.85) * 5 : 1);
        ctx.globalAlpha = clamp(1.4 * (1 - pp), 0, 1) * 0.9; ctx.beginPath(); ctx.arc(o.x + (v - 0.5) * 60 * o.s + sin(pp * 8 + i) * 6, o.y + 20 * o.s - pp * 90 * o.s, r, 0, TAU);
        ctx.fillStyle = 'rgba(63,214,176,0.35)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#c8fff0'; ctx.stroke();
      }
      ctx.restore();
    },
    shield(ctx, o, p) {
      const T = TK(), w = (o.w || 120) * 0.5, h = (o.h || 160) * 0.5, e = EASE.outCubic(min(1, p * 2));
      ctx.save(); ctx.translate(o.x, o.y); ctx.globalAlpha *= clamp(1.5 * (1 - p), 0, 1);
      ctx.beginPath(); ctx.ellipse(0, 0, w * (0.7 + 0.35 * e), h * (0.7 + 0.35 * e), 0, 0, TAU); ctx.fillStyle = 'rgba(95,180,255,0.16)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#bfe4ff'; ctx.stroke();
      ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(191,228,255,0.8)';
      for (let k = 0; k < 2; k++) {
        const rr = (0.45 + 0.4 * ((e + k * 0.5) % 1)) * min(w, h) * 1.2;
        ctx.beginPath(); for (let i = 0; i <= 6; i++) { const a = i * PI / 3 + PI / 6; ctx.lineTo(cos(a) * rr, sin(a) * rr * 1.15); } ctx.stroke();
      }
      ctx.restore();
      T.glow(ctx, o.x, o.y, max(w, h) * 1.1, '#5fb4ff', 0.35 * (1 - p));
    },
    heal(ctx, o, p) {
      const T = TK();
      T.glow(ctx, o.x, o.y, 80 * o.s, hexOr(o.color, '#7dffb0'), 0.5 * sin(p * PI));
      for (let i = 0; i < 9; i++) {
        const v = vs(o.seed, i), pp = clamp(p * 1.25 - v * 0.25, 0, 1);
        if (pp <= 0 || pp >= 1) continue;
        T.sparkle(ctx, o.x + (v - 0.5) * 90 * o.s, o.y + 40 * o.s - pp * 120 * o.s, (5 + 6 * v) * o.s, { color: i % 2 ? '#ffffff' : hexOr(o.color, '#7dffb0'), alpha: sin(pp * PI), glow: 0.3 });
      }
    },
    buff(ctx, o, p) { FB._chev(ctx, o, p, -1); },
    debuff(ctx, o, p) { FB._chev(ctx, o, p, 1); },
    // chevrons that rise (dir -1, buff: they point up) or sink (dir 1, debuff: they point down)
    _chev(ctx, o, p, dir) {
      const T = TK(), col = hexOr(o.color, dir < 0 ? '#ffe45e' : '#b58bff'), s = o.s;
      T.glow(ctx, o.x, o.y, 64 * s, col, 0.4 * sin(clamp(p, 0, 1) * PI));
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let i = 0; i < 3; i++) {
        const pp = clamp(p * 1.4 - i * 0.14, 0, 1);
        if (pp <= 0 || pp >= 1) continue;
        const yy = dir < 0 ? o.y + 30 * s - pp * 100 * s : o.y - 40 * s + pp * 100 * s, apex = yy + dir * 9 * s, arm = yy - dir * 9 * s;
        ctx.globalAlpha = sin(pp * PI);
        for (let k = 0; k < 2; k++) {
          ctx.strokeStyle = k ? col : '#140f2e'; ctx.lineWidth = (k ? 5 : 9) * s;
          ctx.beginPath(); ctx.moveTo(o.x - 16 * s, arm); ctx.lineTo(o.x, apex); ctx.lineTo(o.x + 16 * s, arm); ctx.stroke();
        }
      }
      ctx.restore();
    },
    sparkle(ctx, o, p) {
      const T = TK();
      for (let i = 0; i < 6; i++) {
        const v = vs(o.seed, i), a = v * TAU, d = (24 + 46 * vs(o.seed, i + 9)) * o.s * EASE.outCubic(p), al = sin(clamp(p * 1.3 - v * 0.2, 0, 1) * PI);
        T.sparkle(ctx, o.x + cos(a) * d, o.y + sin(a) * d, (8 + 9 * v) * o.s, { color: i % 2 ? '#ffffff' : hexOr(o.color, '#ffe9a8'), alpha: al, rot: v * 2 });
      }
    },
    speedLines(ctx, o, p) {
      const T = TK(), full = o.w > 0 && o.h > 0 && o.w < W + 1 && o.kind === 'full';
      T.speedLines(ctx, full ? W / 2 : o.x, full ? H / 2 : o.y, { n: 30, seed: o.seed, r0: 60 * o.s, r1: 900, w: 5 * o.s, alpha: 0.8 * (1 - p), color: hexOr(o.color, '#ffffff') });
    },
    impactFrame(ctx, o, p) {
      const T = TK();
      ctx.save(); ctx.globalCompositeOperation = 'difference'; ctx.globalAlpha = p < 0.7 ? 1 : clamp((1 - p) / 0.3, 0, 1); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); ctx.restore();
      ctx.save(); ctx.globalAlpha = 0.85 * (1 - p); T.speedLines(ctx, o.x, o.y, { n: 44, seed: o.seed, r0: 40, r1: 1000, w: 7, color: '#ffffff', alpha: 1 }); ctx.restore();
    },
    sfxText(ctx, o, p) {
      const T = TK(), pop = p < 0.22 ? 0.35 + 0.85 * EASE.outBack(p / 0.22) : 1.2 - 0.2 * min(1, (p - 0.22) / 0.2), al = p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1;
      ctx.save(); ctx.globalAlpha *= clamp(al, 0, 1);
      T.inkText(ctx, o.text || 'ZAN!', o.x, o.y - 26 * p, 60 * o.s * pop, { fill: '#fff8f0', stroke: '#140f2e', shadow: '#e8383d', rot: o.ang, skew: -0.22 });
      ctx.restore();
    },
    vignette(ctx, o, p) { TK().vignette(ctx, W, H, { color: hexOr(o.color, '#e8383d'), alpha: 0.75 * sin(min(1, p) * PI) }); },
    chromatic() { /* the RGB split needs channel masks: no stand-in */ },
    brushDrag(ctx, o, p) {
      // cheap stand-in for ART.fx.brushDrag (a sine sound sweep): a thin wave that rides from the start to the end point
      const e = EASE.outCubic(min(1, p * 1.5)), dx = o.x2 - o.x, dy = o.y2 - o.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, col = hexOr(o.color, '#7a6bff');
      ctx.save(); ctx.globalAlpha *= p > 0.75 ? clamp((1 - p) / 0.25, 0, 1) : 1; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let k = 0; k < 2; k++) {
        ctx.beginPath();
        for (let i = 0; i <= 24; i++) {
          const u = i / 24 * e, env = sin(u / max(0.01, e) * PI * 0.5 + 0.2) * (k ? 0.6 : 1), w = sin(u * 26 - p * 14 + k * 1.2) * 16 * o.s * env;
          const px = lerp(o.x, o.x2, u) + nx * w, py = lerp(o.y, o.y2, u) + ny * w;
          if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        }
        ctx.strokeStyle = k ? '#e8fbff' : col; ctx.lineWidth = (k ? 2.2 : 5) * o.s; ctx.stroke();
      }
      ctx.restore();
    },
    numberPop(ctx, o, p) {
      const T = TK(), sty = NUM_STYLE[o.kind] || NUM_STYLE.dmg, pop = p < 0.16 ? 0.4 + 1.0 * EASE.outBack(p / 0.16) : 1.4 - 0.4 * min(1, (p - 0.16) / 0.3), al = p > 0.68 ? 1 - (p - 0.68) / 0.32 : 1;
      ctx.save(); ctx.globalAlpha *= clamp(al, 0, 1);
      T.inkText(ctx, o.text, o.x, o.y, 34 * o.s * sty.k * pop / 1.4, { fill: sty.fill, stroke: sty.stroke, strokeW: 34 * sty.k * 0.2, skew: -0.12, rot: sty.rot });
      ctx.restore();
    },
  };
  const NUM_STYLE = {
    dmg: { fill: '#fff8f0', stroke: '#140f2e', k: 1, rot: 0 },
    crit: { fill: '#ffe45e', stroke: '#b0245c', k: 1.55, rot: -0.06 },
    heal: { fill: '#b8ffd2', stroke: '#0f5a3a', k: 1.1, rot: 0 },
    block: { fill: '#bfe4ff', stroke: '#12356a', k: 1, rot: 0 },
    poison: { fill: '#9dffc4', stroke: '#0a4a2a', k: 0.9, rot: 0 },
    burn: { fill: '#ffd08a', stroke: '#7d1230', k: 0.9, rot: 0 },
  };

  // ==================================================================================================================
  // sound, poses, motion, camera
  // ==================================================================================================================
  function sfx(id, o) {
    if (S.flushing) return;
    const au = AU();
    if (au && typeof au.sfx === 'function') { try { au.sfx(id, o); } catch (e) { warnOnce('sfx:' + id, e); } }
  }
  // a little stereo: sounds pan with the stage x of what made them
  const panOf = (x) => clamp((x - W / 2) / 900, -0.5, 0.5);

  function poseLen(a, pose) {
    const A = AR();
    let ms = 0;
    try { ms = a.kind === 'hero' ? A.hero.poseMs(pose) : A.enemy.poseMs(pose); } catch (e) { ms = 0; }
    return fin(ms, 0);
  }
  function setPose(a, pose) {
    if (!a || a.gone) return;
    if (a.dying && pose !== 'die') return;
    if (a.kind === 'hero' && a.down && pose !== 'down' && pose !== 'cheer' && pose !== 'idle') return;
    a.pose = pose; a.poseT0 = S.at;
    const ms = poseLen(a, pose);
    a.poseDur = pose === 'die' ? ms / a.poseScale : ms;
  }
  function updPose(a) {
    if (!(a.poseDur > 0) || S.at - a.poseT0 < a.poseDur) return;
    if (a.pose === 'die') { a.poseDur = 0; return; }
    if (a.pose === a.base) {                         // a held pose: cheer loops, down and telegraph stay on their end frame
      if (a.pose === 'cheer') a.poseT0 = S.at; else a.poseDur = 0;
      return;
    }
    a.pose = a.base; a.poseT0 = S.at;
    a.poseDur = a.base === 'cheer' ? poseLen(a, 'cheer') : 0;
  }
  const poseTime = (a) => max(0, (S.at - a.poseT0) / 1000) * (a.pose === 'die' ? a.poseScale : 1);

  // a lunge: pull back a hair, dash to (dx, dy), hold, return. Contact is at wind + dash ms.
  function startLunge(a, dx, dy, o) {
    o = o || {};
    a.lunge = { t0: S.at, dx, dy, wind: o.wind || 80, dash: o.dash || 100, hold: o.hold || 60, ret: o.ret || 240, back: o.back === undefined ? 0.14 : o.back, hop: o.hop || 0, seed: S.rng ? floor(S.rng() * 1e6) : 0 };
    a.atkT0 = S.at; a.zb = 100;
    a.ghost = (lowQ() || rmotion()) ? 0 : (o.wind || 80) + (o.dash || 100) + 120; a.ghostDir = sgn(dx);
    const p = curPos(a, _rp);                                                // the push-off kicks up dust
    burstP(P_PUFF, 3, p.x - sgn(dx) * 14, p.y - 3, 70, 460, 9, '#e6d3a3', { ang: dx > 0 ? PI : 0, spread: 0.4, drag: 2.6, s1: 22, a: 0.5, front: false });
  }
  function updLunge(a) {
    const l = a.lunge;
    if (!l) { a.lx = 0; a.ly = 0; return; }
    const t = S.at - l.t0, t1 = l.wind, t2 = t1 + l.dash, t3 = t2 + l.hold, t4 = t3 + l.ret;
    let k;
    if (t >= t4) { a.lunge = null; a.lx = 0; a.ly = 0; a.zb = 0; return; }
    if (t < t1) k = -l.back * EASE.outQuad(t / t1);
    else if (t < t2) k = lerp(-l.back, 1, EASE.inCubic((t - t1) / l.dash));
    else if (t < t3) k = 1;
    else k = 1 - EASE.outQuad((t - t3) / l.ret);
    a.lx = l.dx * k; a.ly = l.dy * k - l.hop * sin(PI * clamp(k, 0, 1));
  }
  const contactMs = (a) => (a.lunge ? a.lunge.wind + a.lunge.dash : (a.kind === 'hero' ? 180 : 250));

  function recoil(a, vx, vy) { a.rv += vx; a.ryv += vy || 0; }
  function squash(a, amt) { a.sq = amt; a.sqP = 0; }
  function hitFlash(a) { a.flash = 1; }
  function updPhysics(a, sdt) {
    const n = sdt > 0.02 ? 3 : 1, h = sdt / n;
    for (let i = 0; i < n; i++) {
      a.rv += (-190 * a.rx - 15 * a.rv) * h; a.rx += a.rv * h;
      a.ryv += (-220 * a.ry - 17 * a.ryv) * h; a.ry += a.ryv * h;
    }
    if (abs(a.rx) < 0.02 && abs(a.rv) < 0.5) { a.rx = 0; a.rv = 0; }
    if (abs(a.ry) < 0.02 && abs(a.ryv) < 0.5) { a.ry = 0; a.ryv = 0; }
    if (a.sq > 0.002) { a.sq *= Math.exp(-8 * sdt); a.sqP += sdt * 24; a.sx = 1 + a.sq * cos(a.sqP); a.sy = 1 - a.sq * cos(a.sqP) * 0.85; } else { a.sq = 0; a.sx = 1; a.sy = 1; }
    if (a.flash > 0) a.flash = max(0, a.flash - sdt / 0.13);
    if (a.ghost > 0) a.ghost = max(0, a.ghost - sdt * 1000);
  }

  // entrances, flee and hop
  function updSlides(a) {
    a.ex = 0; a.ey = 0;
    let al = 1;
    const en = a.enter;
    if (en) {
      const p = clamp((S.at - en.t0) / en.dur, 0, 1);
      if (S.at >= en.t0 + en.dur) a.enter = null;
      const e = EASE.outBack(p);
      a.ex += en.dx * (1 - e); a.ey += en.dy * (1 - e);
      al = min(al, S.at < en.t0 ? 0 : smooth(p * 2.2));
    }
    const fl = a.flee;
    if (fl) {
      const p = clamp((S.at - fl.t0) / fl.dur, 0, 1);
      a.ex += fl.dx * EASE.inQuad(p); al = min(al, 1 - p);
      if (p >= 1) { a.gone = true; a.flee = null; }
    }
    a.alpha = al;
    if (a.hop && S.at >= a.hop.t0 + a.hop.dur) { a.hop = null; a.zb = 0; }
  }

  // ---- camera: shake, zoom punch, flashes, dim ----------------------------------------------------------------------
  function shake(mag, ms) {
    if (!S.mounted || rmotion()) return;
    mag = fin(mag, 0) * shakeScale();
    if (mag <= 0) return;
    ms = max(60, fin(ms, 220));
    if (mag >= shakeMag()) { S.shk.mag = mag; S.shk.t0 = S.at; S.shk.dur = ms; }
  }
  function shakeMag() {
    const k = S.shk, p = (S.at - k.t0) / k.dur;
    return p >= 1 || p < 0 ? 0 : k.mag * (1 - p) * (1 - p);
  }
  function zoomPunch(k, x, y, ms) {
    if (!S.mounted || rmotion()) return;
    S.zoom.k = k; S.zoom.x = x; S.zoom.y = y; S.zoom.t0 = S.at; S.zoom.dur = ms || 260;
  }
  function zoomNow() {
    const z = S.zoom, p = (S.at - z.t0) / z.dur;
    if (p >= 1 || p < 0 || !z.k) return 1;
    const env = p < 0.12 ? p / 0.12 : 1 - (p - 0.12) / 0.88;
    return 1 + z.k * env * env;
  }
  function flash(color, ms, a) {
    if (!S.mounted) return;
    const col = typeof color === 'string' && color ? color : '#ffffff';
    if (S.flashes.length > 5) S.flashes.shift();
    if (rmotion()) S.flashes.push({ col, t0: S.at, dur: 60, a: 0.16 });      // a 60 ms tint instead of a flash
    else S.flashes.push({ col, t0: S.at, dur: max(40, fin(ms, 140)), a: a === undefined ? 0.55 : a });
  }
  function hitstop(ms) {
    if (!S.mounted || headless()) return;
    ms = clamp(fin(ms, 0) * (rmotion() ? 0.5 : 1), 0, 160);
    if (ms > S.freeze) S.freeze = ms;
  }
  function dimStage(a, ms, x, y) {
    if (rmotion()) return;
    S.dim.a = a; S.dim.t0 = S.at; S.dim.dur = ms; S.dim.x = x; S.dim.y = y;
  }
  function dimNow() {
    const d = S.dim, p = (S.at - d.t0) / d.dur;
    if (p >= 1 || p < 0 || !d.a) return 0;
    const env = p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85;
    return d.a * env;
  }

  // ---- status auras -------------------------------------------------------------------------------------------------
  // particle recipes: kind, colour, spawn chance per 8 Hz tick, vertical speed. Live marks (stun stars, marks, bind ring) are painted with the actor.
  const AURA = {
    poison: { k: P_BUBBLE, col: '#c8fff0', p: 0.55, vy: -34, s: 5, life: 950 },
    burn: { k: P_EMBER, col: '#ff9a2e', p: 0.85, vy: -60, s: 3.4, life: 800, add: true },
    might: { k: P_EMBER, col: '#ff6a3a', p: 0.35, vy: -50, s: 3, life: 700, add: true },
    ritual: { k: P_EMBER, col: '#b58bff', p: 0.35, vy: -46, s: 3, life: 700, add: true },
    regen: { k: P_MOTE, col: '#7dffb0', p: 0.4, vy: -26, s: 4, life: 1000, add: true },
    bulwark: { k: P_STAR, col: '#bfe4ff', p: 0.22, vy: -20, s: 5, life: 800 },
    plating: { k: P_STAR, col: '#dfe6f5', p: 0.2, vy: -18, s: 4.5, life: 800 },
    thorns: { k: P_MOTE, col: '#c8f56a', p: 0.22, vy: -16, s: 3.4, life: 800, add: true },
  };
  const AURA_KEYS = Object.keys(AURA);
  function auraTick(a, sdt) {
    if (a.gone || a.dying || a.down) return;
    a.auraAcc += sdt;
    if (a.auraAcc < 0.125) return;
    a.auraAcc -= 0.125;
    if (a.auraAcc > 0.125) a.auraAcc = 0;
    const st = a.st, r = a.arng;
    let b = null;
    for (let i = 0; i < AURA_KEYS.length; i++) {
      const key = AURA_KEYS[i];
      if (!(st[key] > 0)) continue;
      const rc = AURA[key];
      if (r() > rc.p * (rmotion() ? 0.3 : lowQ() ? 0.5 : 1)) continue;
      if (!b) b = bodyOf(a);
      const bb = bnd(a), w = bb.w * b.s * 0.55, h = bb.h * b.s * 0.5;
      spawnP(rc.k, b.cx + (r() - 0.5) * w, b.cy + (r() - 0.2) * h, (r() - 0.5) * 14, rc.vy * (0.7 + r() * 0.6), rc.life * (0.7 + r() * 0.6), rc.s * (0.7 + r() * 0.7), rc.col, { add: rc.add, ay: 0, drag: 0.2, s1: rc.k === P_BUBBLE ? rc.s * 1.6 : 0.6, rot: r() * TAU, vr: (r() - 0.5) * 3 });
    }
  }
  function auraGlow(a) {
    if (a.kind === 'enemy' && a.pose === 'telegraph') return '#ff5a3a';
    for (let i = 0; i < GLOW_PRIORITY.length; i++) if (a.st[GLOW_PRIORITY[i]] > 0) return ST_COL[GLOW_PRIORITY[i]];
    return 0;
  }

  // ---- banners, barks, shouts -----------------------------------------------------------------------------------------
  function bossInfo(text) {
    let a = null;
    if (text && text !== 'BOSS' && DATA.enemies && DATA.enemies[text]) a = { def: text };
    if (!a) a = S.actors.find((x) => x.kind === 'enemy' && x.tier === 'boss' && !x.gone) || null;
    const d = a && DATA.enemies ? DATA.enemies[a.def] : null;
    if (d) return { name: d.name || a.def, title: d.title || '' };
    return { name: text && text !== 'BOSS' ? String(text) : 'BOSS', title: '' };
  }
  function banner(text, kind) {
    if (!S.mounted) return;
    const k = String(kind === undefined || kind === null ? '' : kind).toLowerCase(), tx = String(text === undefined || text === null ? '' : text);
    const boss = k === 'boss' || tx.toUpperCase() === 'BOSS';
    const enemy = !boss && (k === 'enemy' || /enemy/i.test(tx));
    const style = boss ? 'boss' : enemy ? 'enemy' : 'player';
    const label = boss ? bossInfo(tx.toUpperCase() === 'BOSS' ? '' : tx) : { name: tx || (enemy ? 'ENEMY TURN' : 'YOUR TURN'), title: '' };
    for (let i = 0; i < S.banners.length; i++) {
      const b = S.banners[i];
      if (b.style === style && b.text === label.name && S.at - b.t0 < 400) return;                    // the screen and play() both asked
      if (b.style === 'boss' && !boss && S.at - b.t0 < b.dur) return;                                // nothing interrupts the boss reveal
    }
    if (boss) { S.banners = S.banners.filter((b) => b.style === 'boss'); S.bossShown = true; }
    if (S.banners.length > 3) S.banners.shift();
    S.banners.push({ style, text: label.name, sub: label.title, t0: S.at, dur: boss ? 2600 : 780, seed: floor(S.rng() * 1e6) });
    if (boss) {
      const ba = S.actors.find((x) => x.kind === 'enemy' && x.tier === 'boss' && !x.gone);
      if (ba) { setPose(ba, 'buff'); squash(ba, 0.1); }
      shake(9, 600);
      later(rmotion() ? 0 : 340, () => { flash('#ffffff', 160, 0.5); spawnFx('impactFrame', 640, 360, { layer: 2, ms: 160 }); });
    }
  }
  function bark(heroId, text) {
    if (!S.mounted || !heroActor(heroId) || !text) return;
    S.barks[heroId] = { text: String(text), t0: S.lt, ms: 1800, lines: null, tw: 0 };
  }
  function shout(unitId, text) {
    if (!S.mounted || !text || !enemyActor(unitId)) return;
    S.shouts = S.shouts.filter((s) => s.id !== unitId);
    if (S.shouts.length > 2) S.shouts.shift();
    S.shouts.push({ id: unitId, text: String(text), t0: S.lt, ms: 1500, lines: null, tw: 0, seed: floor(S.rng() * 1e6) });
  }

  // ==================================================================================================================
  // the gate table and the sound map (pure: play() and the suite share them)
  // ==================================================================================================================
  const sameGroupOtherDst = (e, o) => !!(o && e && o.group !== undefined && e.group !== undefined && o.group === e.group && o.dst && e.dst && o.dst.id !== e.dst.id);
  function gateMs(e, prev, next, look) {
    if (!e) return 0;
    const par = (o) => sameGroupOtherDst(e, o);
    switch (e.type) {
      case 'hit': {
        if (look ? par(next) : par(prev)) return 0;
        if (e.killed) return GATES.hitKill;
        const hits = fin(e.hits, 1) || 1;
        return fin(e.index, 0) >= hits - 1 ? GATES.hitFinal : GATES.hit;
      }
      case 'heal': return (look ? par(next) : par(prev)) ? 0 : GATES.heal;
      case 'play': case 'block': case 'status': case 'discard': case 'exhaust': case 'energy': return 0;
      case 'draw': case 'swap': case 'enemy_act': case 'summon': case 'death': case 'enemy_phase': case 'hero_down': case 'hero_revive': case 'turn_start': case 'end': return GATES[e.type];
      default: return 0;
    }
  }
  const statusKind = (s) => { const d = DATA.statuses && DATA.statuses[s]; return d ? d.kind : 'buff'; };
  const cardCache = new Map();
  function cardInfo(card) {
    if (!card) return { type: 'skill', dmg: false };
    const key = card.id + '|' + (card.up ? 1 : 0) + '|' + (card.gems ? card.gems.join(',') : '');
    let c = cardCache.get(key);
    if (c) return c;
    const def = DATA.cards ? DATA.cards[card.id] : null;
    let fx = null;
    try { const r = DATA.resolveCard(card); fx = r && r.fx; } catch (e) { fx = null; }
    if (!fx && def) fx = def.fx;
    const hasDmg = (ops, depth) => {
      if (!Array.isArray(ops) || depth > 6) return false;
      for (let i = 0; i < ops.length; i++) {
        const o = ops[i];
        if (!o || typeof o !== 'object') continue;
        if (o.op === 'dmg') return true;                                 // a `hook` op only registers damage for later: it does not count
        if (o.op === 'cond' && (hasDmg(o.then, depth + 1) || hasDmg(o.else, depth + 1))) return true;
        if (o.op === 'repeat' && hasDmg(o.do, depth + 1)) return true;
      }
      return false;
    };
    c = { type: def ? def.type : 'skill', dmg: hasDmg(fx, 0) };
    if (cardCache.size > 600) cardCache.clear();
    cardCache.set(key, c);
    return c;
  }
  // The DESIGN 5.9 item 7 map, plus the documented extras. Returns [[id, opts?], ...]
  function sfxForEvent(e) {
    const out = [];
    if (!e) return out;
    switch (e.type) {
      case 'play': { const t = cardInfo(e.card).type; out.push([t === 'attack' ? 'card_play_attack' : t === 'power' ? 'card_play_power' : 'card_play_skill']); break; }
      case 'hit': {
        const amount = fin(e.amount, 0), blocked = fin(e.blocked, 0), el = ELEMENT_SFX[e.element] ? e.element : 'slash';
        if (amount <= 0 && blocked > 0) out.push(['block_hit']);
        else out.push([e.crit ? 'hit_crit' : fin(e.hits, 1) > 1 ? 'hit_multi' : amount >= 15 ? 'hit_heavy' : 'hit_light']);
        if (amount > 0) {
          out.push([ELEMENT_SFX[el], { vol: 0.6 }]);
          if (e.dst && e.dst.kind === 'hero' && amount >= 15) out.push(['thud']);
        }
        break;
      }
      case 'block_lost': if (e.cause === 'hit') out.push(['block_break']); break;
      case 'block': out.push(['block_gain']); break;
      case 'heal': out.push(['heal']); break;
      case 'hurt': if (fin(e.amount, 0) > 0) out.push(e.cause === 'poison' ? ['poison_tick'] : e.cause === 'burn' ? ['flame', { vol: 0.55 }] : ['hit_light', { vol: 0.7 }]); break;
      case 'status': if (fin(e.delta, 0) > 0) out.push([e.s === 'stun' ? 'stun' : statusKind(e.s) === 'debuff' ? 'debuff' : 'buff']); break;
      case 'immune': out.push(['block_hit', { vol: 0.6 }]); break;
      case 'dodge': out.push(['dodge']); break;
      case 'thorns': out.push(['thorn']); break;
      case 'swap': out.push(['swap']); break;
      case 'draw': { const n = max(1, min(4, (e.cards && e.cards.length) || 0)); for (let i = 0; i < n; i++) out.push(i ? ['card_draw', { delay: 55 * i }] : ['card_draw']); break; }
      case 'shuffle': out.push(['shuffle']); break;
      case 'discard': out.push(['card_discard']); break;
      case 'exhaust': out.push(['card_exhaust']); break;
      case 'energy': if (fin(e.delta, 0) > 0) out.push(['energy_gain']); break;
      case 'turn_start': out.push([e.who === 'player' ? 'turn_start' : 'enemy_turn']); break;
      case 'death': out.push([e.tier === 'boss' ? 'boss_die' : 'enemy_die']); break;
      case 'hero_down': out.push(['hero_down']); break;
      case 'hero_revive': out.push(['hero_revive']); break;
      case 'enemy_phase': out.push(['phase_change']); break;
      case 'summon': out.push(['debuff']); break;
      case 'end': out.push([e.result === 'win' ? 'victory' : 'defeat']); break;
      default: break;
    }
    return out;
  }
  function playSfx(list, x) {
    for (let i = 0; i < list.length; i++) {
      const id = list[i][0];
      let o = list[i][1];
      if (x !== undefined) o = Object.assign({ pan: panOf(x) }, o);
      sfx(id, o);
    }
  }

  // ==================================================================================================================
  // event handlers: each starts its beats and returns the extra hold (ms) to add to the gate
  // ==================================================================================================================
  const sizeK = (a) => clamp(bnd(a).h * (a.kind === 'hero' ? LAYOUT.front.s : 1) / 200, 0.55, 1.75);   // effect scale from the actor's height
  const recoilDamp = (a) => (a.size === 'xl' ? 0.3 : a.size === 'l' ? 0.6 : 1);
  const heroColor = (id) => { const d = DATA.heroes && DATA.heroes[id]; return d && d.color ? d.color : '#ffe9a8'; };
  const topOf = (a) => { const r = livePos(a, _bp), b = bnd(a); return r.y - b.h * r.s * 0.98; };
  const r2 = (a) => (a.arng ? a.arng() : 0.5);

  const H_ = {};
  // Banners are raised by play() only when the screen opted in (mount({banners:true}) or SCENE.autoBanners(true)): screen_combat draws its own DOM turn banners
  // and boss reveal and asks for the boss banner explicitly, so an automatic one would double up. SCENE.banner() itself is always honoured.
  H_.combat_start = () => {
    S.phase = 'setup';
    if (S.autoBanners && S.boss && !S.bossShown) { sfx('boss_intro'); banner('BOSS', 'boss'); }
    return 0;
  };
  H_.turn_start = (e) => {
    S.phase = e.who === 'enemy' ? 'enemy' : 'player'; S.acting = null;
    if (S.autoBanners) banner(e.who === 'enemy' ? 'ENEMY TURN' : 'YOUR TURN', e.who === 'enemy' ? 'enemy' : 'player');
    return 0;
  };
  H_.play = (e) => {
    const h = heroActor(e.hero), info = cardInfo(e.card);
    if (!h || h.gone) return 0;
    const tgt = e.target ? enemyActor(e.target) : null;
    const hc = heroColor(h.id), b = bodyOf(h);
    if (info.dmg) {
      setPose(h, 'attack');
      const from = restPos(h, _rp).x, living = livingEnemies();
      const tx = tgt ? restPos(tgt, _rp).x : (living.length ? living.reduce((s, x) => s + restPos(x, _rp).x, 0) / living.length : from + 300), dist = tx - from;
      startLunge(h, clamp(dist * (tgt ? 0.55 : 0.4), 56, 250), 0, { wind: 80, dash: 100, hold: 70, ret: 250, hop: 12 });
      burstP(P_SPARK, 6, b.cx - 20, b.cy + 30, 160, 260, 3.2, '#fff8f0', { ang: PI, spread: 0.3, drag: 3, add: true });
      if (info.type === 'power') spawnFx('ringGround', b.x, b.y, { s: 1.1, color: hc });
    } else {
      setPose(h, 'cast');
      const pw = info.type === 'power';
      spawnFx('ringGround', b.x, b.y, { s: pw ? 1.5 : 0.95, color: hc, ms: pw ? 640 : 460 });
      spawnFx('sparkle', b.cx, b.cy - 30, { s: pw ? 1.4 : 0.9, color: hc, follow: h, dx: 0, dy: -30 });
      burstP(P_MOTE, pw ? 16 : 7, b.cx, b.cy, 70, 700, 3.4, hc, { up: 40, drag: 1.2, add: true, spread: 1 });
    }
    if (info.type === 'power') {
      dimStage(0.42, 720, b.cx, b.cy);
      flash(hc, 200, 0.3);
      spawnFx('buff', b.cx, b.cy, { s: 1.5, color: hc, follow: h });
      burstP(P_PETAL, 10, b.cx, b.cy, 150, 1100, 6, '#ffc2dc', { up: 60, ay: 120, drag: 1, front: true });
    }
    return 0;
  };

  // A hit lands after the swing connects. The visual hold (contact - elapsed) is added to the gate.
  H_.hit = (e) => {
    const dst = actorOf(e.dst);
    if (!dst) return 0;
    const atk = e.src ? actorOf(e.src) : null;
    let delay = 0;
    if (atk && atk.atkT0 > -1e8) { const el = S.at - atk.atkT0, c = contactMs(atk); if (el >= 0 && el < c) delay = c - el; }
    if (headless()) delay = 0;
    later(delay, () => impact(e, atk, dst));
    return delay;
  };

  function impact(e, atk, dst) {
    if (dst.gone) return;
    const r = S.rng;
    const el = EL[e.element] ? e.element : 'slash', col = EL[el];
    const amount = fin(e.amount, 0) | 0, blocked = fin(e.blocked, 0) | 0, crit = !!e.crit, killed = !!e.killed, removed = amount > 0, full = !removed && blocked > 0;
    const idx = fin(e.index, 0) | 0, last = idx >= (fin(e.hits, 1) || 1) - 1, heavy = amount >= 15;
    dst.hp = clamp(fin(e.hp, dst.hp), 0, 1e6); dst.maxHp = max(dst.maxHp, dst.hp); dst.block = max(0, fin(e.block, dst.block));
    const b = bodyOf(dst), sc = sizeK(dst), bb = bnd(dst), top = topOf(dst);
    // the direction the blow travels: from the attacker to the target; hook damage strikes an enemy from the left and a hero from the right
    const dirX = atk ? sgn(restPos(dst, { x: 0, y: 0, s: 1, lift: 0 }).x - restPos(atk, { x: 0, y: 0, s: 1, lift: 0 }).x) : (dst.kind === 'enemy' ? 1 : -1);
    // ---- the target reacts
    if (removed) {
      if (!dst.dying) setPose(dst, 'hurt');
      hitFlash(dst);
      recoil(dst, dirX * (150 + min(amount, 40) * 8) * recoilDamp(dst) * (dst.kind === 'hero' ? 1.15 : 1), -28 * recoilDamp(dst));
      squash(dst, min(0.17, 0.05 + amount * 0.004));
    } else if (full) {
      hitFlash(dst);
      recoil(dst, dirX * 70 * recoilDamp(dst), 0);
      spawnFx('shield', b.cx, b.cy, { w: bb.w * b.s, h: bb.h * b.s, s: sc, color: '#5fb4ff', ms: 520 });
      burstP(P_SPARK, 6, b.cx - dirX * bb.w * b.s * 0.3, b.cy, 260, 300, 3, '#bfe4ff', { ang: dirX > 0 ? PI : 0, spread: 0.5, drag: 3, add: true });
      if (last || e.crit) spawnFx('sfxText', b.cx, top + bb.h * b.s * 0.3, { text: 'KIN!', s: 0.6 * sc, ang: (r() - 0.5) * 0.4, layer: 2, ms: 460 });
    }
    // ---- the attacker follows through (a kick on every extra hit of a multi-hit)
    if (atk && idx > 0 && !atk.lunge) recoil(atk, dirX * 130, 0);
    // ---- the element
    const ex = b.cx, ey = b.cy;
    const tilt = (idx % 2 ? 0.75 : -0.12) + (r() - 0.5) * 0.4;                // ART.fx.slash: dir mirrors it for a foe facing left, ang tilts it
    const big = crit ? 1.3 : heavy ? 1.12 : 1;
    if (removed || full) {
      switch (el) {
        case 'fire':
          spawnFx('flame', ex, ey + bb.h * b.s * 0.12, { s: sc * big, color: col.c });
          burstP(P_EMBER, 9, ex, ey, 190, 800, 3.6, (rr) => (rr() > 0.5 ? '#ff9a2e' : '#ffe45e'), { up: 60, ay: -60, drag: 1.4, add: true });
          break;
        case 'ice':
          spawnFx('frost', ex, ey, { s: sc * big, color: col.c });
          burstP(P_SHARD, 8, ex, ey, 260, 700, 5.2, (rr) => (rr() > 0.5 ? '#ffffff' : '#8fdcff'), { ay: 320, drag: 1.2 });
          break;
        case 'lightning':
          spawnFx('lightning', ex + (r() - 0.5) * 60, ey - 300 * sc, { x2: ex, y2: ey, s: sc * big, color: col.c, ms: 380 });
          burstP(P_SPARK, 10, ex, ey, 380, 420, 3.4, '#fffbd0', { drag: 3.2, add: true });
          break;
        case 'poison':
          spawnFx('poison', ex, ey, { s: sc * big, color: col.c });
          burstP(P_BUBBLE, 7, ex, ey, 70, 900, 5, '#c8fff0', { up: 40, drag: 0.8, s1: 9 });
          break;
        case 'ink':
          spawnFx('inkSplash', ex, ey, { s: sc * big, color: col.c });
          burstP(P_INK, 9, ex, ey, 300, 800, 5, '#7a6bff', { ay: 380, drag: 1.2, front: true });
          break;
        case 'holy':
          spawnFx('sparkle', ex, ey, { s: sc * big, color: col.c });
          spawnFx('ring', ex, ey, { s: sc, color: col.c2, ms: 480 });
          burstP(P_MOTE, 9, ex, ey, 120, 800, 3.6, '#fff4c8', { up: 50, drag: 1.2, add: true });
          break;
        default:
          spawnFx('slash', ex, ey, { s: sc * big, color: col.c, dir: dirX, ang: tilt });
          burstP(P_SPARK, 7, ex, ey, 300, 320, 3, '#fff8f0', { ang: dirX > 0 ? 0 : PI, spread: 0.7, drag: 3, add: true });
      }
      spawnFx('burst', ex, ey, { s: sc * (crit ? 1.35 : heavy ? 1.05 : 0.62), color: col.c });
      if (crit) spawnFx('cross', ex, ey, { s: sc * 1.3, color: '#ffffff', dir: dirX, ang: tilt * 0.5 });
      if (dst.kind === 'hero') burstP(P_DOT, 6, ex, ey, 200, 400, 3.4, '#ff8a7a', { drag: 2.4, add: true });
    }
    // ---- numbers
    if (removed) spawnNum(b.cx + (r() - 0.5) * 30 + (idx % 3) * 20 - 20, top + bb.h * b.s * 0.16 - (idx % 3) * 8, amount, crit ? 'crit' : 'dmg', { s: sc * (crit ? 1.15 : heavy ? 1.1 : 0.95), vx: (r() - 0.5) * 50 + dirX * 10 });
    if (blocked > 0) spawnNum(b.cx - dirX * (removed ? 84 : 20), top + bb.h * b.s * (removed ? 0.42 : 0.2), blocked, 'block', { s: sc * (removed ? 0.6 : 0.95), vx: -dirX * 30, rise: removed ? 40 : 60 });
    // ---- big moments
    let mag = 2 + min(amount, 30) * 0.22 + (crit ? 3 : 0) + (killed ? 4 : 0);
    if (dst.kind === 'hero') mag *= 1.25;
    if (isBossActor(dst)) mag *= 1.15;
    mag = min(mag, 14);
    if (removed) shake(mag, 190 + min(amount, 30) * 6); else if (full) shake(1.4, 140);
    if (crit || killed) {
      hitstop(killed ? 90 : 60);
      flash(killed ? '#ffffff' : '#fff4c8', 130, killed ? 0.45 : 0.35);
      if (!rmotion()) {
        spawnFx('impactFrame', ex, ey, { layer: 2, ms: 150 });
        if (!lowQ()) spawnFx('chromatic', W / 2, H / 2, { layer: 2, ms: 240 });
        spawnFx('speedLines', ex, ey, { layer: 2, ms: 300, s: 1.1, color: '#ffffff' });
      }
      zoomPunch(killed ? 0.05 : 0.03, ex, ey, killed ? 340 : 260);
    } else if (heavy && removed) { hitstop(40); zoomPunch(0.014, ex, ey, 220); }
    if (removed && dst.kind === 'hero' && (heavy || amount >= dst.maxHp * 0.25)) spawnFx('vignette', W / 2, H / 2, { layer: 2, ms: 420, color: '#e8383d' });
    if ((crit || killed || (heavy && last)) && removed) spawnFx('sfxText', ex + dirX * 34, top + bb.h * b.s * 0.24, { text: heavy && el === 'slash' && !crit ? 'DON!' : col.word, s: sc * (crit || killed ? 1 : 0.8), ang: (r() - 0.5) * 0.36, layer: 2, ms: 560 });
    if (dst.kind === 'hero' && (dst.hp <= 0)) dst.hp = 0;
    playSfx(sfxForEvent(e), ex);
  }

  H_.dodge = (e) => {
    const a = actorOf(e.dst);
    if (!a) return 0;
    const b = bodyOf(a), dir = a.kind === 'hero' ? -1 : 1;
    a.ghost = lowQ() || rmotion() ? 0 : 260; a.ghostDir = dir;
    recoil(a, dir * 340, 0);
    spawnFx('sfxText', b.cx, topOf(a) + 40, { text: 'MISS', s: 0.55 * sizeK(a), ang: -0.12, layer: 2, ms: 420 });
    burstP(P_SPARK, 5, b.cx, b.cy, 220, 260, 2.6, '#c8fff0', { ang: dir > 0 ? PI : 0, spread: 0.5, drag: 3, add: true });
    return 0;
  };
  H_.thorns = (e) => {
    const dst = actorOf(e.dst), own = actorOf(e.src);
    if (own) { const ob = bodyOf(own); spawnFx('ringGround', ob.x, ob.y, { s: 0.9, color: '#9be34a', ms: 380 }); hitFlash(own); }
    if (!dst) return 0;
    dst.hp = clamp(fin(e.hp, dst.hp), 0, 1e6);
    const b = bodyOf(dst), sc = sizeK(dst);
    if (!dst.dying) setPose(dst, 'hurt');
    hitFlash(dst);
    spawnFx('burst', b.cx, b.cy, { s: sc * 0.7, color: '#9be34a' });
    burstP(P_SHARD, 6, b.cx, b.cy, 240, 500, 4.2, '#9be34a', { ay: 240, drag: 1.4 });
    spawnNum(b.cx, topOf(dst) + 30, fin(e.amount, 0), 'dmg', { s: sc * 0.8 });
    shake(2, 140);
    return 0;
  };
  H_.block = (e) => {
    const a = actorOf(e.dst);
    if (!a) return 0;
    a.block = max(0, fin(e.block, a.block));
    const b = bodyOf(a), bb = bnd(a), sc = sizeK(a);
    if (!a.dying && !(a.kind === 'hero' && a.down)) setPose(a, 'block');
    spawnFx('shield', b.cx, b.cy, { w: bb.w * b.s, h: bb.h * b.s, s: sc, color: '#5fb4ff', ms: 520 });
    if (fin(e.amount, 0) > 0) spawnNum(b.cx, topOf(a) + 24, '+' + e.amount, 'block', { s: sc * 0.95, rise: 60 });
    burstP(P_MOTE, 6, b.cx, b.cy, 90, 600, 3.2, '#bfe4ff', { up: 30, drag: 1.4, add: true });
    return 0;
  };
  H_.block_lost = (e) => {
    const a = actorOf(e.dst);
    if (!a) return 0;
    a.block = 0;
    if (e.cause === 'hit') {
      const b = bodyOf(a);
      burstP(P_SHARD, 10, b.cx, b.cy, 280, 650, 5, (rr) => (rr() > 0.4 ? '#bfe4ff' : '#ffffff'), { ay: 300, drag: 1.1 });
      spawnFx('ring', b.cx, b.cy, { s: sizeK(a) * 0.9, color: '#bfe4ff', ms: 360 });
    }
    return 0;
  };
  H_.heal = (e) => {
    const a = actorOf(e.dst);
    if (!a) return 0;
    a.hp = clamp(fin(e.hp, a.hp), 0, 1e6); a.maxHp = max(a.maxHp, a.hp);
    const b = bodyOf(a), sc = sizeK(a);
    spawnFx('heal', b.cx, b.cy, { s: sc, color: '#7dffb0', follow: a });
    spawnNum(b.cx, topOf(a) + 24, '+' + fin(e.amount, 0), 'heal', { s: sc, rise: 70 });
    burstP(P_MOTE, 7, b.cx, b.cy + 20, 60, 900, 3.6, '#b8ffd2', { up: 50, drag: 0.8, add: true });
    return 0;
  };
  H_.hurt = (e) => {
    const a = actorOf(e.dst);
    if (!a) return 0;
    a.hp = clamp(fin(e.hp, a.hp), 0, 1e6);
    const amount = fin(e.amount, 0);
    if (amount <= 0) return 0;
    const b = bodyOf(a), sc = sizeK(a), poison = e.cause === 'poison', burn = e.cause === 'burn';
    if (!a.dying) setPose(a, 'hurt');
    hitFlash(a);
    recoil(a, (a.kind === 'hero' ? -1 : 1) * 60 * recoilDamp(a), 0);
    if (poison) spawnFx('poison', b.cx, b.cy, { s: sc * 0.8, color: '#3fd6b0' });
    else if (burn) spawnFx('flame', b.cx, b.cy + 20, { s: sc * 0.7, color: '#ff9a2e' });
    else spawnFx('burst', b.cx, b.cy, { s: sc * 0.6, color: '#ffffff' });
    spawnNum(b.cx, topOf(a) + 30, amount, poison ? 'poison' : burn ? 'burn' : 'dmg', { s: sc * 0.85 });
    shake(1.6, 120);
    return 0;
  };
  H_.status = (e) => {
    const a = actorOf(e.dst);
    if (!a) return 0;
    const v = fin(e.value, 0);
    if (v > 0) a.st[e.s] = v; else delete a.st[e.s];
    const delta = fin(e.delta, 0);
    if (!delta) return 0;
    const b = bodyOf(a), sc = sizeK(a), kind = statusKind(e.s), colr = ST_COL[e.s] || (kind === 'debuff' ? '#b58bff' : '#ffe45e');
    if (delta > 0) {
      if (kind === 'debuff') {
        spawnFx('debuff', b.cx, b.cy, { s: sc, color: colr, follow: a });
        if (e.s === 'stun') burstP(P_STAR, 6, b.cx, topOf(a) + 20, 90, 600, 6, '#ffe45e', { up: 40, drag: 1.4, add: true });
      } else {
        spawnFx('buff', b.cx, b.cy, { s: sc, color: colr, follow: a });
        if (a.kind === 'enemy' && S.phase === 'enemy' && !a.dying) { setPose(a, 'buff'); squash(a, 0.07); }
      }
    } else {
      burstP(P_STAR, 4, b.cx, b.cy, 80, 500, 4.5, colr, { up: 30, drag: 1.5 });
    }
    spawnNum(b.cx + (r2(a) - 0.5) * 24, topOf(a) - 8, (delta > 0 ? '+' : '') + delta, 'status', { icon: e.s, s: 1, vx: 0, rise: 46 });
    return 0;
  };
  H_.immune = (e) => {
    const a = actorOf(e.dst);
    if (!a) return 0;
    const b = bodyOf(a);
    spawnFx('sfxText', b.cx, topOf(a) + 30, { text: 'IMMUNE', s: 0.5 * sizeK(a), ang: -0.1, layer: 2, ms: 520 });
    burstP(P_SPARK, 5, b.cx, b.cy, 200, 260, 2.8, '#dfe6f5', { drag: 3, add: true });
    return 0;
  };
  H_.swap = (e) => {
    const f = heroActor(e.front), bk = heroActor(e.back);
    if (!f || !bk) return 0;
    const from = { f: curPos(f, { x: 0, y: 0, s: 1, lift: 0 }), b: curPos(bk, { x: 0, y: 0, s: 1, lift: 0 }) };
    f.row = 'front'; bk.row = 'back';
    hopTo(f, from.f, LAYOUT.hopLift, 60); hopTo(bk, from.b, LAYOUT.hopLiftBack, 0);
    return 0;
  };
  function hopTo(a, from, lift, zb) {
    const to = restPos(a, { x: 0, y: 0, s: 1, lift: 0 });
    if (abs(from.x - to.x) < 2 && abs(from.y - to.y) < 2) { a.hop = null; a.zb = 0; return; }          // already on that mark: no hop on the spot
    a.hop = { t0: S.at, dur: LAYOUT.hopMs, fx: from.x, fy: from.y, fs: from.s, tx: to.x, ty: to.y, ts: to.s, lift: a.down ? 0 : lift, trail: 0 };
    a.zb = zb; a.lunge = null;
    later(LAYOUT.hopMs - 30, () => {
      if (a.gone || a.hop === null) return;
      const p = restPos(a, { x: 0, y: 0, s: 1, lift: 0 });
      spawnFx('ringGround', p.x, p.y, { s: 0.7, color: heroColor(a.id), ms: 340 });
      burstP(P_PUFF, 5, p.x, p.y - 4, 60, 480, 12, '#e6d3a3', { spread: 0.9, drag: 2.6, s1: 26, a: 0.5, front: false, up: 10 });
      if (!a.down) squash(a, 0.1);
    });
  }
  H_.intent = (e) => {
    const a = enemyActor(e.enemy);
    if (!a) return 0;
    const k = e.intent && e.intent.kind ? e.intent.kind : '';
    a.intent = k;
    a.base = k === 'heavy' ? 'telegraph' : 'idle';
    if (!a.dying && (a.pose === 'idle' || a.pose === 'telegraph')) { if (a.pose !== a.base) setPose(a, a.base); }
    return 0;
  };
  H_.enemy_act = (e) => {
    const a = enemyActor(e.enemy);
    if (!a) return 0;
    S.acting = a.id;
    a.atkT0 = S.at;
    setPose(a, 'attack');
    const dmg = e.kind === 'attack' || e.kind === 'multi' || e.kind === 'heavy' || e.kind === 'special';
    const b = bodyOf(a), sc = sizeK(a);
    if (dmg) {
      const dist = restPos(a, _rp).x - LAYOUT.front.x, k = a.size === 'xl' ? 0.28 : a.size === 'l' ? 0.36 : 0.45;
      startLunge(a, -clamp(dist * k, 30, 150), 0, { wind: 140, dash: 110, hold: 60, ret: 280, back: 0.12 });
      burstP(P_PUFF, 4, b.x, b.y - 4, 50, 420, 10, '#e6d3a3', { spread: 0.7, drag: 2.4, s1: 22, a: 0.45, front: false });
      if (e.kind === 'heavy') { shake(3, 260); spawnFx('ringGround', b.x, b.y, { s: 1.2 * sc, color: '#ff5a3a', ms: 420 }); }
    } else {
      squash(a, 0.06);
    }
    if (e.say) shout(a.id, e.say);
    else if ((e.kind === 'heavy' || a.tier === 'boss') && e.name) spawnNum(b.cx, topOf(a) - 6, e.name, 'caption', { rise: 24, ms: 1000 });
    return 0;
  };
  H_.skip = (e) => {
    const a = actorOf(e.unit);
    if (!a) return 0;
    const b = bodyOf(a);
    recoil(a, 110, 0);
    spawnNum(b.cx, topOf(a) - 6, 'Stunned', 'caption', { rise: 22, ms: 900 });
    return 0;
  };
  H_.summon = (e) => {
    const u = e.enemy;
    if (!u || u.id === undefined || S.emap[u.id]) return 0;
    const a = makeEnemy(u, u.lane);
    addActor(a);
    a.enter = { t0: S.at, dur: rmotion() ? 200 : 460, dx: 0, dy: rmotion() ? 0 : 34 };
    a.alpha = 0;
    const p = restPos(a, { x: 0, y: 0, s: 1, lift: 0 }), sc = sizeK(a);
    spawnFx('inkSplash', p.x, p.y - 6, { s: sc * 0.9, color: '#7a6bff', layer: 0 });
    spawnFx('ringGround', p.x, p.y, { s: sc, color: '#b58bff', ms: 480 });
    spawnFx('burst', p.x, p.y - bnd(a).h * 0.4, { s: sc * 0.7, color: '#b58bff' });
    burstP(P_INK, 8, p.x, p.y - 10, 200, 700, 4.5, '#8e8aa3', { ay: 260, drag: 1.4, up: 90 });
    burstP(P_PETAL, 5, p.x, p.y - 20, 100, 1000, 5, '#ffc2dc', { up: 80, ay: 90, drag: 1 });
    const who = S.acting ? enemyActor(S.acting) : null;
    if (who && !who.dying) { setPose(who, 'buff'); squash(who, 0.07); }
    return 0;
  };
  H_.enemy_phase = (e) => {
    const a = enemyActor(e.enemy);
    if (!a) return 0;
    const b = bodyOf(a), sc = sizeK(a);
    const idx = fin(e.index, a.phase + 1) | 0;
    // the form changes in the middle of the flash, so the swap of art is hidden
    later(rmotion() ? 0 : 260, () => { a.phase = idx; });
    setPose(a, 'buff');
    squash(a, 0.14);
    flash('#ffffff', 260, 0.75);
    shake(15, 700);
    zoomPunch(0.05, b.cx, b.cy, 500);
    hitstop(80);
    spawnFx('ringGround', b.x, b.y, { s: 2.4 * sc, color: '#ffffff', ms: 620 });
    spawnFx('ring', b.cx, b.cy, { s: 2 * sc, color: '#ff5a5a', ms: 760, delay: 120 });
    spawnFx('speedLines', b.cx, b.cy, { layer: 2, ms: 620, s: 1.2, color: '#ffffff', kind: 'full', w: W, h: H });
    spawnFx('vignette', W / 2, H / 2, { layer: 2, ms: 900, color: '#e8383d' });
    spawnFx('sfxText', b.cx, topOf(a) + bnd(a).h * b.s * 0.3, { text: 'GOGOGO', s: 1.2, ang: -0.08, layer: 2, ms: 900, delay: 160 });
    burstP(P_EMBER, 22, b.cx, b.cy, 340, 1100, 4.5, (rr) => (rr() > 0.5 ? '#ff5a3a' : '#ffe45e'), { up: 100, ay: -40, drag: 1.2, add: true });
    if (e.say) shout(a.id, e.say);
    return 0;
  };
  H_.death = (e) => {
    const a = actorOf(e.unit);
    if (!a || a.kind !== 'enemy' || a.dying) return 0;
    const boss = a.tier === 'boss', elite = a.tier === 'elite', b = bodyOf(a), sc = sizeK(a), bb = bnd(a);
    a.dying = true; a.hp = 0; a.deathT0 = S.at; a.poseScale = boss ? 0.42 : elite ? 0.62 : 1; a.lunge = null; a.base = 'die';
    a.deathDur = 700 / a.poseScale + (boss ? 500 : 160);
    setPose(a, 'die');
    delete S.targetable[a.id];
    if (S.hover && S.hover.id === a.id) S.hover = null;
    const wsz = bb.w * b.s;
    burstP(P_PETAL, boss ? 40 : elite ? 22 : 12, b.cx, b.cy, boss ? 280 : 190, 1500, 6.5, (rr) => (rr() > 0.4 ? '#ffc2dc' : '#ffffff'), { up: 90, ay: 70, drag: 1, jit: wsz * 0.5 });
    // the creature releases the sounds it ate: grey hush motes, then bright notes in the seven-step hue ramp rising out of it
    burstP(P_INK, boss ? 14 : 6, b.cx, b.cy, 220, 900, 5, '#8e8aa3', { ay: 300, drag: 1.1, up: 60, jit: wsz * 0.4 });
    burstP(P_NOTE, boss ? 22 : 9, b.cx, b.cy, 150, 1900, 11, (rr) => HUE_RAMP[(rr() * HUE_RAMP.length) | 0], { up: 150, ay: -40, drag: 0.7, s1: 8, jit: wsz * 0.5, add: false });
    burstP(P_STAR, boss ? 14 : 6, b.cx, b.cy, 200, 1200, 5.5, (rr) => HUE_RAMP[(rr() * HUE_RAMP.length) | 0], { up: 100, ay: -30, drag: 0.9, add: true, jit: wsz * 0.5 });
    burstP(P_MOTE, boss ? 24 : 10, b.cx, b.cy, 90, 1700, 4.5, '#fff4c8', { up: 120, ay: -50, drag: 0.6, add: true, jit: wsz * 0.5 });
    spawnFx('petals', b.cx, b.cy, { s: sc * (boss ? 2 : 1.1), color: '#ff9cc6', ms: 1300 });
    spawnFx('inkSplash', b.x, b.y - 8, { s: sc * 1.1, color: '#7a6bff', layer: 0, ms: 900 });
    if (boss) {
      flash('#ffffff', 420, 0.8);
      shake(16, 1500);
      hitstop(140);
      spawnFx('impactFrame', b.cx, b.cy, { layer: 2, ms: 180 });
      spawnFx('ring', b.cx, b.cy, { s: 3.2, color: '#ffffff', ms: 900 });
      spawnFx('vignette', W / 2, H / 2, { layer: 2, ms: 1400, color: '#ffffff' });
      for (let i = 1; i <= 7; i++) {
        const ox = (S.rng() - 0.5) * wsz * 0.8, oy = (S.rng() - 0.5) * bb.h * b.s * 0.7;
        later(rmotion() ? 0 : i * 170, () => { spawnFx('burst', b.cx + ox, b.cy + oy, { s: sc * 0.9, color: '#ffe9a8' }); burstP(P_PETAL, 6, b.cx + ox, b.cy + oy, 180, 1200, 6, '#ffc2dc', { up: 70, ay: 70, drag: 1 }); shake(6, 240); });
      }
    } else if (elite) { shake(7, 400); flash('#ffe9a8', 200, 0.3); }
    later(a.deathDur, () => { a.gone = true; });
    return 0;
  };
  H_.flee = (e) => {
    const a = actorOf(e.unit);
    if (!a || a.kind !== 'enemy') return 0;
    a.fled = true; a.flee = { t0: S.at, dur: 520, dx: 240 }; a.lunge = null;
    delete S.targetable[a.id];
    const b = bodyOf(a);
    burstP(P_PUFF, 6, b.x, b.y - 4, 90, 520, 14, '#e6d3a3', { spread: 0.9, drag: 2.2, s1: 30, a: 0.55, front: false });
    return 0;
  };
  H_.hero_down = (e) => {
    const h = heroActor(e.hero);
    if (!h) return 0;
    h.down = true; h.hp = 0; h.block = 0; h.st = {}; h.base = 'down'; h.lunge = null;
    setPose(h, 'down');
    const b = bodyOf(h);
    hitFlash(h);
    shake(7, 400);
    flash('#e8383d', 240, 0.32);
    spawnFx('ringGround', b.x, b.y, { s: 1.3, color: '#b0245c', ms: 600 });
    burstP(P_PETAL, 12, b.cx, b.cy, 120, 1600, 6, '#ff9cc6', { up: 60, ay: 90, drag: 1 });
    burstP(P_MOTE, 8, b.cx, b.cy + 20, 50, 1500, 4, '#c4a0ff', { up: 80, ay: -30, drag: 0.6, add: true });
    return 0;
  };
  H_.hero_revive = (e) => {
    const h = heroActor(e.hero);
    if (!h) return 0;
    h.down = false; h.hp = max(1, fin(e.hp, 1)); h.maxHp = max(h.maxHp, h.hp); h.base = 'idle';
    setPose(h, 'cheer');
    const b = bodyOf(h);
    spawnFx('heal', b.cx, b.cy, { s: 1.5, color: '#ffe9a8', follow: h });
    spawnFx('ringGround', b.x, b.y, { s: 1.6, color: '#ffe9a8', ms: 640 });
    spawnFx('sparkle', b.cx, b.cy, { s: 1.5, color: '#ffffff' });
    flash('#ffe9a8', 240, 0.4);
    burstP(P_MOTE, 16, b.cx, b.cy + 30, 90, 1200, 4, '#fff4c8', { up: 140, ay: -20, drag: 0.8, add: true });
    burstP(P_PETAL, 8, b.cx, b.cy, 130, 1200, 6, '#ffc2dc', { up: 100, ay: 80, drag: 1 });
    squash(h, 0.1);
    return 0;
  };
  H_.max_hp = (e) => {
    const h = heroActor(e.hero);
    if (!h) return 0;
    const n = fin(e.n, 0);
    h.maxHp += n; if (!h.down) h.hp += n;
    const b = bodyOf(h);
    spawnFx('sparkle', b.cx, b.cy, { s: 1.1, color: '#b8ffd2' });
    spawnNum(b.cx, topOf(h) + 24, '+' + n + ' max', 'caption', { rise: 40, ms: 1100 });
    return 0;
  };
  H_.relic = () => { flash('#f5c96a', 160, 0.18); return 0; };
  H_.end = (e) => {
    S.phase = 'over'; S.aim = null; S.hover = null; S.targetable = {};
    if (e.result === 'win') {
      S.win = true;
      S.actors.forEach((a) => {
        if (a.kind === 'hero' && !a.down && !a.gone) { a.base = 'cheer'; setPose(a, 'cheer'); const b = bodyOf(a); spawnFx('sparkle', b.cx, b.cy - 40, { s: 1.2, color: '#ffe9a8' }); squash(a, 0.08); }
      });
      flash('#ffe9a8', 300, 0.3);
      const r = S.rng, n = pcount(46);
      for (let i = 0; i < n; i++) spawnP(P_PETAL, r() * W, -20 - r() * 260, (r() - 0.5) * 80, 60 + r() * 90, 2600 + r() * 1400, 6 + r() * 4, r() > 0.35 ? '#ffc2dc' : '#ffffff', { ay: 20, drag: 0.2, rot: r() * TAU, vr: (r() - 0.5) * 5, delay: r() * 500 });
    } else {
      S.lose = true; S.inkFadeT0 = S.at;
      spawnFx('vignette', W / 2, H / 2, { layer: 2, ms: 900, color: '#140f2e' });
    }
    return 0;
  };
  H_.draw = () => 0;
  H_.shuffle = () => 0;
  H_.discard = () => 0;
  H_.exhaust = () => 0;
  H_.energy = () => 0;
  H_.turn_end = () => 0;
  H_.add_card = () => 0;
  H_.card_move = () => 0;
  H_.card_upgrade = () => 0;
  H_.retain = () => 0;
  H_.pick_needed = () => 0;
  H_.gold = () => 0;
  H_.ink = () => 0;

  // ==================================================================================================================
  // play, update, mount, flush
  // ==================================================================================================================
  function sfxX(e) {
    const ref = e.hero ? { kind: 'hero', id: e.hero } : e.dst || e.unit || null;
    const a = ref ? actorOf(typeof ref === 'object' ? ref : { kind: 'hero', id: ref }) : null;
    return a ? restPos(a, _rp).x : undefined;
  }
  function play(evt, next) {
    if (!S.mounted || !evt || typeof evt.type !== 'string') return Promise.resolve();
    const look = arguments.length > 1;
    const idx = S.evi++;
    S.rng = U.rng(U.hash(S.seed, 'fx', idx));
    let hold = 0;
    try {
      const h = H_[evt.type];
      if (h) hold = fin(h(evt), 0);
      if (evt.type !== 'hit') playSfx(sfxForEvent(evt), sfxX(evt));
    } catch (e) { warnOnce('event:' + evt.type, e); }
    const base = gateMs(evt, S.prev, next, look);
    S.prev = evt;
    return gatePromise(base + hold);
  }

  function update(dt) {
    if (!S.mounted) return;
    dt = clamp(fin(dt, 0), 0, 0.05);
    let step = dt;
    if (S.freeze > 0) { const used = min(S.freeze, dt * 1000); S.freeze -= used; step = dt - used / 1000; }       // hit-stop freezes the animation clock
    const sdt = step * speedK;
    S.lt += step;
    S.at += sdt * 1000;
    const ptx = rmotion() ? 0 : clamp((S.ptr.x - W / 2) / (W / 2), -1, 1) * 7;
    S.par += (ptx - S.par) * min(1, dt * 5);
    let gone = false;
    for (let i = 0; i < S.actors.length; i++) {
      const a = S.actors[i];
      updSlides(a); updLunge(a); updPhysics(a, sdt); updPose(a); auraTick(a, sdt);
      a.ox = a.lx + a.ex; a.oy = a.ly + a.ey;
      if (a.hop && !a.down && !rmotion()) {
        a.hop.trail += sdt * 1000;
        if (a.hop.trail > 42) { a.hop.trail = 0; const p = curPos(a, _rp), r = a.arng; spawnP(P_STAR, p.x + (r() - 0.5) * 40, p.y - 20 - r() * 130, (r() - 0.5) * 30, -20, 420, 5 + r() * 3, heroColor(a.id), { add: true, drag: 1 }); }
      }
      a.z = zOf(a);
      if (a.gone) gone = true;
    }
    if (gone) removeGone();
    S.order.sort(cmpZ);
    for (let i = 0; i < S.fx.length; i++) { const f = S.fx[i]; if (f.on && S.at >= f.t0 + f.ms) f.on = false; }         // expired effects and numbers free their slots even when nothing is drawing
    for (let i = 0; i < S.nums.length; i++) { const n = S.nums[i]; if (n.on && S.at >= n.t0 + n.ms) n.on = false; }
    if (S.flashes.length) S.flashes = S.flashes.filter((f) => S.at < f.t0 + f.dur);
    if (S.banners.length) S.banners = S.banners.filter((b) => S.at < b.t0 + b.dur);
    if (S.shouts.length) S.shouts = S.shouts.filter((x) => (S.lt - x.t0) * 1000 < x.ms);
    for (const id in S.barks) if ((S.lt - S.barks[id].t0) * 1000 >= S.barks[id].ms) delete S.barks[id];
    // particles
    const ms = sdt * 1000;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = PART[i];
      if (!p.on) continue;
      p.age += ms;
      if (p.age < 0) continue;
      if (p.age >= p.life) { p.on = false; continue; }
      const kd = 1 - min(1, p.drag * sdt);
      p.vx *= kd; p.vy = p.vy * kd + p.ay * sdt;
      p.x += p.vx * sdt; p.y += p.vy * sdt; p.rot += p.vr * sdt;
    }
    // aim arrow fades when released
    if (S.aim && !S.aim.on) { S.aim.alpha -= dt * 8; if (S.aim.alpha <= 0) S.aim = null; }
    else if (S.aim) S.aim.alpha = min(1, S.aim.alpha + dt * 10);
    runTimers();
  }
  function removeGone() {
    S.actors = S.actors.filter((a) => !a.gone);
    S.order = S.order.filter((a) => !a.gone);
    Object.keys(S.hmap).forEach((k) => { if (S.hmap[k].gone) delete S.hmap[k]; });
    Object.keys(S.emap).forEach((k) => { if (S.emap[k].gone) delete S.emap[k]; });
  }

  function normalizeEnemies(list) {
    const n = list.length, out = [];
    list.forEach((it, i) => {
      const u = typeof it === 'string' ? { def: it } : Object.assign({}, it);
      u.def = u.def || (u.id ? String(u.id).split('#')[0] : 'kappa');
      if (!u.id) { S.enemySerial[u.def] = (S.enemySerial[u.def] || 0) + 1; u.id = u.def + '#' + S.enemySerial[u.def]; }
      if (u.lane === undefined) u.lane = n >= 5 ? i : (u.tier === 'boss' || (DATA.enemies[u.def] && DATA.enemies[u.def].tier === 'boss') ? 4 : 5 - n + i);
      out.push(u);
    });
    return out;
  }
  function mount(o) {
    if (S.mounted) unmount();
    resetState();
    o = o || {};
    const C = o.C || null;
    applyLayout(o.layout);
    S.C = C;
    S.seed = C && C.seed !== undefined ? C.seed : (o.seed !== undefined ? o.seed : 1);
    S.rng = U.rng(U.hash(S.seed, 'fx', 'mount')); S.arng = U.rng(U.hash(S.seed, 'amb'));
    S.chapter = clamp(fin(o.chapter || (C && C.chapter), 1) | 0, 1, 3);
    S.boss = o.boss !== undefined ? !!o.boss : !!(C && C.tier === 'boss');
    S.sceneId = (S.boss ? 'boss' : 'ch') + S.chapter;
    S.autoBanners = !!o.banners;
    S.mounted = true;
    const heroes = C && C.heroes ? C.heroes : (o.heroes || ['hanae', 'kuro']).map((h, i) => (typeof h === 'string' ? { id: h, row: i === 0 ? 'front' : 'back' } : h));
    heroes.forEach((u, i) => addActor(makeHero(u, i)));
    const enemies = C && C.enemies ? C.enemies.filter((u) => !u.down && !u.fled) : normalizeEnemies(o.enemies || []);
    enemies.forEach((u, i) => addActor(makeEnemy(u, u.lane !== undefined ? u.lane : 5 - enemies.length + i)));
    S.fit = lineFit();
    if (!o.instant && !headless()) {
      const rm = rmotion();
      S.actors.forEach((a) => {
        if (a.kind === 'hero') a.enter = { t0: a.row === 'front' ? 0 : 90, dur: 560, dx: rm ? 0 : -230, dy: 0 };
        else a.enter = { t0: 150 + a.lane * 55, dur: 420, dx: rm ? 0 : 70, dy: 0 };
      });
    }
    const A = AR();
    if (A && A.hero && typeof A.hero.warm === 'function') heroes.forEach((u) => { try { A.hero.warm(u.id, u.row === 'back' ? LAYOUT.back.s : LAYOUT.front.s); } catch (e) { warnOnce('warm', e); } });
    S.actors.forEach((a) => { a.z = zOf(a); });
    S.order.sort(cmpZ);
  }
  function unmount() {
    if (!S.mounted) return;
    const ts = S.timers.slice();
    S.mounted = false;
    S.timers.length = 0;
    ts.forEach((t) => { if (t.gate) { try { t.fn(); } catch (e) { /* a resolver never throws */ } } });      // pending gates resolve, nothing rejects
    resetState();
    applyLayout(null);
  }
  function flush() {
    if (!S.mounted) return;
    S.flushing = true;
    try {
      for (let guard = 0; guard < 4000 && S.timers.length; guard++) {
        let best = 0;
        for (let i = 1; i < S.timers.length; i++) { const t = S.timers[i], b = S.timers[best]; if (t.at < b.at || (t.at === b.at && t.seq < b.seq)) best = i; }
        const t = S.timers.splice(best, 1)[0];
        if (t.at > S.at) S.at = t.at;
        try { t.fn(); } catch (e) { warnOnce('flush', e); }
      }
      S.actors.forEach((a) => {
        a.lunge = null; a.lx = 0; a.ly = 0; a.hop = null; a.zb = 0; a.enter = null; a.ex = 0; a.ey = 0; a.ox = 0; a.oy = 0;
        a.rx = 0; a.rv = 0; a.ry = 0; a.ryv = 0; a.sq = 0; a.sx = 1; a.sy = 1; a.flash = 0; a.ghost = 0; a.alpha = 1;
        if (a.flee || a.dying) { a.gone = true; a.flee = null; }
        if (a.pose !== 'die') {
          const hold = a.base === 'down' || a.base === 'cheer' || a.base === 'telegraph';
          a.pose = a.base; a.poseT0 = hold ? S.at - 5000 : S.at; a.poseDur = 0;
        }
      });
      S.fx.forEach((f) => { f.on = false; }); S.nums.forEach((n) => { n.on = false; });
      for (let i = 0; i < MAX_PARTICLES; i++) PART[i].on = false;
      S.flashes.length = 0; S.shk.mag = 0; S.freeze = 0; S.zoom.k = 0; S.dim.a = 0;
    } finally { S.flushing = false; }
    removeGone();
  }

  // ==================================================================================================================
  // input side: targets, hover, aim, view state, speed
  // ==================================================================================================================
  const xy = (v) => (Array.isArray(v) ? { x: fin(v[0]), y: fin(v[1]) } : v && typeof v === 'object' ? { x: fin(v.x), y: fin(v.y) } : null);
  function setTargetable(ids) {
    const m = {};
    (Array.isArray(ids) ? ids : []).forEach((id) => { m[id] = true; });
    S.targetable = m;
  }
  function setHover(kind, id) {
    if (!S.mounted) return;
    S.hover = id === undefined || id === null || kind === null || kind === undefined ? null : { kind, id };
  }
  function aim(from, to, targetId) {
    if (!S.mounted) return;
    const f = xy(from), t = xy(to);
    if (t) { S.ptr.x = t.x; S.ptr.y = t.y; }
    if (!f) { if (S.aim) S.aim.on = false; return; }
    if (!t) return;
    if (!S.aim) S.aim = { fx: f.x, fy: f.y, tx: t.x, ty: t.y, target: null, alpha: 0, on: true, t0: S.lt };
    const A = S.aim;
    A.fx = f.x; A.fy = f.y; A.tx = t.x; A.ty = t.y; A.target = targetId === undefined ? null : targetId; A.on = true;
  }
  function setViewState(id, v) {
    if (!S.mounted || !v || typeof v !== 'object') return;
    const a = S.hmap[id] || S.emap[id];
    if (!a || a.gone) return;
    if (v.maxHp !== undefined) a.maxHp = max(1, fin(v.maxHp, a.maxHp));
    if (v.hp !== undefined) { a.hp = clamp(fin(v.hp, a.hp), 0, 1e6); a.maxHp = max(a.maxHp, a.hp); }
    if (v.block !== undefined) a.block = max(0, fin(v.block, 0));
    if (v.st && typeof v.st === 'object') a.st = copySt(v.st);
    if (v.phase !== undefined) a.phase = fin(v.phase, 0) | 0;
    if (v.row !== undefined && a.kind === 'hero' && (v.row === 'front' || v.row === 'back')) { a.row = v.row; a.hop = null; a.zb = 0; }
    if (v.intent !== undefined && a.kind === 'enemy' && !a.dying) {
      const k = typeof v.intent === 'string' ? v.intent : (v.intent && v.intent.kind) || '';
      a.intent = k; a.base = k === 'heavy' ? 'telegraph' : 'idle';
      if (a.pose === 'idle' || a.pose === 'telegraph') { a.pose = a.base; a.poseT0 = S.at; a.poseDur = 0; }
    }
    if (v.down !== undefined && a.kind === 'hero') {
      if (v.down && !a.down) { a.down = true; a.hp = 0; a.block = 0; a.st = {}; a.base = 'down'; a.pose = 'down'; a.poseT0 = S.at - 5000; a.poseDur = 0; }
      else if (!v.down && a.down) { a.down = false; a.base = 'idle'; a.pose = 'idle'; a.poseT0 = S.at; a.poseDur = 0; }
    }
  }
  function autoBanners(on) {
    if (on === undefined) return S.autoBanners;
    S.autoBanners = !!on;
    return S.autoBanners;
  }
  function speed(k) {
    if (k === undefined) return speedK;
    speedK = clamp(fin(k, 1), 0.25, 4);
    return speedK;
  }

  // ==================================================================================================================
  // introspection (tests, tooling)
  // ==================================================================================================================
  function actorInfo(kind, id) {
    const a = findActor(kind, id) || (S.mounted ? (kind === 'hero' ? S.hmap[id] : S.emap[id]) : null);
    if (!a) return null;
    const p = livePos(a, { x: 0, y: 0, s: 1, lift: 0, cx: 0, cy: 0 }), r = restPos(a, { x: 0, y: 0, s: 1, lift: 0 });
    return {
      kind: a.kind, id: a.id, def: a.def, pose: a.pose, base: a.base, poseAgeMs: S.at - a.poseT0, hp: a.hp, maxHp: a.maxHp, block: a.block, st: Object.assign({}, a.st), down: a.down, dying: a.dying, fled: a.fled, gone: a.gone,
      row: a.row, lane: a.lane, phase: a.phase, tier: a.tier, size: a.size, intent: a.intent, x: p.x, y: p.y, s: p.s, restX: r.x, restY: r.y, ox: a.ox, oy: a.oy, rx: a.rx, alpha: a.alpha, flash: a.flash,
      lunging: !!a.lunge, hopping: !!a.hop, ghost: a.ghost,
    };
  }
  function stats() {
    let particles = 0, fx = 0, nums = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) if (PART[i].on) particles++;
    S.fx.forEach((f) => { if (f.on) fx++; });
    S.nums.forEach((n) => { if (n.on) nums++; });
    return {
      mounted: S.mounted, at: S.at, lt: S.lt, particles, fx, numbers: nums, timers: S.timers.length, gates: S.timers.filter((t) => t.gate).length,
      banners: S.banners.map((b) => ({ style: b.style, text: b.text, sub: b.sub })), bubbles: Object.keys(S.barks), shouts: S.shouts.map((s) => s.id),
      shake: shakeMag(), freeze: S.freeze, speed: speedK, zoom: zoomNow(), dim: dimNow(), flashes: S.flashes.length, events: S.evi, phase: S.phase, sceneId: S.sceneId, boss: S.boss, chapter: S.chapter, fit: S.fit,
      aim: S.aim ? { on: S.aim.on, gold: !!S.aim.target, target: S.aim.target } : null, targetable: Object.keys(S.targetable), hover: S.hover ? { kind: S.hover.kind, id: S.hover.id } : null,
      actors: S.actors.filter((a) => !a.gone).length, drawErrors: S.drawErrors, win: S.win, lose: S.lose,
    };
  }
  // a hash of everything visible: two runs of the same event stream must give the same number
  function signature() {
    let h = 2166136261;
    const mix = (v) => { h ^= (Math.round(fin(v, 0) * 100) | 0); h = Math.imul(h, 16777619); };
    mix(S.at); mix(S.lt); mix(shakeMag());
    S.actors.forEach((a) => { mix(a.ox); mix(a.oy); mix(a.rx); mix(a.hp); mix(a.block); mix(a.flash); mix(a.alpha); mix(U.hashStr(a.pose) % 1000); mix(a.poseT0); });
    for (let i = 0; i < MAX_PARTICLES; i++) { const p = PART[i]; if (p.on) { mix(p.x); mix(p.y); mix(p.age); mix(p.k); } }
    S.fx.forEach((f) => { if (f.on) { mix(f.t0); mix(f.o.x); mix(f.o.y); mix(f.o.seed % 1000); } });
    S.nums.forEach((n) => { if (n.on) { mix(n.x); mix(n.y); mix(n.seed % 1000); } });
    return h >>> 0;
  }

  // ==================================================================================================================
  // drawing
  // ==================================================================================================================
  const AMBIENT = true;                            // SCENE owns the ambient particles (ART.scene.draw is called with particles:false)
  function guard(ctx, name, fn) {
    ctx.save();
    try { fn(); } catch (e) { S.drawErrors++; warnOnce('draw.' + name, e); } finally { ctx.restore(); }
  }
  const sceneIsReal = (id) => {
    const A = AR();
    if (!A || !A.scene || typeof A.scene.draw !== 'function') return false;
    if (typeof A.has === 'function' && A.has('scene', id)) return true;
    return Function.prototype.toString.call(A.scene.draw).length > 900;      // the art.js placeholder is one short function
  };

  // ---- backdrop -------------------------------------------------------------------------------------------------------
  function paintFallback(g, id) {
    const T = TK(), boss = id.charAt(0) === 'b', ch = +id.charAt(id.length - 1) || 1, rr = U.rng(U.hash('scene-fb', id));
    T.sky(g, 0, 0, W, 540, ch === 2 ? 'night' : ch === 3 ? (boss ? 'crimson' : 'storm') : (boss ? 'dusk' : 'golden'));
    if (ch === 2) T.moon(g, 900, 130, 46, { glow: 0.6, phase: 0.1 });
    if (ch === 1) {
      for (let i = 0; i < 26; i++) {                                    // far and near bamboo
        const x = rr() * W, w = 8 + rr() * 12, near = i % 3 === 0, top = near ? -10 : 120 + rr() * 150;
        g.fillStyle = near ? 'rgba(46,60,46,0.7)' : 'rgba(96,110,80,0.35)'; g.fillRect(x, top, w, 540 - top);
        g.fillStyle = 'rgba(20,15,46,0.35)';
        for (let k = 0; k < 6; k++) g.fillRect(x - 1, top + 40 + k * 70 + rr() * 20, w + 2, 3);
      }
    } else if (ch === 2) {
      for (let i = 0; i < 12; i++) {                                    // rooftops and lantern glows
        const x = i * 110 - 30 + rr() * 30, h = 90 + rr() * 110;
        g.fillStyle = 'rgba(14,10,36,0.9)'; g.beginPath(); g.moveTo(x, 540); g.lineTo(x, 540 - h); g.lineTo(x + 55, 540 - h - 34); g.lineTo(x + 110, 540 - h); g.lineTo(x + 110, 540); g.fill();
        T.glow(g, x + 30 + rr() * 50, 540 - h * 0.5, 34, '#ff9a2e', 0.6);
      }
    } else {
      for (let i = 0; i < 7; i++) {                                     // floating stones under a storm
        const x = 60 + i * 190 + rr() * 60, y = 120 + rr() * 220, w = 60 + rr() * 90;
        g.fillStyle = 'rgba(30,10,36,0.85)'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y + 6); g.lineTo(x + w * 0.7, y + 34 + rr() * 30); g.lineTo(x + w * 0.2, y + 22); g.fill();
      }
      g.fillStyle = 'rgba(20,6,26,0.9)'; g.fillRect(560, 250, 40, 290); g.fillRect(620, 200, 50, 340); g.fillRect(690, 270, 36, 270);
    }
    const gr = g.createLinearGradient(0, 520, 0, H);
    gr.addColorStop(0, ch === 2 ? '#1a1340' : ch === 3 ? '#2a1024' : '#3a2a3c'); gr.addColorStop(1, '#0d0b1e');
    g.fillStyle = gr; g.fillRect(0, 520, W, H - 520);
    g.fillStyle = 'rgba(255,233,168,0.18)'; g.fillRect(0, 519, W, 2);
    T.paperGrain(g, 0, 0, W, H, { alpha: 0.35 });
    T.vignette(g, W, H, { color: '#0d0b1e', alpha: boss ? 0.7 : 0.5 });
  }
  function drawBackdrop(ctx) {
    const A = AR(), T = TK(), id = S.sceneId;
    const px = rmotion() ? 0 : S.par * 1.6;
    ctx.translate(W / 2, H / 2); ctx.scale(1.035, 1.035); ctx.translate(-W / 2, -H / 2);          // overscan: shake and parallax never show an edge
    ctx.translate(px, 0);
    let done = false;
    if (sceneIsReal(id)) { try { A.scene.draw(ctx, id, W, H, S.lt, { particles: !AMBIENT, parallaxX: px }); done = true; } catch (e) { warnOnce('ART.scene.draw', e); } }
    if (!done && A && T) {
      A.blit(ctx, A.sprite('scene|fb|' + id, W, H, (g) => paintFallback(g, id)), -20, 0, W + 40, H);
      T.mist(ctx, 0, 300, W, 260, S.lt, { n: 5, seed: S.chapter, alpha: 0.1, color: S.chapter === 3 ? '#ff9ac8' : '#f3e6c8' });
    }
  }

  // ---- ambient particles (pure functions of the loop clock, so they cost no pool slots) -------------------------------
  function drawAmbient(ctx, front) {
    if (!AMBIENT) return;
    const T = TK(), t = S.lt, m = rmotion() ? 0.3 : (lowQ() ? 0.55 : 1), sd = S.chapter * 977 + (S.boss ? 31 : 0), ga = ctx.globalAlpha;
    const cnt = (n) => max(front ? 1 : 2, Math.round(n * m));
    const wrap = (v, n) => ((v % n) + n) % n;
    if (S.chapter === 1) {
      const n = front ? cnt(5) : cnt(16);
      for (let i = 0; i < n; i++) {                                         // bamboo leaves on the wind, fireflies in the dusk
        const v1 = vs(sd, i * 4 + (front ? 100 : 0)), v2 = vs(sd, i * 4 + 1 + (front ? 100 : 0)), v3 = vs(sd, i * 4 + 2 + (front ? 100 : 0));
        const x = wrap(v1 * (W + 120) + t * (front ? 46 : 20 + v2 * 24), W + 120) - 60, y = wrap(v2 * (H + 80) + t * (front ? 34 : 16 + v3 * 22), H + 80) - 40, rot = t * (0.8 + v3) + v1 * 6, sz = front ? 12 + v3 * 8 : 4 + v3 * 5;
        ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha = ga * (front ? 0.42 : 0.7);
        ctx.beginPath(); ctx.ellipse(0, 0, sz * 1.9, sz * 0.5, 0, 0, TAU); ctx.fillStyle = boss() ? '#8a5a7a' : (v2 > 0.5 ? '#b5d86a' : '#8fbf5a'); ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(20,15,46,0.5)'; ctx.stroke(); ctx.restore();
      }
      if (!front) for (let i = 0; i < cnt(11); i++) {
        const v1 = vs(sd, 300 + i), v2 = vs(sd, 340 + i), a = 0.5 + 0.5 * sin(t * (0.9 + v2) + v1 * 9);
        T.glow(ctx, v1 * W + sin(t * 0.4 + i) * 40, 300 + v2 * 240 + cos(t * 0.5 + i * 2) * 26, 9 + v2 * 8, boss() ? '#ff9ac8' : '#ffe9a8', 0.75 * a);
      }
    } else if (S.chapter === 2) {
      const n = front ? cnt(4) : cnt(14);
      for (let i = 0; i < n; i++) {                                         // paper charms fluttering, lantern embers rising
        const v1 = vs(sd, i * 3 + (front ? 90 : 0)), v2 = vs(sd, i * 3 + 1 + (front ? 90 : 0)), v3 = vs(sd, i * 3 + 2 + (front ? 90 : 0));
        if (i % 2 === 0 || front) {
          const x = wrap(v1 * (W + 100) + t * (12 + v2 * 14) + sin(t * 1.3 + i) * 24, W + 100) - 50, y = wrap(v2 * (H + 60) - t * (10 + v3 * 12), H + 60) - 30;
          ctx.save(); ctx.translate(x, y); ctx.rotate(sin(t * 1.6 + i) * 0.7); ctx.globalAlpha = ga * (front ? 0.4 : 0.75);
          ctx.fillStyle = '#f3e6c8'; ctx.fillRect(-4, -9, 8, 18); ctx.fillStyle = '#e8383d'; ctx.fillRect(-1.5, -6, 3, 9); ctx.strokeStyle = '#140f2e'; ctx.lineWidth = 1; ctx.strokeRect(-4, -9, 8, 18); ctx.restore();
        } else {
          const x = v1 * W + sin(t * 0.7 + i) * 20, y = wrap(v2 * H * 0.9 - t * (22 + v3 * 20), H * 0.9) + 30;
          T.glow(ctx, x, y, 7 + v3 * 5, '#ff9a2e', 0.8 * (0.5 + 0.5 * sin(t * 3 + i)));
        }
      }
      if (!front) for (let i = 0; i < cnt(5); i++) { const v1 = vs(sd, 200 + i), v2 = vs(sd, 240 + i); T.glow(ctx, v1 * W, 250 + v2 * 220 + sin(t * 0.8 + i * 3) * 18, 20 + v2 * 14, '#5ff5ff', 0.22 + 0.12 * sin(t + i)); }
    } else {
      if (!front) {
        ctx.save(); ctx.strokeStyle = 'rgba(220,210,255,0.28)'; ctx.lineWidth = 1.2; ctx.beginPath();
        const n = cnt(46);
        for (let i = 0; i < n; i++) {                                       // storm rain
          const v1 = vs(sd, i * 2), v2 = vs(sd, i * 2 + 1), x = wrap(v1 * (W + 200) - t * 260 * (0.7 + v2 * 0.5), W + 200) - 60, y = wrap(v2 * (H + 100) + t * 780 * (0.7 + v1 * 0.4), H + 100) - 50;
          ctx.moveTo(x, y); ctx.lineTo(x - 9, y + 26);
        }
        ctx.stroke(); ctx.restore();
        for (let i = 0; i < cnt(10); i++) {                                 // white tears of void and red embers
          const v1 = vs(sd, 400 + i), v2 = vs(sd, 440 + i), x = wrap(v1 * W + sin(t * 0.5 + i) * 40 + t * 6, W), y = wrap(v2 * H * 0.85 - t * (8 + v1 * 12), H * 0.85) + 20;
          ctx.globalAlpha = ga * (0.35 + 0.35 * sin(t * 1.3 + i)); ctx.fillStyle = i % 3 ? '#ffffff' : '#ff6a4a'; ctx.fillRect(x, y, 3 + v2 * 4, 2 + v1 * 3);
        }
        ctx.globalAlpha = ga;
        const ph = wrap(t + sd * 0.013, 7.3);
        if (ph < 0.34 && !rmotion()) { ctx.fillStyle = 'rgba(255,240,255,' + (0.16 * (1 - ph / 0.34)) + ')'; ctx.fillRect(0, 0, W, 470); }   // a far flash of lightning
      } else {
        for (let i = 0; i < cnt(4); i++) { const v1 = vs(sd, 500 + i), v2 = vs(sd, 540 + i); ctx.globalAlpha = ga * 0.16; ctx.fillStyle = '#ffffff'; ctx.fillRect(wrap(v1 * W - t * 40, W), wrap(v2 * H + t * 26, H), 5, 5); }
        ctx.globalAlpha = ga;
      }
    }
  }
  const boss = () => S.boss;

  // ---- ground rings under legal targets, and the red danger ring of a telegraphing enemy ------------------------------------
  const RING_COL = { target: ['#f5c96a', '#ffe9a8'], hover: ['#ffe9a8', '#ffffff'], danger: ['#ff5a3a', '#ffb0a0'] };
  function drawRing(ctx, a, kind, t) {
    const p = curPos(a, _rp), b = bnd(a), T = TK(), hov = kind === 'hover', dng = kind === 'danger', col = RING_COL[kind];
    const rx = max(56, b.w * p.s * 0.5) * (dng ? 1.14 : hov ? 1.05 : 1), ry = rx * 0.26, x = p.x + a.rx + a.ex + a.lx, y = p.y + 5, pl = pulse01(t, dng ? 2.6 : hov ? 1.8 : 1.1);
    ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx);
    T.glow(ctx, 0, 0, rx * 1.25, col[0], (hov ? 0.6 : dng ? 0.5 : 0.36) + 0.2 * pl);
    ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fillStyle = T.rgba(col[0], (hov ? 0.22 : 0.13) + 0.07 * pl); ctx.fill();
    ctx.lineCap = 'round'; ctx.lineWidth = hov ? 6 : dng ? 5 : 4.4; ctx.strokeStyle = col[1]; ctx.globalAlpha *= 0.7 + 0.3 * pl;
    ctx.setLineDash([22, 12]); ctx.lineDashOffset = -t * (dng ? 90 : hov ? 64 : 38);
    ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.stroke();
    ctx.setLineDash([]); ctx.lineWidth = 2; ctx.strokeStyle = col[0]; ctx.beginPath(); ctx.arc(0, 0, rx * 0.8, 0, TAU); ctx.stroke();
    for (let i = 0; i < 4; i++) {                                           // four ticks that turn slowly, like a brush-drawn enso
      const an = t * (dng ? 1.6 : 0.9) + i * PI / 2;
      ctx.lineWidth = 4; ctx.strokeStyle = col[1]; ctx.beginPath(); ctx.moveTo(cos(an) * rx * 1.06, sin(an) * rx * 1.06); ctx.lineTo(cos(an) * rx * 1.26, sin(an) * rx * 1.26); ctx.stroke();
    }
    ctx.restore();
  }

  // ---- actors -----------------------------------------------------------------------------------------------------------
  function paintSprite(ctx, a, s, al, glw, t, noShadow) {
    const A = AR(), pt = poseTime(a), tt = t + a.phaseOff;
    try {
      if (a.kind === 'hero') A.hero.draw(ctx, a.id, { x: 0, y: 0, s, pose: a.pose, t: tt, pt, alpha: al, glow: glw || 0, shadow: noShadow ? false : undefined });
      else A.enemy.draw(ctx, a.def, { x: 0, y: 0, s, pose: a.pose, t: tt, pt, hpPct: a.maxHp > 0 ? clamp(a.hp / a.maxHp, 0, 1) : 1, phase: a.phase, alpha: al, glow: glw || 0 });
    } catch (e) {
      warnOnce('actor:' + a.def, e);
      ctx.globalAlpha = al; ctx.fillStyle = a.kind === 'hero' ? '#7a6bff' : '#8f5fe8'; ctx.fillRect(-40 * s, -160 * s, 80 * s, 160 * s);
    }
  }
  function drawMarks(ctx, a, s, t) {
    const T = TK(), b = bnd(a), st = a.st, hx = (b.head.x - b.feet.x) * s, hy = b.head.y * s;
    if (st.stun > 0) for (let i = 0; i < 3; i++) { const an = t * 3.4 + i * TAU / 3; T.sparkle(ctx, hx + cos(an) * 28 * s, hy - 26 * s + sin(an) * 8 * s, 7 * s, { color: '#ffe45e', glow: 0.4, rot: an }); }
    if (st.vulnerable > 0 || st.mark > 0) {
      const gold = st.mark > 0, r = 11 * s * (1 + 0.12 * sin(t * 6)), cy = hy - 42 * s;
      ctx.save(); ctx.strokeStyle = gold ? '#f5c96a' : '#ff5a5a'; ctx.lineWidth = 2.6; ctx.globalAlpha *= 0.9;
      ctx.beginPath(); ctx.arc(hx, cy, r, 0, TAU); ctx.moveTo(hx - r * 1.6, cy); ctx.lineTo(hx - r * 0.5, cy); ctx.moveTo(hx + r * 0.5, cy); ctx.lineTo(hx + r * 1.6, cy); ctx.moveTo(hx, cy - r * 1.6); ctx.lineTo(hx, cy - r * 0.5); ctx.moveTo(hx, cy + r * 0.5); ctx.lineTo(hx, cy + r * 1.6); ctx.stroke(); ctx.restore();
    }
    if (st.taunt > 0) T.inkText(ctx, '!', hx, hy - 34 * s + sin(t * 5) * 3, 30 * s, { fill: '#f5c96a', stroke: '#140f2e', skew: -0.1 });
    if (st.bind > 0) {
      ctx.save(); ctx.scale(1, 0.22); ctx.strokeStyle = '#d8c7a0'; ctx.lineWidth = 3.5; ctx.globalAlpha *= 0.85; ctx.setLineDash([9, 6]); ctx.lineDashOffset = -t * 16;
      ctx.beginPath(); ctx.arc(0, 0, max(40, b.w * s * 0.38), 0, TAU); ctx.stroke(); ctx.restore();
    }
  }
  function drawActor(ctx, a, t) {
    const p = curPos(a, _rp), s = p.s, lift = p.lift;
    let al = a.alpha;
    if (a.dying) al *= clamp(1 - ((S.at - a.deathT0) / a.deathDur - 0.6) / 0.4, 0, 1);
    if (al <= 0.01) return;
    const x = p.x + a.ox + a.rx, y = p.y + a.oy + a.ry, glw = auraGlow(a);
    if (lift > 3 && a.kind === 'hero') {                                    // the shadow stays on the ground while the hero is in the air
      ctx.save(); ctx.translate(p.x, p.y + lift); ctx.scale(1, 0.16); ctx.beginPath(); ctx.arc(0, 0, 60 * s * (1 - lift / 260), 0, TAU); ctx.fillStyle = 'rgba(20,15,46,' + (0.4 * al) + ')'; ctx.fill(); ctx.restore();
    }
    ctx.save();
    ctx.translate(x, y);
    if (a.rot) ctx.rotate(a.rot);
    if (a.sx !== 1 || a.sy !== 1) ctx.scale(a.sx, a.sy);
    if (a.lunge && !rmotion() && !lowQ()) {                                 // manga speed lines trailing behind a dash
      const l = a.lunge, tl = S.at - l.t0, u = (tl - l.wind * 0.6) / (l.dash + l.hold + 120);
      if (u > 0 && u < 1) {
        const dir = sgn(l.dx);
        ctx.save(); ctx.globalAlpha *= 0.7 * (1 - u);
        TK().speedLines(ctx, 0, 0, { mode: 'dir', rect: [dir > 0 ? -70 : -10, -210 * s, 90, 190 * s], angle: dir > 0 ? 0 : PI, len: 120, n: 9, seed: l.seed, w: 3.2, alpha: 1, color: '#ffffff' });
        ctx.restore();
      }
    }
    if (a.ghost > 0) {                                                      // afterimages of a dash or a dodge
      const k = clamp(a.ghost / 200, 0, 1);
      for (let i = 2; i >= 1; i--) { ctx.save(); ctx.translate(-a.ghostDir * i * 24, 0); paintSprite(ctx, a, s, al * 0.2 * k / i * 1.6, 0, t, true); ctx.restore(); }
    }
    paintSprite(ctx, a, s, al, glw, t, false);
    if (a.flash > 0.4 && !lowQ()) { ctx.globalCompositeOperation = 'lighter'; paintSprite(ctx, a, s, al * a.flash * 0.6, 0, t, true); ctx.globalCompositeOperation = 'source-over'; }     // the art's own hurt pose flashes too, so the extra pass is only the punch
    if (!a.dying && !a.down) drawMarks(ctx, a, s, t);
    ctx.restore();
  }

  // ---- fx, particles, numbers ---------------------------------------------------------------------------------------
  function drawFxLayer(ctx, layer) {
    for (let i = 0; i < S.fx.length; i++) {
      const f = S.fx[i];
      if (!f.on) continue;
      const p = (S.at - f.t0) / f.ms;
      if (p >= 1) { f.on = false; continue; }
      if (p < 0) continue;
      const isTop = f.name === 'sfxText';
      if ((isTop ? 3 : f.layer) !== layer) continue;
      if (f.follow) { if (f.follow.gone) { f.on = false; continue; } const b = bodyOf(f.follow); f.o.x = b.cx + f.dx; f.o.y = b.cy + f.dy; }
      ctx.save();
      try { callFx(f.name, ctx, f.o, p); } catch (e) { warnOnce('fx.' + f.name, e); } finally { ctx.restore(); }
    }
  }
  function drawParticles(ctx, front) {
    const T = TK();
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = PART[i];
      if (!p.on || p.age < 0 || p.front !== front) continue;
      const u = p.age / p.life, s = lerp(p.s, p.s1, u), a = p.a * (u < 0.15 ? u / 0.15 : (1 - u) / 0.85) * (p.k === P_PUFF ? 0.7 : 1);
      if (a <= 0.01 || s <= 0.05) continue;
      ctx.globalAlpha = clamp(a, 0, 1);
      if (p.add) ctx.globalCompositeOperation = 'lighter';
      switch (p.k) {
        case P_SPARK: { const l = min(28, Math.hypot(p.vx, p.vy) * 0.045 + 3); const an = Math.atan2(p.vy, p.vx); ctx.strokeStyle = p.col; ctx.lineWidth = s; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - cos(an) * l, p.y - sin(an) * l); ctx.stroke(); break; }
        case P_PETAL: T.petal(ctx, p.x, p.y, s, p.rot, clamp(a, 0, 1), p.col); break;
        case P_SHARD: ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.beginPath(); ctx.moveTo(0, -s * 1.4); ctx.lineTo(s * 0.7, s * 0.5); ctx.lineTo(-s * 0.7, s * 0.5); ctx.closePath(); ctx.fillStyle = p.col; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(20,15,46,0.7)'; ctx.stroke(); ctx.restore(); break;
        case P_STAR: T.sparkle(ctx, p.x, p.y, s, { color: p.col, rot: p.rot, glow: 0.3 }); break;
        case P_BUBBLE: ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, TAU); ctx.fillStyle = 'rgba(63,214,176,0.28)'; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = p.col; ctx.stroke(); break;
        case P_MOTE: T.glow(ctx, p.x, p.y, s * 2.6, hexOr(p.col, '#ffffff'), 0.9); break;
        case P_PUFF: ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, TAU); ctx.fillStyle = p.col; ctx.fill(); break;
        case P_NOTE: if (T.note) T.note(ctx, p.x, p.y, s, { kind: (p.rot * 7 | 0) % 3 === 0 ? 'quarter' : 'eighth', color: hexOr(p.col, '#f5c96a'), rot: sin(p.age * 0.004 + p.rot) * 0.25 }); else T.sparkle(ctx, p.x, p.y, s, { color: p.col, rot: p.rot, glow: 0.3 }); break;
        case P_INK: ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, TAU); ctx.fillStyle = p.col; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(122,107,255,0.6)'; ctx.stroke(); break;
        case P_EMBER: ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, TAU); ctx.fillStyle = p.col; ctx.fill(); break;
        default: ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, TAU); ctx.fillStyle = p.col; ctx.fill();
      }
      if (p.add) ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }
  function drawNums(ctx) {
    const A = AR(), T = TK();
    for (let i = 0; i < S.nums.length; i++) {
      const n = S.nums[i];
      if (!n.on) continue;
      const p = (S.at - n.t0) / n.ms;
      if (p >= 1) { n.on = false; continue; }
      if (p < 0) continue;
      const e = EASE.outCubic(min(1, p * 1.15));
      let x = n.x + n.vx * e, y = n.y - n.rise * e + 30 * p * p;
      if (n.kind === 'crit' && !rmotion()) x += sin(p * 70) * 3.2 * (1 - p);
      ctx.save();
      if (n.kind === 'status') {
        ctx.globalAlpha = p < 0.15 ? p / 0.15 : p > 0.7 ? (1 - p) / 0.3 : 1;
        try { A.icon.draw(ctx, 'status', n.icon, x - 14, y, 30, { n: 0 }); } catch (err) { warnOnce('icon', err); }
        T.inkText(ctx, n.text, x + 18, y, 22, { fill: '#fff8f0', stroke: '#140f2e', skew: 0 });
      } else if (n.kind === 'caption') {
        ctx.globalAlpha = p < 0.12 ? p / 0.12 : p > 0.7 ? (1 - p) / 0.3 : 1;
        T.inkText(ctx, n.text, x, y, 22, { fill: '#fff8f0', stroke: '#140f2e', family: T.font.display, weight: 700, skew: 0, strokeW: 4.5 });
      } else {
        callFx('numberPop', ctx, { x, y, text: n.text, kind: n.kind, s: n.s, seed: n.seed }, p);
      }
      ctx.restore();
    }
  }

  // ---- banners ----------------------------------------------------------------------------------------------------------
  function bandPath(ctx, x0, x1, y0, y1, skew) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1 - skew, y1); ctx.lineTo(x0 - skew, y1); ctx.closePath(); }
  function drawBanner(ctx, b) {
    const T = TK(), tms = S.at - b.t0, rm = rmotion();
    if (b.style === 'boss') return drawBossBanner(ctx, b, tms, rm);
    const enemy = b.style === 'enemy', inP = clamp(tms / 170, 0, 1), outP = clamp((tms - (b.dur - 200)) / 200, 0, 1), y0 = 290, y1 = 366, skew = 24;
    const reveal = rm ? 1 : EASE.outExpo(inP), x0 = rm ? -60 : outP * (W + 140) - 60, x1 = rm ? W + 60 : -60 + reveal * (W + 120);
    if (x1 <= x0) return;
    ctx.save();
    if (rm) ctx.globalAlpha = min(inP, 1 - outP);
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, enemy ? '#3a0a1e' : '#241a5a'); g.addColorStop(1, enemy ? '#12060e' : '#0d0b2a');
    bandPath(ctx, x0, x1, y0, y1, skew); ctx.fillStyle = g; ctx.globalAlpha *= 0.92; ctx.fill();
    ctx.save(); bandPath(ctx, x0, x1, y0, y1, skew); ctx.clip(); T.halftone(ctx, 0, y0, W, y1 - y0, { d: 7, r: 1.6, color: enemy ? '#ff5a5a' : '#8f7aff', alpha: 0.22, force: true }); ctx.restore();
    ctx.globalAlpha = 1; ctx.lineWidth = 3.4; ctx.strokeStyle = enemy ? '#e8383d' : '#f5c96a';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.moveTo(x0 - skew, y1); ctx.lineTo(x1 - skew, y1); ctx.stroke();
    ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(255,248,240,0.7)'; ctx.beginPath(); ctx.moveTo(x0 - 6, y0 + 8); ctx.lineTo(x1 - 6, y0 + 8); ctx.stroke();
    const slide = rm ? 0 : -90 * (1 - EASE.outCubic(clamp((tms - 50) / 180, 0, 1))) + outP * 140, ta = rm ? 1 : clamp((tms - 40) / 130, 0, 1) * (1 - outP);
    ctx.globalAlpha = ta;
    T.inkText(ctx, b.text, W / 2 + slide, (y0 + y1) / 2 - 2, 54, { fill: enemy ? '#ffe1e1' : '#fff8f0', stroke: '#140f2e', shadow: enemy ? '#e8383d' : '#7a6bff', skew: -0.2, weight: 900, strokeW: 8 });
    ctx.restore();
  }
  function drawBossBanner(ctx, b, tms, rm) {
    const T = TK(), dur = b.dur, inV = clamp(tms / 240, 0, 1), outV = clamp((tms - (dur - 380)) / 380, 0, 1), env = min(inV, 1 - outV);
    ctx.save();
    ctx.globalAlpha = 0.55 * env; ctx.fillStyle = '#05040f'; ctx.fillRect(0, 0, W, H);
    const bar = rm ? 0 : 84 * EASE.outCubic(inV) * (1 - EASE.inCubic(outV));
    ctx.globalAlpha = env; ctx.fillStyle = '#05040f'; ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar);
    const y0 = 262, y1 = 452, skew = 46, bandIn = rm ? 1 : EASE.outExpo(clamp((tms - 90) / 420, 0, 1)), x1 = -80 + bandIn * (W + 200);
    ctx.globalAlpha = env * 0.96;
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, '#0d0b1e'); g.addColorStop(0.55, '#1a0f30'); g.addColorStop(1, '#2a0a1e');
    bandPath(ctx, -80, x1, y0, y1, skew); ctx.fillStyle = g; ctx.fill();
    ctx.save(); bandPath(ctx, -80, x1, y0, y1, skew); ctx.clip(); T.halftone(ctx, 0, y0, W, y1 - y0, { d: 8, r: 1.9, color: '#e8383d', alpha: 0.26, force: true }); ctx.restore();
    ctx.globalAlpha = env; ctx.lineWidth = 6; ctx.strokeStyle = '#e8383d'; ctx.beginPath(); ctx.moveTo(-80, y1); ctx.lineTo(x1 - skew, y1); ctx.stroke();
    ctx.lineWidth = 2.2; ctx.strokeStyle = '#f5c96a'; ctx.beginPath(); ctx.moveTo(-80, y0); ctx.lineTo(x1, y0); ctx.moveTo(-80, y1 + 9); ctx.lineTo(x1 - skew, y1 + 9); ctx.stroke();
    // the name is written across the band by a brush: a clip that follows the stroke
    const wr = rm ? 1 : EASE.outCubic(clamp((tms - 330) / 700, 0, 1)), cx = W / 2 + (rm ? 0 : (1 - EASE.outCubic(clamp((tms - 330) / 900, 0, 1))) * -30);
    ctx.save(); ctx.beginPath(); ctx.rect(0, y0, wr * (W + 40), y1 - y0); ctx.clip();
    ctx.globalAlpha = env;
    T.inkText(ctx, b.text, cx, 338, b.text.length > 12 ? 84 : 108, { fill: '#fff8f0', stroke: '#140f2e', shadow: '#e8383d', family: T.font.display, weight: 900, skew: -0.14, strokeW: 12, shadowOff: 6 });
    ctx.restore();
    if (b.sub) {
      const sa = rm ? 1 : clamp((tms - 950) / 420, 0, 1);
      ctx.globalAlpha = env * sa;
      T.inkText(ctx, b.sub, W / 2 + (1 - sa) * 40, 412, 30, { fill: '#f5c96a', stroke: '#140f2e', family: T.font.display, weight: 700, skew: 0, strokeW: 6 });
    }
    // a vermilion hanko seal
    const ha = rm ? 1 : EASE.outBack(clamp((tms - 700) / 260, 0, 1));
    ctx.globalAlpha = env * clamp(ha, 0, 1); ctx.save(); ctx.translate(96, y0 + 44); ctx.rotate(-0.12); ctx.scale(max(0.01, ha), max(0.01, ha));
    ctx.fillStyle = '#e8383d'; ctx.fillRect(-34, -20, 68, 40); ctx.lineWidth = 3; ctx.strokeStyle = '#ffe1e1'; ctx.strokeRect(-30, -16, 60, 32);
    T.inkText(ctx, 'BOSS', 0, 1, 22, { fill: '#fff8f0', stroke: '#7d1230', skew: 0, strokeW: 3 }); ctx.restore();
    ctx.restore();
  }

  // ---- speech bubbles ---------------------------------------------------------------------------------------------------
  function wrapLines(ctx, text, maxW) {
    const words = text.split(/\s+/), lines = [];
    let cur = '';
    for (let i = 0; i < words.length; i++) {
      const t = cur ? cur + ' ' + words[i] : words[i];
      const w = (ctx.measureText(t) || {}).width;
      if ((w === undefined ? t.length * 9 : w) > maxW && cur) { lines.push(cur); cur = words[i]; } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines.slice(0, 4);
  }
  function rrPath(ctx, x, y, w, h, r) {
    r = min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function measureBubble(ctx, b, size, family, maxW) {
    ctx.font = '700 ' + size + 'px ' + family;
    if (!b.lines) {
      b.lines = wrapLines(ctx, b.text, maxW);
      let w = 0;
      b.lines.forEach((l) => { const m = (ctx.measureText(l) || {}).width; w = max(w, m === undefined ? l.length * 9 : m); });
      b.tw = w;
    }
  }
  function drawHeroBubble(ctx, id, b) {
    const a = S.hmap[id], T = TK();
    if (!a || a.gone) return;
    const el = (S.lt - b.t0) * 1000;
    if (el >= b.ms) { delete S.barks[id]; return; }
    const size = Math.round(19 * textScale()), fam = T.font.display;
    measureBubble(ctx, b, size, fam, 250 * textScale());
    const an = anchorOf(a), lh = size * 1.28, w = b.tw + 34, h = b.lines.length * lh + 22;
    const pop = rmotion() ? 1 : 0.55 + 0.45 * EASE.outBack(clamp(el / 170, 0, 1)), al = min(clamp(el / 90, 0, 1), clamp((b.ms - el) / 240, 0, 1));
    const bx = clamp(an.head.x + 118, w / 2 + 16, W - w / 2 - 16), by = max(78 + h / 2, an.head.y - 40 - h / 2 - (a.row === 'back' ? 26 : 0)), col = heroColor(id);
    ctx.save(); ctx.globalAlpha = al; ctx.translate(bx, by + (1 - pop) * 20); ctx.scale(pop, pop);
    ctx.lineJoin = 'round';
    rrPath(ctx, -w / 2, -h / 2, w, h, min(26, h * 0.42)); ctx.fillStyle = '#fff8f0'; ctx.fill(); ctx.lineWidth = 3.4; ctx.strokeStyle = '#140f2e'; ctx.stroke();
    ctx.save(); rrPath(ctx, -w / 2, -h / 2, w, h, min(26, h * 0.42)); ctx.clip(); ctx.fillStyle = col; ctx.globalAlpha *= 0.85; ctx.fillRect(-w / 2, h / 2 - 7, w, 7); ctx.restore();
    const tx = an.head.x - bx + 16, ty = an.head.y - by - 6;                                   // the tail points at the speaker's head
    ctx.globalAlpha = al; ctx.beginPath(); ctx.moveTo(-14 + clamp(tx * 0.1, -20, 20), h / 2 - 3); ctx.lineTo(clamp(tx * 0.35, -60, 60), h / 2 + clamp(-ty * 0.22, 16, 30)); ctx.lineTo(8 + clamp(tx * 0.1, -20, 20), h / 2 - 3);
    ctx.fillStyle = '#fff8f0'; ctx.fill(); ctx.stroke();
    ctx.globalAlpha = al; ctx.fillStyle = '#140f2e'; ctx.font = '700 ' + size + 'px ' + fam; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < b.lines.length; i++) ctx.fillText(b.lines[i], 0, -h / 2 + 11 + lh * (i + 0.5) + 1);
    ctx.restore();
  }
  function drawShout(ctx, sh) {
    const a = S.emap[sh.id], T = TK();
    if (!a || a.gone) { sh.dead = true; return; }
    const el = (S.lt - sh.t0) * 1000;
    if (el >= sh.ms) { sh.dead = true; return; }
    const size = Math.round(20 * textScale()), fam = T.font.display;
    measureBubble(ctx, sh, size, fam, 220 * textScale());
    const an = anchorOf(a), lh = size * 1.25, w = sh.tw + 44, h = sh.lines.length * lh + 30;
    const pop = rmotion() ? 1 : 0.4 + 0.6 * EASE.outBack(clamp(el / 140, 0, 1)), al = min(clamp(el / 80, 0, 1), clamp((sh.ms - el) / 220, 0, 1));
    const bx = clamp(an.top.x - 30, w / 2 + 12, W - w / 2 - 12), by = max(90 + h / 2, an.top.y - 44 - h / 2);
    ctx.save(); ctx.globalAlpha = al; ctx.translate(bx, by); ctx.scale(pop, pop); ctx.rotate(rmotion() ? 0 : sin(el * 0.05) * 0.02);
    const n = 20, pts = [];
    for (let i = 0; i < n; i++) { const an2 = i / n * TAU, rr = i % 2 ? 0.86 : 1.02, j = 0.94 + vs(sh.seed, i) * 0.12; pts.push([cos(an2) * (w / 2) * rr * j, sin(an2) * (h / 2) * rr * j]); }
    ctx.beginPath(); pts.forEach((p, i) => { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath();
    ctx.fillStyle = '#241a3a'; ctx.fill(); ctx.lineJoin = 'miter'; ctx.lineWidth = 4; ctx.strokeStyle = '#e8383d'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-10, h / 2 - 6); ctx.lineTo(min(0, an.head.x - bx) * 0.3 - 6, h / 2 + 24); ctx.lineTo(12, h / 2 - 8); ctx.closePath(); ctx.fillStyle = '#241a3a'; ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff8f0'; ctx.font = '800 ' + size + 'px ' + fam; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < sh.lines.length; i++) ctx.fillText(sh.lines[i], 0, -h / 2 + 15 + lh * (i + 0.5) + 1);
    ctx.restore();
  }

  // ---- the aim arrow ----------------------------------------------------------------------------------------------------
  function drawAim(ctx) {
    const a = S.aim;
    if (!a || a.alpha <= 0.02) return;
    const T = TK(), t = S.lt, gold = !!a.target, dx = a.tx - a.fx, dy = a.ty - a.fy, dist = Math.hypot(dx, dy);
    if (dist < 8) return;
    const c1x = a.fx + dx * 0.12, c1y = a.fy - 70 - min(230, dist * 0.34), c2x = a.tx - dx * 0.22, c2y = a.ty - 70 - min(150, dist * 0.18);
    const pts = [], N = 22;
    for (let i = 0; i <= N; i++) {
      const u = i / N, v = 1 - u;
      pts.push([v * v * v * a.fx + 3 * v * v * u * c1x + 3 * v * u * u * c2x + u * u * u * a.tx, v * v * v * a.fy + 3 * v * v * u * c1y + 3 * v * u * u * c2y + u * u * u * a.ty]);
    }
    const end = pts[N], prev = pts[N - 3], ang = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
    const body = pts.slice(0, N - 1);
    ctx.save(); ctx.globalAlpha = a.alpha;
    if (gold) T.glow(ctx, end[0], end[1], 70 + 8 * sin(t * 8), '#f5c96a', 0.55);
    const press = (u) => 0.22 + 0.78 * u;
    T.inkPath(ctx, { poly: body }, { w: 17, color: '#140f2e', taperStart: 0.3, taperEnd: 0.02, pressure: press, wobble: 0.05, step: 6 });
    T.inkPath(ctx, { poly: body }, { w: 9, color: gold ? '#f5c96a' : '#fff8f0', taperStart: 0.34, taperEnd: 0.02, pressure: press, wobble: 0.05, step: 6 });
    ctx.fillStyle = '#ffffff';
    for (let k = 0; k < 7; k++) {                                            // ink dots flowing toward the target
      const u = ((t * 0.75 + k / 7) % 1) * (N - 2), i = floor(u), f = u - i, p0 = pts[i], p1 = pts[min(N, i + 1)];
      ctx.globalAlpha = a.alpha * sin(((t * 0.75 + k / 7) % 1) * PI) * 0.85; ctx.beginPath(); ctx.arc(lerp(p0[0], p1[0], f), lerp(p0[1], p1[1], f), 3.4, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = a.alpha; ctx.translate(end[0], end[1]); ctx.rotate(ang);
    const hs = gold ? 1.15 + 0.08 * sin(t * 9) : 1;
    ctx.scale(hs, hs); ctx.beginPath(); ctx.moveTo(24, 0); ctx.lineTo(-10, -19); ctx.lineTo(-2, 0); ctx.lineTo(-10, 19); ctx.closePath();
    ctx.fillStyle = gold ? '#f5c96a' : '#fff8f0'; ctx.fill(); ctx.lineJoin = 'round'; ctx.lineWidth = 4.4; ctx.strokeStyle = '#140f2e'; ctx.stroke();
    ctx.restore();
    if (gold) T.sparkle(ctx, end[0] + 8, end[1] - 14, 9 + 3 * sin(t * 10), { color: '#ffffff', glow: 0.5, rot: t * 2 });
  }

  // ---- the whole frame ---------------------------------------------------------------------------------------------------
  function shakeVec(o) {
    const m = shakeMag();
    if (m <= 0.01) { o.x = 0; o.y = 0; return o; }
    o.x = (U.noise.n1(S.at * 0.06, 11) - 0.5) * 2 * m; o.y = (U.noise.n1(S.at * 0.06 + 40, 23) - 0.5) * 2 * m * 0.8;
    return o;
  }
  const _sk = { x: 0, y: 0 };
  function drawScene(ctx) {
    const t = S.lt, sk = shakeVec(_sk), zm = zoomNow(), dm = dimNow();
    ctx.save();
    if (zm !== 1) { ctx.translate(S.zoom.x, S.zoom.y); ctx.scale(zm, zm); ctx.translate(-S.zoom.x, -S.zoom.y); }
    guard(ctx, 'backdrop', () => { ctx.translate(sk.x * 0.4, sk.y * 0.4); drawBackdrop(ctx); });
    guard(ctx, 'ambient', () => drawAmbient(ctx, false));
    ctx.translate(sk.x, sk.y);
    if (dm > 0.01) guard(ctx, 'dim', () => { ctx.globalAlpha = dm; ctx.fillStyle = '#05040f'; ctx.fillRect(-40, -40, W + 80, H + 80); });
    guard(ctx, 'fx0', () => drawFxLayer(ctx, 0));
    guard(ctx, 'rings', () => {
      for (let i = 0; i < S.actors.length; i++) {
        const a = S.actors[i];
        if (a.gone || a.dying || a.fled || a.down) continue;
        const hv = S.hover && S.hover.id === a.id;
        if (a.kind === 'enemy' && a.pose === 'telegraph') drawRing(ctx, a, 'danger', t);
        if (S.targetable[a.id] || hv) drawRing(ctx, a, hv ? 'hover' : 'target', t);
      }
    });
    guard(ctx, 'back-particles', () => drawParticles(ctx, false));
    for (let i = 0; i < S.order.length; i++) { const a = S.order[i]; if (!a.gone) guard(ctx, 'actor', () => drawActor(ctx, a, t)); }
    guard(ctx, 'fx1', () => drawFxLayer(ctx, 1));
    guard(ctx, 'front-particles', () => drawParticles(ctx, true));
    guard(ctx, 'ambient-front', () => drawAmbient(ctx, true));
    ctx.restore();
    guard(ctx, 'fx2', () => drawFxLayer(ctx, 2));
    guard(ctx, 'flash', () => {
      for (let i = S.flashes.length - 1; i >= 0; i--) {
        const f = S.flashes[i], p = (S.at - f.t0) / f.dur;
        if (p >= 1) { S.flashes.splice(i, 1); continue; }
        if (p < 0) continue;
        ctx.globalAlpha = f.a * Math.pow(1 - p, 1.5); ctx.fillStyle = f.col; ctx.fillRect(0, 0, W, H);
      }
    });
    if (S.lose) guard(ctx, 'ink', () => { const p = rmotion() ? 0.5 : clamp((S.at - S.inkFadeT0) / 1400, 0, 1); ctx.globalAlpha = 0.62 * p; ctx.fillStyle = '#0d0b1e'; ctx.fillRect(0, 0, W, H); TK().vignette(ctx, W, H, { color: '#000000', alpha: 0.8 * p }); });
    guard(ctx, 'numbers', () => { ctx.translate(sk.x, sk.y); drawNums(ctx); });
    guard(ctx, 'fx3', () => drawFxLayer(ctx, 3));
    guard(ctx, 'banners', () => {
      for (let i = S.banners.length - 1; i >= 0; i--) { const b = S.banners[i]; if (S.at - b.t0 >= b.dur) S.banners.splice(i, 1); }
      for (let i = 0; i < S.banners.length; i++) { const b = S.banners[i]; if (S.at >= b.t0) guard(ctx, 'banner', () => drawBanner(ctx, b)); }
    });
    guard(ctx, 'bubbles', () => {
      for (const id in S.barks) guard(ctx, 'bark', () => drawHeroBubble(ctx, id, S.barks[id]));
      for (let i = 0; i < S.shouts.length; i++) guard(ctx, 'shout', () => drawShout(ctx, S.shouts[i]));
      if (S.shouts.length) S.shouts = S.shouts.filter((s) => !s.dead);
    });
    guard(ctx, 'aim', () => drawAim(ctx));
  }
  function draw(ctx) {
    if (!S.mounted || !ctx) return;
    ctx.save();
    try { drawScene(ctx); } catch (e) { S.drawErrors++; warnOnce('draw', e); } finally { ctx.restore(); }
  }

  // ==================================================================================================================
  // scene-only debugging aids for tools/rogue_book/shot.mjs --js:   SCENE.demo('kill')   SCENE.demo()  lists every name
  // ==================================================================================================================
  const STAGE_NAME = 'scenestage';                   // a private debug screen (a variable, so it is not a closed-list screen id)
  let stagePending = null;
  const STAGE_SCREEN = {
    enter() { const o = stagePending || {}; stagePending = null; if (!S.mounted || o.remount) buildStage(o); },
    leave() { unmount(); },
    update(dt) { update(dt); },
    draw(ctx, t) { draw(ctx, t); },
  };
  const BOSS_OF = { 1: 'boss_kuzunoha', 2: 'boss_jorogumo', 3: 'boss_editor' };
  const ENEMIES_OF = { 1: ['kappa', 'oni_cub', 'crow_tengu'], 2: ['chochin', 'karakuri_puppet', 'drowned_samurai'], 3: ['storm_drone', 'komainu_guardian', 'void_scribe'] };
  function buildStage(o) {
    const ch = clamp(fin(o.chapter, 1) | 0, 1, 3);
    mount({ chapter: ch, boss: !!o.boss, banners: true, heroes: o.heroes, enemies: o.enemies || (o.boss ? [BOSS_OF[ch]] : ENEMIES_OF[ch]), seed: o.seed === undefined ? 7 : o.seed, instant: o.instant, layout: o.layout });
  }
  // mount a synthetic stage and show it on a private screen (or just mount it when there is no UI to show it on)
  function stage(o) {
    o = o || {};
    if (typeof UI === 'undefined' || !UI.screens || typeof UI.go !== 'function' || o.noScreen) { buildStage(o); return Promise.resolve(); }
    UI.screens[STAGE_NAME] = STAGE_SCREEN;
    if (UI.currentName === STAGE_NAME) { buildStage(o); return Promise.resolve(); }
    stagePending = o;
    return UI.go(STAGE_NAME, null, { transition: 'none', force: true });
  }

  let demoGroup = 0;
  const liveEnemies = () => S.actors.filter((a) => a.kind === 'enemy' && !a.gone && !a.dying && !a.fled).sort((p, q) => p.lane - q.lane);
  const eid = (i) => { const l = liveEnemies(); return l.length ? l[Math.min(i || 0, l.length - 1)].id : ''; };
  const ref = (kind, id) => ({ kind, id });
  function cardFor(hero, dmg) {
    const d = DATA.heroes[hero], list = (d && d.starter) || [];
    for (let i = 0; i < list.length; i++) { const c = cardInfo({ id: list[i], up: 0, gems: [] }); if (c.dmg === dmg) return { uid: 100 + i, id: list[i], up: 0, gems: [] }; }
    return { uid: 100, id: list[0] || 'hanae_slash', up: 0, gems: [] };
  }
  const evPlay = (hero, dmg, target) => ({ type: 'play', card: cardFor(hero, dmg), hero, target: target || null, cost: 1, to: 'discard' });
  function evHit(src, dst, o) {
    const dstA = actorOf(dst) || { hp: 20, maxHp: 20 };
    const amount = o && o.amount !== undefined ? o.amount : 9;
    return Object.assign({ type: 'hit', src, dst, amount, blocked: 0, raw: amount, crit: false, hits: 1, index: 0, pierce: false, element: 'slash', hp: max(0, dstA.hp - amount), block: 0, killed: false, group: ++demoGroup }, o);
  }
  function seq(list) {
    let p = Promise.resolve();
    list.forEach((e, i) => { p = p.then(() => play(e, list[i + 1] || null)); });
    return p;
  }
  const hero1 = () => (S.hmap.hanae ? 'hanae' : Object.keys(S.hmap)[0]);
  const hero2 = () => (Object.keys(S.hmap).find((k) => k !== hero1()) || hero1());
  const heroHit = (element, o) => () => seq([evPlay(hero1(), true, eid(1)), evHit(ref('hero', hero1()), ref('enemy', eid(1)), Object.assign({ element }, o))]);
  const DEMOS = {
    slash: heroHit('slash'), fire: heroHit('fire', { amount: 12 }), ice: heroHit('ice', { amount: 10 }), lightning: heroHit('lightning', { amount: 13 }),
    poison: heroHit('poison', { amount: 6 }), ink: heroHit('ink', { amount: 9 }), holy: heroHit('holy', { amount: 9 }),
    crit: heroHit('slash', { amount: 22, crit: true }), heavy: heroHit('slash', { amount: 18 }),
    kill: () => seq([evPlay(hero1(), true, eid(1)), evHit(ref('hero', hero1()), ref('enemy', eid(1)), { amount: 14, crit: true, killed: true, hp: 0 }), { type: 'death', unit: ref('enemy', eid(1)), tier: 'normal' }]),
    multi: () => seq([evPlay(hero1(), true, eid(0)), evHit(ref('hero', hero1()), ref('enemy', eid(0)), { amount: 4, hits: 3, index: 0 }), evHit(ref('hero', hero1()), ref('enemy', eid(0)), { amount: 4, hits: 3, index: 1 }), evHit(ref('hero', hero1()), ref('enemy', eid(0)), { amount: 4, hits: 3, index: 2 })]),
    aoe: () => { const g = ++demoGroup, l = liveEnemies(); return seq([evPlay(hero2(), true, null)].concat(l.map((a) => evHit(ref('hero', hero2()), ref('enemy', a.id), { amount: 7, group: g, element: 'ink' })))); },
    blocked: () => seq([evPlay(hero1(), true, eid(0)), evHit(ref('hero', hero1()), ref('enemy', eid(0)), { amount: 0, blocked: 8, raw: 8 })]),
    block: () => seq([evPlay(hero1(), false, null), { type: 'block', dst: ref('hero', hero1()), amount: 8, block: 8, group: ++demoGroup }]),
    blockbreak: () => seq([{ type: 'block', dst: ref('hero', hero1()), amount: 6, block: 6, group: ++demoGroup }, evHit(ref('enemy', eid(0)), ref('hero', hero1()), { amount: 4, blocked: 6, raw: 10 }), { type: 'block_lost', dst: ref('hero', hero1()), amount: 6, cause: 'hit' }]),
    heal: () => seq([evPlay(hero2(), false, null), { type: 'heal', dst: ref('hero', hero1()), amount: 9, hp: 60, group: ++demoGroup }]),
    buff: () => seq([evPlay(hero1(), false, null), { type: 'status', dst: ref('hero', hero1()), s: 'might', delta: 2, value: 2, group: ++demoGroup }]),
    debuff: () => seq([evPlay(hero2(), false, eid(1)), { type: 'status', dst: ref('enemy', eid(1)), s: 'vulnerable', delta: 2, value: 2, group: ++demoGroup }]),
    poisoned: () => seq([{ type: 'status', dst: ref('enemy', eid(1)), s: 'poison', delta: 5, value: 5, group: ++demoGroup }, { type: 'hurt', dst: ref('enemy', eid(1)), amount: 5, hp: 10, cause: 'poison', group: ++demoGroup }]),
    stun: () => seq([{ type: 'status', dst: ref('enemy', eid(1)), s: 'stun', delta: 1, value: 1, group: ++demoGroup }, { type: 'skip', unit: ref('enemy', eid(1)), reason: 'stun' }]),
    dodge: () => seq([{ type: 'status', dst: ref('hero', hero1()), s: 'dodge', delta: 1, value: 1, group: ++demoGroup }, { type: 'enemy_act', enemy: eid(0), move: 'x', name: 'Swipe', kind: 'attack' }, { type: 'dodge', dst: ref('hero', hero1()), group: ++demoGroup }]),
    thorns: () => seq([{ type: 'enemy_act', enemy: eid(0), move: 'x', name: 'Swipe', kind: 'attack' }, evHit(ref('enemy', eid(0)), ref('hero', hero1()), { amount: 5 }), { type: 'thorns', src: ref('hero', hero1()), dst: ref('enemy', eid(0)), amount: 3, hp: 10 }]),
    enemy_hit: () => seq([{ type: 'enemy_act', enemy: eid(0), move: 'x', name: 'Claw Rake', kind: 'attack' }, evHit(ref('enemy', eid(0)), ref('hero', hero1()), { amount: 9 })]),
    enemy_multi: () => seq([{ type: 'enemy_act', enemy: eid(1), move: 'x', name: 'Flurry', kind: 'multi' }, evHit(ref('enemy', eid(1)), ref('hero', hero1()), { amount: 4, hits: 3, index: 0 }), evHit(ref('enemy', eid(1)), ref('hero', hero1()), { amount: 4, hits: 3, index: 1 }), evHit(ref('enemy', eid(1)), ref('hero', hero1()), { amount: 4, hits: 3, index: 2 })]),
    heavy_enemy: () => seq([{ type: 'intent', enemy: eid(0), intent: { kind: 'heavy' } }]),
    enemy_heavy_hit: () => seq([{ type: 'enemy_act', enemy: eid(0), move: 'x', name: 'Crushing Gore', kind: 'heavy', say: 'Nowhere to run!' }, evHit(ref('enemy', eid(0)), ref('hero', hero1()), { amount: 21 })]),
    swap: () => seq([{ type: 'swap', front: hero2(), back: hero1(), cost: 0, forced: false }]),
    summon: () => { const free = [0, 1, 2, 3, 4].find((l) => !S.actors.some((a) => a.kind === 'enemy' && !a.gone && a.lane === l)); return seq([{ type: 'summon', enemy: { id: 'leaf_imp#9', def: 'leaf_imp', name: 'Leaf Imp', hp: 8, maxHp: 8, tier: 'minion', size: 's', lane: free === undefined ? 0 : free, st: {}, phase: 0 } }]); },
    phase: () => seq([{ type: 'enemy_phase', enemy: eid(0), index: 1, at: 0.5, say: 'You dare break my silence?' }]),
    death: () => seq([{ type: 'death', unit: ref('enemy', eid(1)), tier: 'normal' }]),
    bossdeath: () => seq([{ type: 'death', unit: ref('enemy', eid(0)), tier: 'boss' }]),
    hero_down: () => seq([{ type: 'hero_down', hero: hero2() }]),
    revive: () => seq([{ type: 'hero_down', hero: hero2() }, { type: 'hero_revive', hero: hero2(), hp: 12 }]),
    win: () => seq([{ type: 'end', result: 'win' }]),
    lose: () => seq([{ type: 'end', result: 'lose' }]),
    turn: () => seq([{ type: 'turn_start', who: 'player', turn: 1, energy: 3, maxEnergy: 3 }]),
    enemy_turn: () => seq([{ type: 'turn_start', who: 'enemy', turn: 1, energy: 0, maxEnergy: 3 }]),
    boss: () => { banner('BOSS', 'boss'); return Promise.resolve(); },
    bark: () => { bark(hero1(), 'Stay behind me. This will be quick.'); return Promise.resolve(); },
    shout: () => { shout(eid(0), 'You will be silenced!'); return Promise.resolve(); },
    aim: () => { aim({ x: 640, y: 560 }, { x: 760, y: 300 }, null); return Promise.resolve(); },
    aimgold: () => { const a = anchor('enemy', eid(1)); setTargetable(liveEnemies().map((x) => x.id)); setHover('enemy', eid(1)); aim({ x: 640, y: 560 }, a ? { x: a.feet.x, y: a.y + a.h * 0.4 } : { x: 800, y: 350 }, eid(1)); return Promise.resolve(); },
    rings: () => { setTargetable(liveEnemies().map((a) => a.id)); setHover('enemy', eid(1)); return Promise.resolve(); },
    shake: () => { shake(12, 500); flash('#ffffff', 200); return Promise.resolve(); },
  };
  function demo(name, o) {
    if (name === undefined) return Object.keys(DEMOS);
    const fn = DEMOS[name];
    if (!fn) throw new Error('SCENE.demo: unknown demo "' + name + '" (try ' + Object.keys(DEMOS).join(', ') + ')');
    if (S.mounted) return fn(o || {});
    return Promise.resolve(stage(o)).then(() => fn(o || {}));
  }

  // ==================================================================================================================
  // the public surface
  // ==================================================================================================================
  return {
    mount, unmount, LAYOUT, update, draw, play, autoBanners, anchor, hitTest, setHover, setTargetable, aim, bark, banner, shake, flash, hitstop, speed, flush, setViewState, MAX_PARTICLES,
    gateMs, sfxForEvent, actorInfo, stats, signature, shout, demo, stage, GATES, SFX, EVENTS,
  };
})();
