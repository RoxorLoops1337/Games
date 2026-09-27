// Clawspire -- combat engine (COMBAT).
// Pure turn state + an event log. No DOM, no physics, no Math.random: every
// roll goes through F.rng (a U.rng stream handed to newFight). The game owns
// the cabinet and mirrors the bin* events onto physics bodies; the renderer
// animates from the rest. Content (items, enemies, statuses, relics) is read
// lazily through COMBAT.defs(), which defaults to the DATA global and can be
// swapped for a stub by tests (COMBAT.useDefs(stub)).
const COMBAT = (() => {
  const MAX_ALIVE = 3;       // enemies alive at once (summon cap)
  const MAX_STACK = 99;      // status stacks clamp to [0, 99]
  // Starting bins are 19 items now (6 of them r 9-11 fillers, cheap circles
  // for the physics budget), so both caps grew: 40 -> 48 and 30 -> 34.
  const MAX_ITEMS = 48;      // bin + used cap for junk/copies (physics budget)
  const MAX_CABINET = 34;    // bodies in the cabinet at once; the rest of a big bin waits in the used pile
  // Turn-start trickle (DATA.ECONOMY.trickle / binFloor, these are the
  // fallbacks): a couple of used items rain back in every turn, and a bin
  // below the floor is topped up to it first, so the cabinet is never bare
  // while the used pile holds anything. A turn that played nothing pours the
  // whole used pile back in: the shower stirs a pile the claw cannot bite
  // (flat blades and coins on the floor), which otherwise stalls a fight for
  // dozens of turns.
  const TRICKLE = 2;
  const BIN_FLOOR = 6;
  // hp multiplier for an earlier act's normal pulled into a later act (event
  // fights, summons). Tracks the tuned normals: act 2 ~x2.0, act 3 ~x3.2 of
  // act 1 (the bible's x1.7 / x2.6 before the balance pass).
  const ACT_HP = [1, 1, 2.0, 3.2];
  // Player debuffs removed by `cleanse` when DATA.STATUS has no `kind` info.
  const DEBUFFS = ['weak', 'vuln', 'poison', 'burn', 'chill', 'freeze', 'bleed', 'stun', 'grease', 'fog'];
  // Statuses that lose 1 stack at the end of their owner's turn.
  const TURN_DECAY = ['weak', 'vuln', 'grease', 'fog'];
  // Statuses with their own explicit rules (ticks, consumption, conversion) or
  // that persist for the fight. Anything else falls back to DATA.STATUS.stack.
  const RULED = ['str', 'thorns', 'armor', 'enrage', 'shield_up', 'dodge', 'chill', 'freeze',
    'stun', 'poison', 'burn', 'regen', 'bleed', 'streak'];
  const CLAW0 = { grabs: 3, width: 1, grip: 1, speed: 1, prongs: 2, rubber: 0, magnet: 0 };

  let override = null;
  const OUT = new WeakMap();      // F -> stack of event collectors (play/endTurn return values)
  const ACTIVE = new WeakMap();   // F -> Set of relic hooks currently running (no re-entry)
  let uidN = 1;

  const api = {};

  // ---------- content access (lazy; never touched at load time) ----------
  api.defs = function () {
    if (override) return override;
    return (typeof DATA !== 'undefined' && DATA) ? DATA : {};
  };
  api.useDefs = function (d) { override = d || null; };
  const D = () => api.defs() || {};
  const tbl = (name) => D()[name] || {};
  function itemDef(id) {
    const d = tbl('ITEMS')[id];
    return d || { id, name: String(id), rarity: 'junk', tags: [], fx: [], target: 'none' };
  }
  function enemyDef(id) {
    const d = tbl('ENEMIES')[id];
    return d || { id, name: String(id), act: 1, tier: 'normal', hp: [10, 10], moves: [{ id: 'hit', name: 'Hit', k: 'attack', v: 5 }], ai: 'cycle' };
  }
  const statusDef = (id) => tbl('STATUS')[id] || null;
  const relicDef = (id) => tbl('RELICS')[id] || null;

  // ---------- small helpers ----------
  const num = (v, d) => { const n = +v; return Number.isFinite(n) ? n : (d || 0); };
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const newUid = () => (typeof U !== 'undefined' && U.uid) ? U.uid() : 'c' + (uidN++).toString(36);
  const alive = (F) => F.enemies.filter(e => e.alive);
  const isPlayer = (F, u) => u === F.player;
  const whoOf = (F, u) => (isPlayer(F, u) ? 'p' : 'e');
  const idxOf = (F, u) => (isPlayer(F, u) ? -1 : F.enemies.indexOf(u));
  const st = (u, s) => num(u && u.status && u.status[s], 0);
  const tagHas = (def, t) => !!(def && Array.isArray(def.tags) && def.tags.indexOf(t) >= 0);
  function isJunk(inst) {
    if (!inst) return false;
    if (inst.junk) return true;
    const d = tbl('ITEMS')[inst.id];
    return !!(d && d.rarity === 'junk');
  }
  // Effect list for an instance: plus.fx when upgraded and present.
  function fxOf(def, plus) {
    if (plus && def.plus && Array.isArray(def.plus.fx)) return def.plus.fx;
    return Array.isArray(def.fx) ? def.fx : [];
  }
  function exhausts(def, plus) {
    if (plus && def.plus && def.plus.exhaust != null) return !!def.plus.exhaust;
    return !!def.exhaust;
  }
  function log(F, s) { F.log.push(s); if (F.log.length > 200) F.log.splice(0, F.log.length - 200); }

  // Resolve a `who` argument: unit object, 'p'/'player', or an enemy index.
  function unit(F, who) {
    if (who === 'p' || who === 'player' || who === F.player) return F.player;
    if (typeof who === 'number') return F.enemies[who] || null;
    if (who && F.enemies.indexOf(who) >= 0) return who;
    return null;
  }

  // ---------- events ----------
  // Every event lands on F.events (the game drains it) and on every open
  // collector, so nested calls (endTurn -> startTurn) bubble up.
  function emit(F, ev) {
    F.events.push(ev);
    const stack = OUT.get(F);
    if (stack) for (const c of stack) c.push(ev);
    return ev;
  }
  function begin(F) {
    if (!F || typeof F !== 'object') return [];
    let s = OUT.get(F);
    if (!s) { s = []; OUT.set(F, s); }
    const c = [];
    s.push(c);
    return c;
  }
  function end(F, c) {
    const s = F && typeof F === 'object' ? OUT.get(F) : null;
    if (s) { const i = s.lastIndexOf(c); if (i >= 0) s.splice(i, 1); }
    return c;
  }
  const text = (F, u, str) => emit(F, { t: 'text', who: whoOf(F, u), idx: idxOf(F, u), str });

  // ---------- relics ----------
  // Sum of numeric relic mods over the given relic ids.
  api.relicMods = function (ids) {
    const m = {};
    for (const id of ids || []) {
      const r = relicDef(id);
      if (!r || !r.mods) continue;
      for (const k in r.mods) m[k] = num(m[k], 0) + num(r.mods[k], 0);
    }
    return m;
  };
  // One-time run-level relic mods (maxhp/gold/ink), for game.js on pickup.
  // Claw and in-fight mods are NOT applied here: newFight derives them.
  api.gainRelic = function (run, id) {
    if (!run) return run;
    run.relics = run.relics || [];
    run.relics.push(id);
    const r = relicDef(id);
    const m = (r && r.mods) || {};
    if (num(m.maxhp, 0)) {
      run.maxHp = Math.max(1, num(run.maxHp, 70) + num(m.maxhp, 0));
      run.hp = clamp(num(run.hp, run.maxHp) + Math.max(0, num(m.maxhp, 0)), 0, run.maxHp);
    }
    if (num(m.gold, 0)) run.gold = Math.max(0, num(run.gold, 0) + num(m.gold, 0));
    if (num(m.ink, 0)) run.ink = Math.max(0, num(run.ink, 0) + num(m.ink, 0));
    return run;
  };
  // Build rules the relics bend (relic.rules, DATA.RELIC_RULES): numbers
  // add up, `amp` merges per tag. src names the relic behind each rule so
  // its proc event can credit it.
  api.rulesOf = function (ids) {
    const rules = {}, src = {};
    for (const id of ids || []) {
      const r = relicDef(id);
      if (!r || !r.rules || typeof r.rules !== 'object') continue;
      for (const k in r.rules) {
        const v = r.rules[k];
        if (v && typeof v === 'object') {
          rules[k] = rules[k] || {};
          for (const t in v) rules[k][t] = num(rules[k][t], 0) + num(v[t], 0);
        } else rules[k] = num(rules[k], 0) + (v === true ? 1 : num(v, 0));
        if (!src[k]) src[k] = id;
      }
    }
    return { rules, src };
  };
  // A proc event: a relic, item or combo synergy just triggered (the
  // renderer floats `text` over `who`).
  function procEv(src, id, name, icon, color, str, u, F) {
    const enemy = !!(F && u && !isPlayer(F, u));
    return { t: 'proc', src, id, name: name || id, icon: icon || '', color: color || '#ffc94d', text: str,
      who: enemy ? 'enemy' : 'player', idx: enemy ? F.enemies.indexOf(u) : -1 };
  }
  function relicProc(F, id, str, u) {
    const r = relicDef(id) || {};
    const A = D().ARCHETYPES || {};
    const k = (r.kw || [])[0];
    return procEv('relic', id, r.name, r.icon, A[k] && A[k].color, str || r.proc || String(r.name || id).toUpperCase(), u, F);
  }
  function ruleProc(F, rule, str, u) {
    const id = (F.ruleSrc && F.ruleSrc[rule]) || rule;
    return emit(F, relicProc(F, id, str, u));
  }
  function itemProc(F, def, str) {
    const k = D().kwIds ? (D().kwIds(def) || [])[0] : null;
    const A = D().ARCHETYPES || {};
    return emit(F, procEv('item', def.id, def.name, A[k] ? A[k].icon : '', def.color, str, F.player, F));
  }
  // A relic hook call that produced events gets a proc event in front of
  // them (unless it emitted its own), in F.events and in every open collector.
  function autoProc(F, id, mark, cols) {
    for (let i = mark; i < F.events.length; i++) {
      const e = F.events[i];
      if (e && e.t === 'proc' && e.src === 'relic' && e.id === id) return;
    }
    const ev = relicProc(F, id);
    F.events.splice(mark, 0, ev);
    for (const [c, n] of cols) if (n <= c.length) c.splice(n, 0, ev);
  }

  // Call hooks[name](F, ...args) on every relic. A hook that throws is logged
  // in F.hookErrors instead of breaking the fight; a hook never re-enters itself
  // (onDmgDealt dealing damage would otherwise recurse forever).
  function hook(F, name, ...args) {
    let act = ACTIVE.get(F);
    if (!act) { act = new Set(); ACTIVE.set(F, act); }
    if (act.has(name)) return;
    act.add(name);
    try {
      for (const id of F.relics) {
        const r = relicDef(id);
        const fn = r && r.hooks && r.hooks[name];
        if (typeof fn !== 'function') continue;
        const mark = F.events.length;
        const cols = (OUT.get(F) || []).map(c => [c, c.length]);
        try { fn(F, ...args); } catch (err) {
          F.hookErrors.push(`${id}.${name}: ${err && err.message || err}`);
        }
        if (F.events.length > mark) autoProc(F, id, mark, cols);
      }
    } finally { act.delete(name); }
    sanitize(F);
  }

  // Defensive pass: no NaN, hp in [0,maxHp], stacks in [0,99].
  function sanitizeUnit(u) {
    u.maxHp = Math.max(1, Math.round(num(u.maxHp, 1)));
    u.hp = clamp(Math.round(num(u.hp, 0)), 0, u.maxHp);
    u.block = clamp(Math.round(num(u.block, 0)), 0, 999);
    for (const k in u.status) {
      const v = clamp(Math.round(num(u.status[k], 0)), 0, MAX_STACK);
      if (v) u.status[k] = v; else delete u.status[k];
    }
  }
  function sanitize(F) {
    sanitizeUnit(F.player);
    const p = F.player;
    p.grabs = clamp(Math.round(num(p.grabs, 0)), 0, 99);
    p.grabsMax = clamp(Math.round(num(p.grabsMax, 0)), 0, 99);
    p.grabsUsed = clamp(Math.round(num(p.grabsUsed, 0)), 0, 999);
    for (const e of F.enemies) sanitizeUnit(e);
  }

  // ---------- fight setup ----------
  function makeEnemy(F, id) {
    const def = enemyDef(id);
    const hr = Array.isArray(def.hp) ? def.hp : [num(def.hp, 10), num(def.hp, 10)];
    const lo = Math.max(1, Math.round(num(hr[0], 10)));
    const hi = Math.max(lo, Math.round(num(hr[1], lo)));
    let hp = F.rng.int(lo, hi);
    const dAct = clamp(num(def.act, 1) | 0, 1, 3);
    const tier = def.tier || 'normal';
    if (tier === 'normal' && dAct < F.act) hp = Math.round(hp * ACT_HP[F.act] / ACT_HP[dAct]);
    // Global difficulty (DATA.DIFFICULTY): hp and attack values scale together
    // so the content bands stay readable while the claw's yield changes.
    const diff = (api.defs() || {}).DIFFICULTY || {};
    let hpMul = num(diff.hp, 1), dmgMul = num(diff.dmg, 1);
    // Hidden escalation: every `ramp.every` fights of the run, enemies gain
    // +ramp.hp / +ramp.dmg (fractions) per step, capped at ramp.max steps.
    const ramp = diff.ramp || null;
    if (ramp && num(ramp.every, 0) > 0) {
      const step = Math.min(Math.floor(num(F.fights, 0) / ramp.every), num(ramp.max, 99));
      if (step > 0) { hpMul *= 1 + step * num(ramp.hp, 0); dmgMul *= 1 + step * num(ramp.dmg, 0); }
    }
    let edef = def;
    if (hpMul !== 1) hp = Math.max(1, Math.round(hp * hpMul));
    if (dmgMul !== 1 && Array.isArray(def.moves)) {
      edef = Object.assign({}, def, { moves: def.moves.map(m => (m && (m.k === 'attack' || m.k === 'charge') && m.v != null) ? Object.assign({}, m, { v: Math.max(1, Math.round(m.v * dmgMul)) }) : m) });
    }
    const e = {
      uid: newUid(), id, def: edef, hp, maxHp: hp, block: 0, status: {}, intent: null, moveIdx: -1,
      alive: true, charged: 0, escaped: false, cyc: 0,
    };
    // Optional starting statuses (e.g. a golem's armor): def.status {s: v}.
    if (def.status && typeof def.status === 'object') {
      for (const s in def.status) e.status[s] = clamp(Math.round(num(def.status[s], 0)), 0, MAX_STACK);
    }
    return e;
  }

  // run: {hp, maxHp, act, bin:[inst], relics:[ids], claw:{...}}; rng: U.rng fn or a seed.
  api.newFight = function (run, enemyIds, rng) {
    run = run || {};
    if (typeof rng !== 'function') {
      const seed = num(rng, num(run.seed, 1) + num(run.turns, 0) * 7919);
      rng = (typeof U !== 'undefined') ? U.rng(seed) : null;
    }
    const mods = api.relicMods(run.relics);
    const claw = Object.assign({}, CLAW0, run.claw || {});
    for (const k of ['grabs', 'width', 'grip', 'speed', 'rubber', 'magnet']) claw[k] = num(claw[k], CLAW0[k]) + num(mods[k], 0);
    if (num(mods.prongs, 0)) claw.prongs = mods.prongs >= 2 ? Math.max(claw.prongs, mods.prongs) : claw.prongs + mods.prongs;
    claw.prongs = clamp(Math.round(num(claw.prongs, 2)), 2, 3);
    claw.rubber = clamp(claw.rubber, 0, 1);
    claw.magnet = clamp(claw.magnet, 0, 1);
    claw.grabs = clamp(Math.round(claw.grabs), 1, 9);
    const maxHp = Math.max(1, Math.round(num(run.maxHp, 70)));
    const F = {
      seed: rng.seed ? rng.seed() : 0, rng, turn: 1, phase: 'player', result: null,
      act: clamp(num(run.act, 1) | 0, 1, 3),
      fights: Math.max(0, num(run.fights, 0) | 0),   // fights already fought this run (escalation counter)
      player: {
        hp: clamp(Math.round(num(run.hp, maxHp)), 0, maxHp), maxHp, block: 0, status: {},
        grabs: claw.grabs, grabsMax: claw.grabs, grabsUsed: 0,
      },
      enemies: [],
      bin: (run.bin || []).map(i => ({ uid: i.uid || newUid(), id: i.id, plus: !!i.plus, frozen: false, junk: !!i.junk })),
      used: [], exhausted: [], stolen: [], purged: [],
      target: 0, events: [], relics: (run.relics || []).slice(), claw, log: [],
      gain: { gold: 0, ink: 0, maxhp: 0 },      // run-level effects the game applies after the fight
      kills: 0, killed: [], escaped: [], tilt: 0, rs: {}, hookErrors: [], fresh: {},
      stats: { played: 0, dmgDealt: 0, dmgTaken: 0, grabs: 0, blocked: 0, combos: 0, shattered: 0, spent: 0 },
      playedThisTurn: 0,
      // Builds: the current grab's deliveries (useGrab opens it, play fills
      // it, grabDone reads and clears it), the grab streak, the relic rules,
      // the run's gold at fight start (pay / per gold), combo counts.
      grab: { insts: [], defs: [] }, streak: 0, rules: {}, ruleSrc: {}, gold0: Math.max(0, num(run.gold, 0)),
      echoN: 0, lastPlay: null, comboTurn: {}, combos: {},
    };
    const rs = api.rulesOf(F.relics);
    F.rules = rs.rules; F.ruleSrc = rs.src;
    // A late-run bin can outgrow the cabinet: the overflow waits in the used
    // pile and cycles in through refills, so the physics budget holds.
    if (F.bin.length > MAX_CABINET) {
      const all = F.rng.shuffle(F.bin);
      F.bin = all.slice(0, MAX_CABINET);
      F.used = all.slice(MAX_CABINET);
    }
    for (const id of (enemyIds || []).slice(0, MAX_ALIVE)) F.enemies.push(makeEnemy(F, id));
    if (!F.enemies.length) F.enemies.push(makeEnemy(F, 'dummy'));
    for (const e of F.enemies) api.pickIntent(F, e);
    // Turn 1 starts first so onFightStart / start mods land on top of the reset.
    api.startTurn(F);
    if (num(mods.startStr, 0)) api.status(F, F.player, 'str', mods.startStr);
    if (num(mods.startBlock, 0)) gainBlock(F, F.player, mods.startBlock);
    hook(F, 'onFightStart');
    checkOver(F);
    return F;
  };

  // ---------- core rules ----------
  api.isOver = function (F) {
    if (!F) return null;
    if (F.player.hp <= 0) return 'lose';
    if (!F.enemies.some(e => e.alive)) return 'win';
    return null;
  };
  function checkOver(F) {
    if (F.phase === 'over') return F.result;
    const r = api.isOver(F);
    if (r) {
      F.phase = 'over';
      F.result = r;
      emit(F, { t: 'over', result: r });
      log(F, r === 'win' ? 'Victory.' : 'Defeat.');
    }
    return r;
  }
  function retarget(F) {
    const t = F.enemies[F.target];
    if (t && t.alive) return;
    const i = F.enemies.findIndex(e => e.alive);
    F.target = i < 0 ? 0 : i;
  }
  api.setTarget = function (F, idx) {
    const e = F.enemies[idx];
    if (e && e.alive) F.target = idx;
    return F.target;
  };

  function gainBlock(F, u, v) {
    v = Math.round(num(v, 0));
    if (!v || !u) return 0;
    const before = u.block;
    u.block = clamp(u.block + v, 0, 999);
    const amt = u.block - before;
    if (amt) emit(F, { t: 'block', who: whoOf(F, u), idx: idxOf(F, u), amt });
    if (amt > 0 && isPlayer(F, u)) hook(F, 'onBlock', amt);
    return amt;
  }

  // Straight hp loss (poison/burn/bleed ticks, self damage): ignores block,
  // str, weak, vuln, armor, dodge and thorns.
  function loseHp(F, u, v) {
    v = Math.max(0, Math.round(num(v, 0)));
    if (!v || !u || F.phase === 'over') return 0;
    if (!isPlayer(F, u) && !u.alive) return 0;
    const amt = Math.min(u.hp, v);
    u.hp -= amt;
    emit(F, { t: 'dmg', who: whoOf(F, u), idx: idxOf(F, u), amt, blocked: 0 });
    afterHit(F, null, u, amt);
    return amt;
  }

  // Bookkeeping shared by damage() and loseHp(): hooks, death, over.
  function afterHit(F, src, tgt, amt) {
    if (isPlayer(F, tgt)) {
      F.stats.dmgTaken += amt;
      if (amt > 0) hook(F, 'onHurt', amt);
      checkOver(F);
    } else {
      if (src === F.player && amt > 0) { F.stats.dmgDealt += amt; hook(F, 'onDmgDealt', tgt, amt); }
      if (tgt.alive && tgt.hp <= 0) kill(F, tgt);
    }
  }

  // One hit's value after modifiers: (base + str) * weak * vuln, floor, - armor.
  function calcHit(base, str, weak, vuln, armor) {
    let v = num(base, 0) + num(str, 0);
    if (weak) v *= 0.75;
    if (vuln) v *= 1.5;
    v = Math.floor(v) - Math.max(0, num(armor, 0));
    return Math.max(0, v);
  }

  // src: F.player, an enemy, or null (environment). opts: {pierce: ignore
  // block and armor, fixed: no str/weak/vuln (thorns), noThorns}.
  // Returns the hp actually lost by the target.
  api.damage = function (F, src, tgt, v, opts) {
    opts = opts || {};
    tgt = unit(F, tgt);
    src = src == null ? null : unit(F, src);
    if (!F || !tgt || F.phase === 'over') return 0;
    if (!isPlayer(F, tgt) && !tgt.alive) return 0;
    if (src && !isPlayer(F, src) && !src.alive) return 0;
    const attack = !!src && !opts.fixed;
    // Dodge eats the whole hit (and its thorns).
    if (attack && st(tgt, 'dodge') > 0) {
      tgt.status.dodge = st(tgt, 'dodge') - 1;
      if (!tgt.status.dodge) delete tgt.status.dodge;
      text(F, tgt, 'MISS');
      return 0;
    }
    let amt;
    if (opts.fixed) amt = Math.max(0, Math.round(num(v, 0)));
    else {
      amt = calcHit(v, src ? st(src, 'str') : 0, src ? st(src, 'weak') > 0 : false,
        st(tgt, 'vuln') > 0, opts.pierce ? 0 : st(tgt, 'armor'));
      // Permafrost rule: the player's hits on a Frozen enemy shatter for more.
      const sh = num(F.rules && F.rules.shatter, 0);
      if (sh > 0 && isPlayer(F, src) && !isPlayer(F, tgt) && st(tgt, 'freeze') > 0) {
        amt = Math.floor(amt * (1 + sh));
        if (F.shatterAt !== F.stats.played) { F.shatterAt = F.stats.played; ruleProc(F, 'shatter', 'SHATTER', tgt); }
      }
    }
    let blocked = 0;
    if (!opts.pierce) { blocked = Math.min(tgt.block, amt); tgt.block -= blocked; }
    const loss = Math.min(tgt.hp, amt - blocked);
    tgt.hp -= loss;
    F.stats.blocked += isPlayer(F, tgt) ? blocked : 0;
    const ev = { t: 'dmg', who: whoOf(F, tgt), idx: idxOf(F, tgt), amt: loss, blocked };
    if (!opts.fixed && st(tgt, 'vuln') > 0 && amt >= 12) ev.crit = true;
    emit(F, ev);
    // Thorns bite back at a unit that attacked (block still soaks thorns).
    const th = st(tgt, 'thorns');
    if (attack && th > 0 && !opts.noThorns && (isPlayer(F, src) || src.alive)) {
      api.damage(F, tgt, src, th, { fixed: true, noThorns: true });
    }
    afterHit(F, src, tgt, loss);
    return loss;
  };

  api.heal = function (F, who, v) {
    const u = unit(F, who);
    v = Math.round(num(v, 0));
    if (!u || !v) return 0;
    if (!isPlayer(F, u) && !u.alive) return 0;
    if (v < 0) return -loseHp(F, u, -v);
    const amt = Math.max(0, Math.min(v, u.maxHp - u.hp));
    u.hp += amt;
    if (amt) emit(F, { t: 'heal', who: whoOf(F, u), idx: idxOf(F, u), amt });
    if (amt > 0 && isPlayer(F, u)) hook(F, 'onHeal', amt);
    return amt;
  };

  // Add (or with negative v remove) stacks. Emits {t:'status', v: delta}.
  api.status = function (F, who, id, v) {
    const u = unit(F, who);
    v = Math.round(num(v, 0));
    if (!u || !id || !v) return 0;
    if (!isPlayer(F, u) && !u.alive) return 0;
    if (id === 'block') return gainBlock(F, u, v);
    const before = st(u, id);
    const now = clamp(before + v, 0, MAX_STACK);
    if (now) u.status[id] = now; else delete u.status[id];
    const d = now - before;
    // Debuffs an enemy puts on the player skip this round's decay, so a
    // 1-stack weak/vuln/grease/fog still covers the player's next turn.
    if (d > 0 && isPlayer(F, u) && F.phase === 'enemy') F.fresh[id] = true;
    if (d) emit(F, { t: 'status', who: whoOf(F, u), idx: idxOf(F, u), s: id, v: d });
    // Chill 3 -> freeze 1 (enemy skips an action; player loses a grab next turn).
    if (id === 'chill' && now >= 3) {
      if (now - 3) u.status.chill = now - 3; else delete u.status.chill;
      text(F, u, 'FROZEN');
      api.status(F, u, 'freeze', 1);
    }
    if (d > 0) hook(F, 'onStatus', u, id, d);
    return d;
  };

  function removeStatus(F, u, id) {
    const had = st(u, id);
    if (!had) return;
    delete u.status[id];
    emit(F, { t: 'status', who: whoOf(F, u), idx: idxOf(F, u), s: id, v: -had });
  }
  // Tick-and-decay: poison/burn/bleed lose v hp, then -1 stack.
  function tickDmg(F, u, id) {
    const v = st(u, id);
    if (v <= 0) return;
    // Festering rule: enemy Poison ticks but never wears off.
    if (id === 'poison' && !isPlayer(F, u) && num(F.rules && F.rules.poisonKeep, 0) > 0) ruleProc(F, 'poisonKeep', 'FESTER', u);
    else {
      u.status[id] = v - 1;
      if (!u.status[id]) delete u.status[id];
    }
    loseHp(F, u, v);
  }
  function tickRegen(F, u) {
    const v = st(u, 'regen');
    if (v <= 0) return;
    u.status.regen = v - 1;
    if (!u.status.regen) delete u.status.regen;
    api.heal(F, u, v);
  }
  // End of the owner's turn: 'turns' statuses lose one stack.
  function decayTurns(u, skip) {
    for (const k of Object.keys(u.status)) {
      if (skip && skip[k]) continue;
      let decays = TURN_DECAY.indexOf(k) >= 0;
      if (!decays && RULED.indexOf(k) < 0) { const sd = statusDef(k); decays = !!(sd && sd.stack === 'turns'); }
      if (!decays) continue;
      u.status[k] = st(u, k) - 1;
      if (u.status[k] <= 0) delete u.status[k];
    }
  }
  function isDebuff(k) {
    const sd = statusDef(k);
    if (sd && sd.kind) return sd.kind === 'debuff';
    return DEBUFFS.indexOf(k) >= 0;
  }

  function kill(F, e) {
    if (!e.alive) return;
    e.alive = false;
    e.hp = 0;
    e.block = 0;
    e.charged = 0;
    F.kills++;
    F.killed.push(e.id);
    const idx = F.enemies.indexOf(e);
    emit(F, { t: 'die', idx });
    log(F, `${e.def.name || e.id} is defeated.`);
    hook(F, 'onKill', e);
    const od = e.def.onDeath;
    if (od && F.player.hp > 0) {
      if (od.k === 'summon') summon(F, e, od.id);
      else if (od.k === 'junk') api.addJunk(F, od.id || od.item, od.n || 1);
      else if (od.k === 'heal') {
        // Heal the surviving allies; with none left it is a snack for the player.
        const rest = alive(F);
        if (rest.length) rest.forEach(a => api.heal(F, a, od.v));
        else api.heal(F, F.player, od.v);
      }
    }
    retarget(F);
    checkOver(F);
  }

  function summon(F, by, id) {
    if (!id) return null;
    if (alive(F).length >= MAX_ALIVE) { if (by) text(F, by, 'NO ROOM'); return null; }
    const e = makeEnemy(F, id);
    // Reuse a dead/escaped slot so indices stay within the 3 arena positions.
    let idx = F.enemies.findIndex(x => !x.alive);
    if (idx < 0 || F.enemies.length < MAX_ALIVE) { F.enemies.push(e); idx = F.enemies.length - 1; } else F.enemies[idx] = e;
    emit(F, { t: 'summon', idx });
    api.pickIntent(F, e);
    retarget(F);
    return e;
  }
  api.summon = (F, id) => summon(F, null, id);

  // ---------- intents ----------
  function unleash(v) {
    return { id: 'unleash', name: 'Unleash', k: 'attack', v, n: 1, charged: true, txt: `Unleashes a charged hit for ${v}.` };
  }
  api.pickIntent = function (F, e) {
    if (!e || !e.alive) return null;
    const moves = (e.def.moves || []).filter(Boolean);
    if (e.charged > 0) {
      e.intent = unleash(e.charged);
    } else if (!moves.length) {
      e.moveIdx = -1;
      e.intent = { id: 'idle', name: 'Idle', k: 'none', txt: 'Waits.' };
    } else {
      const ai = e.def.ai || 'cycle';
      let i = 0;
      if (ai === 'random') i = Math.floor(F.rng() * moves.length);
      else if (ai === 'weighted') {
        const ws = moves.map(m => Math.max(0, num(m.w, 1)));
        const tot = ws.reduce((a, b) => a + b, 0);
        if (tot <= 0) i = Math.floor(F.rng() * moves.length);
        else {
          let r = F.rng() * tot;
          i = ws.length - 1;
          for (let k = 0; k < ws.length; k++) { r -= ws[k]; if (r < 0) { i = k; break; } }
        }
      } else {
        const pat = (Array.isArray(e.def.pattern) && e.def.pattern.length)
          ? e.def.pattern.filter(p => p >= 0 && p < moves.length) : null;
        const seq = pat && pat.length ? pat : moves.map((m, k) => k);
        i = seq[e.cyc % seq.length];
        e.cyc++;
      }
      i = clamp(i | 0, 0, moves.length - 1);
      e.moveIdx = i;
      e.intent = moves[i];
    }
    emit(F, { t: 'intent', idx: F.enemies.indexOf(e) });
    return e.intent;
  };

  // Per-hit damage an attack intent would deal to the player right now.
  api.intentDmg = function (F, e) {
    const m = e && e.intent;
    if (!m || m.k !== 'attack') return null;
    const v = m.charged ? e.charged : num(m.v, 0);
    const vuln = F && F.player ? st(F.player, 'vuln') > 0 : false;
    const armor = F && F.player ? st(F.player, 'armor') : 0;
    return { v: calcHit(v, st(e, 'str'), st(e, 'weak') > 0, vuln, armor), n: Math.max(1, num(m.n, 1) | 0) };
  };

  function sName(s) { const d = statusDef(s); return (d && d.name) || s; }
  api.intentText = function (e) {
    const m = e && e.intent;
    if (!m) return '';
    const n = Math.max(1, num(m.n, 1) | 0);
    switch (m.k) {
      case 'attack': {
        const v = calcHit(m.charged ? e.charged : num(m.v, 0), st(e, 'str'), st(e, 'weak') > 0, false, 0);
        if (m.charged) return `Unleashes ${v}`;
        return n > 1 ? `Attacks for ${v}x${n}` : `Attacks for ${v}`;
      }
      case 'charge': return `Charging (${num(m.v, 0)} next turn)`;
      case 'block': return `Blocks ${num(m.v, 0)}`;
      case 'buff': return `Gains ${num(m.v, 1)} ${sName(m.s)}`;
      case 'debuff': return `Inflicts ${num(m.v, 1)} ${sName(m.s)}`;
      case 'heal': return `Heals ${num(m.v, 0)}`;
      case 'shake': return 'Shakes the bin';
      case 'grease': return 'Greases the bin';
      case 'fog': return 'Fogs the glass';
      case 'junk': {
        const d = tbl('ITEMS')[m.item || m.id];
        return `Adds ${Math.max(1, num(m.n, 1))} ${(d && d.name) || 'junk'} to your bin`;
      }
      case 'steal': return 'Steals an item';
      case 'freezeItem': return 'Freezes an item';
      case 'summon': {
        const d = tbl('ENEMIES')[summonId(m)];
        return `Summons ${(d && d.name) || 'help'}`;
      }
      case 'tilt': return 'Tilts the cabinet';
      case 'escape': return 'Tries to escape';
      case 'none': return 'Waits';
      default: return m.txt || m.name || '???';
    }
  };

  // A summon move's `id` doubles as the move id in the schema, so accept an
  // explicit summon/enemy/item field first, then `id` if it names an enemy.
  function summonId(m) {
    const E = tbl('ENEMIES');
    for (const k of ['summon', 'enemy', 'item', 'id']) if (m[k] && E[m[k]]) return m[k];
    return m.summon || m.enemy || null;
  }

  // ---------- enemy moves ----------
  function doMove(F, e, m) {
    if (!m) return;
    const p = F.player;
    const tgts = (m.to === 'all') ? alive(F) : [e];
    switch (m.k) {
      case 'attack': {
        const n = Math.max(1, num(m.n, 1) | 0);
        const v = m.charged ? e.charged : num(m.v, 0);
        if (m.charged) e.charged = 0;
        for (let i = 0; i < n && e.alive && p.hp > 0; i++) api.damage(F, e, p, v);
        break;
      }
      case 'block': tgts.forEach(a => gainBlock(F, a, num(m.v, 0))); break;
      case 'buff': tgts.forEach(a => api.status(F, a, m.s, num(m.v, 1))); break;
      case 'debuff': api.status(F, p, m.s, num(m.v, 1)); break;
      case 'heal': tgts.forEach(a => api.heal(F, a, num(m.v, 0))); break;
      case 'shake': emit(F, { t: 'binShake' }); break;
      case 'grease': {
        const v = Math.max(1, num(m.v, 1));
        api.status(F, p, 'grease', v);
        emit(F, { t: 'binGrease', turns: v });
        break;
      }
      case 'fog': {
        const v = Math.max(1, num(m.v, 1));
        api.status(F, p, 'fog', v);
        emit(F, { t: 'binFog', turns: v });
        break;
      }
      case 'junk': api.addJunk(F, m.item || m.id, Math.max(1, num(m.n, 1))); break;
      case 'steal': if (!api.stealItem(F)) text(F, e, 'NOTHING'); break;
      case 'freezeItem': if (!api.freezeItem(F)) text(F, e, 'NOTHING'); break;
      case 'summon': summon(F, e, summonId(m)); break;
      case 'tilt': {
        const dir = num(m.v, 0) < 0 ? -1 : num(m.v, 0) > 0 ? 1 : (F.rng() < 0.5 ? -1 : 1);
        F.tilt = dir;
        emit(F, { t: 'binTilt', dir });
        break;
      }
      case 'charge': {
        e.charged = Math.max(0, num(m.v, 0));
        text(F, e, 'CHARGING');
        break;
      }
      case 'escape': {
        e.alive = false;
        e.escaped = true;
        e.block = 0;
        F.escaped.push(e.id);
        // The die event carries escaped:true; the game shows ESCAPED from it.
        emit(F, { t: 'die', idx: F.enemies.indexOf(e), escaped: true });
        retarget(F);
        checkOver(F);
        break;
      }
      default: break;
    }
  }

  // One enemy's slot in the enemy phase.
  // Block normally fades when its owner's turn starts; each shield_up stack
  // saves it from one such reset ("block persists v turns").
  function blockReset(F, u) {
    const su = st(u, 'shield_up');
    if (su > 0) {
      if (su - 1) u.status.shield_up = su - 1; else delete u.status.shield_up;
    } else if (isPlayer(F, u) && num(F.rules && F.rules.blockKeep, 0) > 0) {
      // Castle Walls rule: the player's Block stays.
      if (u.block > 0) ruleProc(F, 'blockKeep', 'WALLS HOLD');
    } else u.block = 0;
  }

  function enemyAct(F, e) {
    blockReset(F, e);
    tickDmg(F, e, 'poison');
    if (!e.alive || F.phase === 'over') return;
    tickDmg(F, e, 'burn');
    if (!e.alive || F.phase === 'over') return;
    tickRegen(F, e);
    if (st(e, 'enrage') > 0) api.status(F, e, 'str', st(e, 'enrage'));
    if (st(e, 'freeze') > 0 || st(e, 'stun') > 0) {
      const s = st(e, 'freeze') > 0 ? 'freeze' : 'stun';
      e.status[s] = st(e, s) - 1;
      if (!e.status[s]) delete e.status[s];
      text(F, e, s === 'freeze' ? 'FROZEN' : 'STUNNED');
      decayTurns(e);
      return;   // intent is kept: the telegraph still stands next turn
    }
    tickDmg(F, e, 'bleed');
    if (!e.alive || F.phase === 'over') return;
    doMove(F, e, e.intent);
    if (e.alive && F.phase !== 'over') api.pickIntent(F, e);
    decayTurns(e);
  }

  // ---------- turn flow ----------
  function refill(F) {
    if (!F.used.length) return null;
    const room = Math.max(1, MAX_CABINET - F.bin.length);
    const items = F.used.splice(0, Math.min(F.used.length, room));
    F.bin.push(...items);
    emit(F, { t: 'refill', items });
    return items;
  }
  api.refill = function (F) { const c = begin(F); refill(F); return end(F, c); };
  function econ(k, d) {
    const e = D().ECONOMY;
    return Math.max(0, Math.round(num(e && e[k], d)));
  }
  // Turn start: top the bin up to binFloor, plus the trickle on top, picked
  // at random from the used pile, never past the cabinet cap.
  function trickle(F) {
    if (!F.used.length) return null;
    const want = Math.max(0, econ('binFloor', BIN_FLOOR) - F.bin.length) + econ('trickle', TRICKLE);
    const n = Math.min(F.used.length, MAX_CABINET - F.bin.length, want);
    if (n <= 0) return null;
    const items = [];
    for (let i = 0; i < n; i++) items.push(F.used.splice(Math.floor(F.rng() * F.used.length), 1)[0]);
    F.bin.push(...items);
    emit(F, { t: 'refill', items });
    return items;
  }

  // Player turn start. newFight runs it for turn 1; endTurn runs it for the
  // next turn. The game never needs to call it itself.
  api.startTurn = function (F) {
    const c = begin(F);
    if (!F || F.phase === 'over') return end(F, c);
    F.phase = 'player';
    const p = F.player;
    emit(F, { t: 'turn', n: F.turn });
    blockReset(F, p);
    p.grabsMax = clamp(Math.round(num(F.claw.grabs, 3)), 0, 99);
    p.grabs = p.grabsMax;
    p.grabsUsed = 0;
    F.playedThisTurn = 0;
    if (st(p, 'enrage') > 0) api.status(F, p, 'str', st(p, 'enrage'));
    tickDmg(F, p, 'poison');
    if (checkOver(F)) return end(F, c);
    tickRegen(F, p);
    for (const s of ['freeze', 'stun']) {
      if (st(p, s) > 0) {
        p.status[s] = st(p, s) - 1;
        if (!p.status[s]) delete p.status[s];
        p.grabs = Math.max(0, p.grabs - 1);
        text(F, p, s === 'freeze' ? 'FROZEN' : 'STUNNED');
      }
    }
    if (F.dry && F.used.length) refill(F);
    else trickle(F);
    F.dry = false;
    hook(F, 'onTurnStart');
    sanitize(F);
    checkOver(F);
    return end(F, c);
  };

  // A drop was made (call before rig.drop()). False when out of grabs.
  api.useGrab = function (F) {
    if (!F || F.phase !== 'player' || F.player.grabs <= 0) return false;
    F.player.grabs--;
    F.player.grabsUsed++;
    F.stats.grabs++;
    F.grab = { insts: [], defs: [] };   // a new grab: its deliveries start here
    return true;
  };
  // The streak shows as the player's `streak` status: a display counter set
  // directly (no status events, never decays, cleanse leaves buffs alone).
  function setStreak(F) {
    const k = clamp(Math.round(num(F.streak, 0)), 0, MAX_STACK);
    if (k > 0) F.player.status.streak = k; else delete F.player.status.streak;
  }
  // Resolve a combo's effects as if the player played them (Strength counts).
  function runCombo(F, combo) {
    retarget(F);
    const def = { id: combo.id, name: combo.name, tags: [], fx: combo.fx || [], target: combo.target || 'enemy' };
    const ctx = { inst: null, def, mode: def.target, idx: F.target, combo: true };
    for (const f of def.fx) {
      if (!f || ctx.stop || F.phase === 'over') break;
      runFx(F, f, ctx);
      ctx.acted = true;
    }
    sanitize(F);
    checkOver(F);
  }
  function fireCombo(F, combo, defs) {
    if (combo.once === 'turn') {
      if (F.comboTurn[combo.id] === F.turn) return false;
      F.comboTurn[combo.id] = F.turn;
    }
    emit(F, { t: 'combo', id: combo.id, name: combo.name, text: combo.text, color: combo.color || '#ffc94d',
      n: defs.length, tier: clamp(num(combo.tier, 1) | 0, 1, 3) });
    F.stats.combos++;
    F.combos[combo.id] = (F.combos[combo.id] || 0) + 1;
    log(F, `Combo: ${combo.name}.`);
    runCombo(F, combo);
    // Encore rule: every combo resolves twice.
    if (F.phase === 'player' && num(F.rules.comboTwice, 0) > 0) { ruleProc(F, 'comboTwice', 'ENCORE'); runCombo(F, combo); }
    if (F.phase === 'player') hook(F, 'onCombo', combo, defs);
    return true;
  }
  // A grab finished with n items delivered: the streak moves, the grab's
  // combos fire (DATA.combosFor over what it delivered), then onJackpot (3+
  // items) and onGrab(F, n). The grab buffer is cleared at the end.
  api.grabDone = function (F, n) {
    const c = begin(F);
    if (!F || typeof F !== 'object') return end(F, c);
    const g = F.grab || { insts: [], defs: [] };
    n = Math.max(0, num(n, 0) | 0);
    if (F.phase === 'player') {
      F.streak = n > 0 || g.defs.length ? num(F.streak, 0) + 1 : 0;
      setStreak(F);
      const defs = g.defs.slice();
      const fire = D().combosFor ? (D().combosFor(defs) || []) : [];
      for (const combo of fire) { if (F.phase !== 'player') break; if (combo && combo.id) fireCombo(F, combo, defs); }
      const got = Math.max(n, defs.length);
      if (F.phase === 'player' && got >= 3) hook(F, 'onJackpot', got);
      if (F.phase === 'player') hook(F, 'onGrab', n);
      sanitize(F);
      checkOver(F);
    }
    F.grab = { insts: [], defs: [] };
    return end(F, c);
  };
  api.comboFx = function (F, combo) { const c = begin(F); if (F && combo && F.phase === 'player') runCombo(F, combo); return end(F, c); };

  // Enemies hit by one hit of an item, by target mode.
  function hitTargets(F, mode, idx) {
    const al = alive(F);
    if (!al.length) return [];
    if (mode === 'all') return al;
    if (mode === 'random') return [al[Math.floor(F.rng() * al.length)]];
    let e = F.enemies[idx];
    if (!e || !e.alive) e = F.enemies[F.target];
    if (!e || !e.alive) e = al[0];
    return [e];
  }

  // The enemy a single-target item aims at (no rng: never 'random').
  function aimOf(F, ctx) { return hitTargets(F, 'enemy', ctx ? ctx.idx : F.target)[0] || null; }
  function countPer(F, per, ctx) {
    switch (per) {
      case 'block': return F.player.block;
      case 'junk': return F.bin.filter(isJunk).length;
      case 'metal': return F.bin.filter(i => tagHas(itemDef(i.id), 'metal')).length;
      case 'grabsUsed': return F.player.grabsUsed;
      case 'poison': case 'burn': { const e = aimOf(F, ctx); return e ? st(e, per) : 0; }
      case 'small': return F.bin.filter(i => tagHas(itemDef(i.id), 'small')).length;
      case 'streak': return Math.max(0, num(F.streak, 0));
      case 'gold': return Math.floor(api.gold(F) / 10);
      default: return 0;
    }
  }

  // An item effect as the relic rules change it: amp {tag: n} adds n to
  // damage, Block and healing (ceil(n/2) to statuses it applies), glassBreak
  // doubles a glass item's numbers. Self-harm is never amplified.
  function scaled(F, def, f) {
    const R = F.rules || {};
    if (!f || !def || !(R.amp || R.glassBreak)) return f;
    let add = 0, mul = 1;
    if (R.amp && typeof R.amp === 'object') for (const t in R.amp) if (tagHas(def, t)) add += num(R.amp[t], 0);
    if (num(R.glassBreak, 0) > 0 && tagHas(def, 'glass')) mul = 2;
    if (!add && mul === 1) return f;
    const v = num(f.v, 0);
    switch (f.k) {
      case 'dmg': case 'block': case 'heal': case 'lifesteal':
        return v > 0 ? Object.assign({}, f, { v: (v + add) * mul }) : f;
      case 'status':
        if (v <= 0 || (f.to === 'self' && isDebuff(f.s))) return f;
        return Object.assign({}, f, { v: (v + Math.ceil(add / 2)) * mul });
      case 'random':
        return Object.assign({}, f, { v: (v + add) * mul, min: (num(f.min, 0) + add) * mul, max: (num(f.max, v) + add) * mul });
      case 'dmgPer': case 'blockPer': return Object.assign({}, f, { v: v * mul });
      default: return f;
    }
  }
  // Run an item's effect list in order (a pay that fails stops the rest).
  function resolveFx(F, ctx, plus) {
    for (const f0 of fxOf(ctx.def, plus)) {
      if (!f0 || F.result === 'lose' || ctx.stop) break;
      runFx(F, scaled(F, ctx.def, f0), ctx);
      ctx.acted = true;
    }
  }
  const hasAgain = (def, plus) => fxOf(def, plus).some(f => f && f.k === 'again');
  // The `again` fx: the previous item played this fight resolves once more.
  function replay(F, ctx) {
    const last = F.lastPlay;
    if (!last || !last.def || hasAgain(last.def, last.plus)) { text(F, F.player, 'NOTHING'); return; }
    if (ctx.def && ctx.def.id) itemProc(F, ctx.def, 'AGAIN: ' + String(last.def.name || last.def.id).toUpperCase());
    retarget(F);
    resolveFx(F, { inst: last.inst, def: last.def, mode: last.def.target || 'enemy', idx: F.target, again: true }, last.plus);
  }

  // Resolve one item effect.
  function runFx(F, f, ctx) {
    const p = F.player;
    const v = num(f.v, 0);
    const hit = (base) => hitTargets(F, ctx.mode, ctx.idx).map(e => api.damage(F, p, e, base));
    switch (f.k) {
      case 'dmg': {
        const n = Math.max(1, num(f.n, 1) | 0);
        if (v < 0) { loseHp(F, p, -v * n); break; }
        for (let i = 0; i < n && F.phase !== 'over'; i++) hit(v);
        break;
      }
      case 'block': gainBlock(F, p, v); break;
      case 'heal': api.heal(F, p, v); break;
      case 'status': {
        const to = f.to || ((ctx.mode === 'self' || ctx.mode === 'none' || !isDebuff(f.s)) ? 'self' : 'enemy');
        const sv = f.v == null ? 1 : v;
        if (to === 'self') api.status(F, p, f.s, sv);
        else if (to === 'all') alive(F).forEach(e => api.status(F, e, f.s, sv));
        else hitTargets(F, ctx.mode, ctx.idx).forEach(e => api.status(F, e, f.s, sv));
        break;
      }
      case 'grab': {
        const g = Math.round(v);
        p.grabs = clamp(p.grabs + g, 0, 99);
        emit(F, { t: 'grab', v: g });
        break;
      }
      case 'gold': api.gainGold(F, v); break;
      case 'ink': F.gain.ink += Math.round(v); text(F, p, `${v >= 0 ? '+' : ''}${Math.round(v)} bulbs`); break;
      case 'maxhp': api.gainMaxHp(F, v); break;
      case 'shake': emit(F, { t: 'binShake' }); break;
      case 'junk': api.addJunk(F, f.id || f.item, f.n == null ? 1 : f.n); break;
      case 'purge': api.removeJunk(F, f.n == null ? 1 : f.n); break;
      case 'copy': copyItem(F, ctx.inst, f.tag); break;
      case 'dmgPer': {
        const total = v * countPer(F, f.per, ctx);
        if (total > 0) hit(total);
        else if (!ctx.acted) text(F, p, 'FIZZLE');
        break;
      }
      case 'blockPer': {
        const total = Math.floor(v * countPer(F, f.per, ctx));
        if (total > 0) gainBlock(F, p, total);
        break;
      }
      case 'pay': {
        // Spend the run's gold (gold at fight start + gains this fight).
        const cost = Math.max(0, Math.round(v));
        if (api.gold(F) < cost) { text(F, p, 'BROKE'); ctx.stop = true; break; }
        if (cost) { F.gain.gold -= cost; F.stats.spent += cost; text(F, p, `-${cost} gold`); }
        break;
      }
      case 'again': if (!ctx.again) replay(F, ctx); break;
      case 'cleanse':
        for (const k of Object.keys(p.status)) if (isDebuff(k)) removeStatus(F, p, k);
        break;
      case 'lifesteal': {
        const dealt = hit(v).reduce((a, b) => a + b, 0);
        if (dealt > 0) api.heal(F, p, dealt);
        break;
      }
      case 'random': {
        const lo = Math.round(num(f.min, f.max == null ? 1 : 0));
        const hi = Math.max(lo, Math.round(num(f.max, v || lo)));
        const n = Math.max(1, num(f.n, 1) | 0);
        for (let i = 0; i < n && F.phase !== 'over'; i++) hit(F.rng.int(lo, hi));
        break;
      }
      case 'poisonAll': {
        // With v: poison every enemy. Without: every enemy takes its poison now.
        if (f.v != null) alive(F).forEach(e => api.status(F, e, 'poison', v));
        else alive(F).forEach(e => loseHp(F, e, st(e, 'poison')));
        break;
      }
      default: break;
    }
  }

  function copyItem(F, self, tag) {
    const ok = (i) => i !== self && !isJunk(i) && (!tag || tagHas(itemDef(i.id), tag));
    let pool = F.bin.filter(i => ok(i) && !i.frozen);
    if (!pool.length) pool = F.used.filter(ok);
    if (!pool.length || F.bin.length + F.used.length >= MAX_ITEMS) { text(F, F.player, 'NOTHING'); return null; }
    const src = pool[Math.floor(F.rng() * pool.length)];
    const inst = { uid: newUid(), id: src.id, plus: !!src.plus, frozen: false, junk: false, temp: true };
    F.bin.push(inst);
    emit(F, { t: 'binCopy', inst });
    return inst;
  }

  function findInst(list, inst) {
    const uid = inst && typeof inst === 'object' ? inst.uid : inst;
    return list.findIndex(i => i === inst || (uid != null && i.uid === uid));
  }

  // Resolve a delivered item. Returns the events of this play.
  api.play = function (F, inst, targetIdx) {
    const c = begin(F);
    if (!F || F.phase !== 'player') return end(F, c);
    const at = findInst(F.bin, inst);
    if (at < 0) return end(F, c);
    inst = F.bin.splice(at, 1)[0];
    const def = itemDef(inst.id);
    const mode = def.target || 'enemy';
    if (typeof targetIdx === 'number') api.setTarget(F, targetIdx);
    retarget(F);
    const idx = F.target;
    emit(F, { t: 'play', inst, def, target: mode === 'enemy' ? idx : -1 });
    F.stats.played++;
    F.playedThisTurn++;
    if (inst.frozen) {
      // Encased in ice: the grab only chipped it free.
      inst.frozen = false;
      text(F, F.player, 'THAWED');
      F.used.push(inst);
    } else {
      const plus = !!inst.plus;
      const ctx = { inst, def, mode, idx };
      // Rules that change this item's numbers credit their relic.
      const real = !isJunk(inst) && fxOf(def, plus).length > 0;
      if (real && num(F.rules.glassBreak, 0) > 0 && tagHas(def, 'glass')) ruleProc(F, 'glassBreak', 'GLASS CANNON');
      if (real && F.rules.amp && !F.grab.amped && Object.keys(F.rules.amp).some(t => tagHas(def, t))) {
        F.grab.amped = true;   // once a grab: a scoop of marbles is one proc
        ruleProc(F, 'amp');
      }
      resolveFx(F, ctx, plus);
      // Echo rule: every nth magic item played resolves twice.
      const echo = Math.round(num(F.rules.echo, 0));
      if (echo > 0 && tagHas(def, 'magic') && F.phase === 'player') {
        F.echoN++;
        if (F.echoN % echo === 0) {
          ruleProc(F, 'echo', 'ECHO');
          retarget(F);
          resolveFx(F, { inst, def, mode, idx: F.target, again: true }, plus);
        }
      }
      if (!hasAgain(def, plus)) F.lastPlay = { inst, def, plus };
      // Bleed: the player bleeds when acting (playing an item).
      if (F.phase !== 'over') tickDmg(F, F.player, 'bleed');
      if (F.result !== 'lose') hook(F, 'onPlay', inst, def);
      // Glass that exhausts shatters (Glass Cannon makes every glass item do so).
      const glass = tagHas(def, 'glass');
      const gone = exhausts(def, plus) || (glass && num(F.rules.glassBreak, 0) > 0);
      (gone ? F.exhausted : F.used).push(inst);
      if (gone && glass && F.result !== 'lose') {
        F.stats.shattered++;
        itemProc(F, def, 'SHATTER');
        hook(F, 'onShatter', inst, def);
      }
      // This grab's deliveries, for the combos at grabDone.
      F.grab.insts.push(inst);
      F.grab.defs.push(def);
    }
    sanitize(F);
    checkOver(F);
    // Never leave an empty cabinet mid-turn.
    if (F.phase === 'player' && !F.bin.length) refill(F);
    return end(F, c);
  };

  // Player ends the turn: onTurnEnd, burn, player decay, the enemy phase, then
  // (unless the fight is over) turn+1 and startTurn. Returns all those events.
  api.endTurn = function (F) {
    const c = begin(F);
    if (!F || F.phase !== 'player') return end(F, c);
    const p = F.player;
    hook(F, 'onTurnEnd');
    if (checkOver(F)) return end(F, c);
    tickDmg(F, p, 'burn');
    if (checkOver(F)) return end(F, c);
    F.tilt = 0;
    F.fresh = {};
    F.dry = !F.playedThisTurn;
    F.phase = 'enemy';
    for (const e of F.enemies.slice()) {
      if (!e.alive || F.enemies.indexOf(e) < 0) continue;
      enemyAct(F, e);
      sanitize(F);
      if (checkOver(F)) break;
    }
    // End of round: the player's turn-based statuses lose a stack (after the
    // enemies acted, so a vuln on the player bites during the enemy phase).
    decayTurns(p, F.fresh);
    F.fresh = {};
    if (!checkOver(F)) {
      F.turn++;
      api.startTurn(F);
    }
    return end(F, c);
  };

  // ---------- bin manipulation ----------
  api.addJunk = function (F, id, n) {
    const c = [];
    if (!F || !id) return c;
    n = clamp(Math.round(num(n, 1)), 0, 20);
    for (let i = 0; i < n && F.bin.length + F.used.length < MAX_ITEMS; i++) {
      const inst = { uid: newUid(), id, plus: false, frozen: false, junk: true, temp: true };
      F.bin.push(inst);
      c.push(inst);
    }
    if (c.length) emit(F, { t: 'binJunk', items: c });
    if (c.length) hook(F, 'onJunk', c.length, c);
    return c;
  };
  // Temporary (this fight only) copies of an item, e.g. a relic's marbles.
  api.addTemp = function (F, id, n) {
    const out = [];
    if (!F || !id) return out;
    n = clamp(Math.round(num(n, 1)), 0, 20);
    for (let i = 0; i < n && F.bin.length + F.used.length < MAX_ITEMS; i++) {
      const inst = { uid: newUid(), id, plus: false, frozen: false, junk: false, temp: true };
      if (F.bin.length < MAX_CABINET) { F.bin.push(inst); emit(F, { t: 'binCopy', inst }); } else F.used.push(inst);
      out.push(inst);
    }
    return out;
  };
  // Copy a random bin item (of a tag, when given) for this fight.
  api.copy = function (F, tag) { return F ? copyItem(F, null, tag) : null; };
  // Gold gained in the fight (F.gain.gold, paid out by the game at the end).
  api.gainGold = function (F, v) {
    v = Math.round(num(v, 0));
    if (!F || !v) return 0;
    F.gain.gold += v;
    text(F, F.player, `${v >= 0 ? '+' : ''}${v} gold`);
    if (v > 0) hook(F, 'onGold', v);
    return v;
  };
  // The gold the run holds right now: at fight start plus this fight's gains.
  api.gold = function (F) { return F ? Math.max(0, num(F.gold0, 0) + num(F.gain && F.gain.gold, 0)) : 0; };
  // Max HP for good (F.gain.maxhp goes back to the run); a gain heals as much.
  api.gainMaxHp = function (F, v) {
    const g = Math.round(num(v, 0));
    if (!F || !g) return 0;
    const p = F.player, before = p.maxHp;
    p.maxHp = Math.max(1, p.maxHp + g);
    F.gain.maxhp += p.maxHp - before;
    if (g > 0) api.heal(F, p, g); else p.hp = Math.min(p.hp, p.maxHp);
    return p.maxHp - before;
  };
  // Remove up to n junk from the fight (bin first, then used).
  api.removeJunk = function (F, n) {
    const out = [];
    if (!F) return out;
    n = clamp(Math.round(num(n, 1)), 0, 99);
    for (const list of [F.bin, F.used]) {
      for (let i = 0; i < list.length && out.length < n;) {
        if (isJunk(list[i])) out.push(list.splice(i, 1)[0]); else i++;
      }
    }
    if (out.length) { F.purged.push(...out); emit(F, { t: 'binPurge', insts: out }); }
    return out;
  };
  // Take a random non-junk bin item away until the fight ends.
  api.stealItem = function (F) {
    if (!F) return null;
    const pool = F.bin.filter(i => !isJunk(i));
    if (!pool.length) return null;
    const inst = pool[Math.floor(F.rng() * pool.length)];
    F.bin.splice(F.bin.indexOf(inst), 1);
    F.stolen.push(inst);
    emit(F, { t: 'binSteal', inst });
    return inst;
  };
  // Encase a random bin item in ice (junk-like until played once).
  api.freezeItem = function (F) {
    if (!F) return null;
    let pool = F.bin.filter(i => !i.frozen && !isJunk(i));
    if (!pool.length) pool = F.bin.filter(i => !i.frozen);
    if (!pool.length) return null;
    const inst = pool[Math.floor(F.rng() * pool.length)];
    inst.frozen = true;
    emit(F, { t: 'binFreeze', inst });
    return inst;
  };

  // ---------- previews ----------
  // Damage the item would deal to the current target (before its block),
  // walking fx in order so an earlier vuln/str in the same item counts.
  api.previewDamage = function (F, def, plus) {
    if (typeof def === 'string') def = itemDef(def);
    if (!F || !def) return 0;
    const p = F.player;
    const mode = def.target || 'enemy';
    const t = F.enemies[F.target] && F.enemies[F.target].alive ? F.enemies[F.target] : alive(F)[0];
    let str = st(p, 'str');
    let weak = st(p, 'weak') > 0;
    let vuln = t ? st(t, 'vuln') > 0 : false;
    const armor = t ? st(t, 'armor') : 0;
    let block = p.block;
    let total = 0;
    const sh = num(F.rules && F.rules.shatter, 0);
    const frozen = !!(t && sh > 0 && st(t, 'freeze') > 0);
    const one = (b) => { const h = calcHit(b, str, weak, vuln, armor); return frozen ? Math.floor(h * (1 + sh)) : h; };
    const ctx = { idx: F.target };
    const added = {};   // poison / burn this item puts on the target before a dmgPer reads it
    for (const f0 of fxOf(def, plus)) {
      if (!f0) continue;
      const f = scaled(F, def, f0);
      const v = num(f.v, 0);
      if (f.k === 'pay' && api.gold(F) < Math.round(v)) break;
      switch (f.k) {
        case 'dmg': if (v > 0) total += one(v) * Math.max(1, num(f.n, 1) | 0); break;
        case 'lifesteal': total += one(v); break;
        case 'dmgPer': {
          const cnt = f.per === 'block' ? block : countPer(F, f.per, ctx) + (added[f.per] || 0);
          if (v * cnt > 0) total += one(v * cnt);
          break;
        }
        case 'blockPer': block = Math.max(0, block + Math.floor(v * (f.per === 'block' ? block : countPer(F, f.per, ctx)))); break;
        case 'random': {
          const lo = Math.round(num(f.min, f.max == null ? 1 : 0));
          const hi = Math.max(lo, Math.round(num(f.max, v || lo)));
          total += one(Math.round((lo + hi) / 2)) * Math.max(1, num(f.n, 1) | 0);
          break;
        }
        case 'block': block = Math.max(0, block + v); break;
        case 'status': {
          const to = f.to || ((mode === 'self' || mode === 'none' || !isDebuff(f.s)) ? 'self' : 'enemy');
          const sv = f.v == null ? 1 : v;
          if (to === 'self' && f.s === 'str') str += sv;
          if (to === 'self' && f.s === 'weak') weak = weak || sv > 0;
          if (to !== 'self' && f.s === 'vuln' && sv > 0) vuln = true;
          if (to !== 'self' && (f.s === 'poison' || f.s === 'burn')) added[f.s] = (added[f.s] || 0) + sv;
          break;
        }
        case 'cleanse': weak = false; break;
        default: break;
      }
    }
    return Math.max(0, Math.round(total));
  };

  // Relic hooks and other content emit through here so the event reaches
  // F.events and every open collector (play/endTurn return values).
  api.emit = function (F, ev) { return F && ev ? emit(F, ev) : ev; };
  api.isJunk = isJunk;
  api.calcHit = calcHit;
  api.MAX_ALIVE = MAX_ALIVE;
  api.MAX_ITEMS = MAX_ITEMS;
  api.MAX_CABINET = MAX_CABINET;
  return api;
})();
