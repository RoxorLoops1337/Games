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
  // Feel (round 4): an enemy's Armor stops at ARMOR_MAX. Uncapped, the Frozen
  // Knight's Temper reached 34 Armor and a low-damage build could never hurt it.
  const ARMOR_MAX = 8;
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
    'stun', 'poison', 'burn', 'regen', 'bleed', 'streak', 'luck'];
  // Round 3: Lucky Lou's Luck meter (DESIGN.md "Lucky Lou and the synergy
  // pass"). Luck is a player status that never decays, capped at max. With
  // the meter on (the gambler, or the Rabbit's Foot rule) an empty grab gives
  // miss Luck and a near miss (the game's SO CLOSE) near. A grab that
  // delivers 2+ items cashes all of it out: per damage per Luck to ALL
  // enemies (+rules.cashAmp), x jackpot on 3+ items. While the player holds
  // Luck, dice (the `random` fx) roll twice and keep the best.
  const LUCK = { max: 10, miss: 2, near: 1, per: 2, jackpot: 1.5 };
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
  // A relic, or a set bonus / boon effect riding next to the relics (SETS block).
  const relicDef = (id) => tbl('RELICS')[id] || tbl('SET_FX')[id] || tbl('EVO_FX')[id] || null;   // EVO_FX: an evolved item's aura (EVOLVE block)

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
  // Effect list for an instance: plus.fx when upgraded and present; (round 21) plus 2 reads DATA's derived list.
  function fxOf(def, plus) {
    if (plus === 2 && D().cmp2FxAt) { const f2 = D().cmp2FxAt(def, 2); if (Array.isArray(f2)) return f2; }
    if (plus && def.plus && Array.isArray(def.plus.fx)) return def.plus.fx;
    return Array.isArray(def.fx) ? def.fx : [];
  }
  // (round 21) an instance's plus as COMBAT keeps it: false, true (+1) or 2 (+2, the Compactor's second merge).
  const cmp2Plus = (i) => (i && i.plus === 2 ? 2 : !!(i && i.plus));
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
      for (const id of setHookIds(F)) {   // the relics, then the live set bonuses (SETS block)
        const r = relicDef(id);
        const fn = r && r.hooks && r.hooks[name];
        if (typeof fn !== 'function') continue;
        const mark = F.events.length;
        const cols = (OUT.get(F) || []).map(c => [c, c.length]);
        try { fn(F, ...args); } catch (err) {
          F.hookErrors.push(`${id}.${name}: ${err && err.message || err}`);
        }
        for (let i = mark; i < F.events.length; i++) { const e = F.events[i]; if (e && e.t !== 'proc' && e.src == null) e.src = id; }   // (RROW round 21) what a relic did carries its id: the resolve row credits it
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

  // ================= TILT (meta progression, DESIGN.md "Meta") =================
  // F.tiltLv (the run's Tilt, 0..10) -> DATA.tiltMods(lv), the cumulative
  // twists. Read here only: enemy hp / attack multipliers on top of
  // DATA.DIFFICULTY and its ramp (summons too, through makeEnemy), a faster
  // hidden escalation, one more elite affix, boss rage from the opening
  // bell. DATA.DIFFICULTY itself is never touched; Tilt 0 changes nothing.
  const TILT_ONE = [1, 1];
  function tiltModsOf(F) {
    const lv = F ? num(F.tiltLv, 0) : 0;
    const fn = D().tiltMods;
    if (!(lv > 0) || typeof fn !== 'function') return null;
    try { return fn(lv); } catch (err) { return null; }
  }
  // [hpMul, dmgMul] for makeEnemy.
  function tiltScale(F) {
    const m = tiltModsOf(F);
    if (!m) return TILT_ONE;
    let hp = 1 + num(m.hp, 0), dmg = 1 + num(m.dmg, 0);
    // Hot Streak: the ramp steps every m.ramp fights instead of ramp.every.
    const ramp = (D().DIFFICULTY || {}).ramp || null;
    if (num(m.ramp, 0) > 0 && ramp && num(ramp.every, 0) > m.ramp) {
      const f = num(F.fights, 0), cap = num(ramp.max, 99);
      const s0 = Math.min(Math.floor(f / ramp.every), cap), s1 = Math.min(Math.floor(f / m.ramp), cap);
      hp *= (1 + s1 * num(ramp.hp, 0)) / (1 + s0 * num(ramp.hp, 0));
      dmg *= (1 + s1 * num(ramp.dmg, 0)) / (1 + s0 * num(ramp.dmg, 0));
    }
    return [hp, dmg];
  }
  // Once per fight, after the rolled affixes: Bent Prong gives every elite
  // one more affix (never Greedy on a gulper), Rigged hands every boss its
  // phase two Strength up front (the transformation itself still comes at
  // half hp, with more Strength).
  function tiltFight(F, rng) {
    const m = tiltModsOf(F);
    if (!m) return;
    for (const e of F.enemies) {
      const tier = e.def && e.def.tier;
      if (tier === 'elite' && num(m.eliteAffix, 0) > 0) {
        const eats = (e.def.moves || []).some(mv => mv && mv.k === 'gulp');
        const ids = Object.keys(D().AFFIXES || {}).filter(id => !hasAffix(e, id) && !(id === 'greedy' && eats));
        for (let k = 0; k < m.eliteAffix && ids.length; k++) giveAffix(F, e, ids.splice(Math.floor(rng() * ids.length), 1)[0]);
      }
      if (tier === 'boss' && num(m.bossRage, 0) > 0 && e.def.enrage !== false) {
        const R = (e.def.enrage && typeof e.def.enrage === 'object') ? e.def.enrage : {};
        const s = R.str != null ? num(R.str, 0) : (F.act >= 2 ? 2 : 1);
        if (s > 0) e.status.str = clamp(st(e, 'str') + s, 0, MAX_STACK);
      }
    }
  }
  api.tiltScale = tiltScale;
  // ================= /TILT =================

  // ================= ENDLESS (endless mode and run mutators, DESIGN.md "Endless and mutators") =================
  // newFight sets F.loop (the Endless loop, 0 outside it), F.mix (the boss
  // whose signature this loop's boss borrows) and F.mut (DATA.mutMods of
  // run.muts, null when none). Read here only: the loop's hp / attack lift
  // (makeEnemy, summons too), extra affixes, phase two from the opening bell
  // and the borrowed signature (endlessFight), the mutators' grabs and rules
  // (endlessSetup), their affixes on every enemy (endlessEnemy) and the
  // halved hits (damage). A run with neither is untouched.
  const END_ONE = [1, 1];
  function endlessScaleOf(F) {
    const loop = F ? num(F.loop, 0) : 0, fn = D().endlessScale;
    if (!(loop > 0) || typeof fn !== 'function') return null;
    try { return fn(loop, F.act); } catch (err) { return null; }
  }
  // [hpMul, dmgMul] for makeEnemy.
  function endlessMul(F) {
    const s = endlessScaleOf(F);
    return s ? [Math.max(0.1, num(s.hp, 1)), Math.max(0.1, num(s.dmg, 1))] : END_ONE;
  }
  function endlessSetup(F, run) {
    const E = run && run.endless && typeof run.endless === 'object' ? run.endless : null;
    F.loop = E ? clamp(num(E.loop, 0) | 0, 0, 999) : 0;
    F.mix = F.loop > 0 && E.mix ? String(E.mix) : null;
    let m = null;
    if (Array.isArray(run.muts) && run.muts.length && typeof D().mutMods === 'function') { try { m = D().mutMods(run.muts); } catch (err) { m = null; } }
    F.mut = m && m.ids && m.ids.length ? m : null;
    if (!F.mut) return;
    if (num(F.mut.grabs, 1) !== 1) F.claw.grabs = clamp(Math.round(F.claw.grabs * num(F.mut.grabs, 1)), 1, 9);
    for (const k in F.mut.rules || {}) {
      F.rules[k] = num(F.rules[k], 0) + num(F.mut.rules[k], 0);
      if (!F.ruleSrc[k]) F.ruleSrc[k] = F.mut.ids.find(id => (((D().MUTATORS || {})[id] || {}).fx || {}).rules) || k;
    }
  }
  // Every enemy (summons too): the mutators' affixes (a gulper is never also Greedy).
  function endlessEnemy(F, e) {
    if (!F.mut || !F.mut.affix || !F.mut.affix.length) return;
    const eats = (e.def.moves || []).some(mv => mv && mv.k === 'gulp');
    for (const id of F.mut.affix) if ((D().AFFIXES || {})[id] && !(id === 'greedy' && eats)) giveAffix(F, e, id);
  }
  // Once per fight after the rolled and Tilt affixes: the loop's extra
  // affixes, the borrowed signature, phase two from the opening bell.
  function endlessFight(F, rng) {
    const s = endlessScaleOf(F);
    if (!s) return;
    for (const e of F.enemies) {
      const tier = (e.def && e.def.tier) || 'normal';
      const n = tier === 'normal' ? num(s.normalAffix, 0) : num(s.bigAffix, 0);
      if (n > 0) {
        const eats = (e.def.moves || []).some(mv => mv && mv.k === 'gulp');
        const ids = Object.keys(D().AFFIXES || {}).filter(id => !hasAffix(e, id) && !(id === 'greedy' && eats));
        for (let k = 0; k < n && ids.length; k++) giveAffix(F, e, ids.splice(Math.floor(rng() * ids.length), 1)[0]);
      }
      if (tier === 'boss' && s.mix && F.mix) endlessBorrow(F, e);
      if ((tier === 'boss' && s.rage) || (tier === 'elite' && s.eliteRage)) endlessRage(F, e);
    }
  }
  // The loop's boss learns another boss's trick (its own cadence stays the borrowed one's).
  function endlessBorrow(F, e) {
    const src = enemyDef(F.mix), sig = src && src.sig;
    if (!sig || typeof sig !== 'object' || !e.def.sig || e.def.sig.id === sig.id) return false;
    e.def = Object.assign({}, e.def, { sig: Object.assign({}, sig) });
    e.borrowed = F.mix;
    return true;
  }
  // Phase two from the opening bell (no half hp needed): the roar, the
  // Strength, the new pattern and the boss's phase two trick.
  function endlessRage(F, e) {
    if (e.enraged || !e.alive || e.def.enrage === false) return;
    e.enraged = true;
    const R = (e.def.enrage && typeof e.def.enrage === 'object') ? e.def.enrage : {};
    const moves = e.def.moves || [];
    emit(F, { t: 'enrage', idx: F.enemies.indexOf(e), name: R.name || 'ENRAGED', text: `Loop ${F.loop}: ${e.def.name || e.id} is furious from the bell` });
    const str = R.str != null ? num(R.str, 0) : (F.act >= 2 ? 2 : 1);
    if (str > 0) e.status.str = clamp(st(e, 'str') + str, 0, MAX_STACK);
    const pat = Array.isArray(R.pattern) ? R.pattern.filter(i => i >= 0 && i < moves.length) : [];
    if (pat.length && (e.def.ai || 'cycle') === 'cycle') { e.def = Object.assign({}, e.def, { pattern: pat }); e.cyc = 0; }
    bossPhase(F, e);
  }
  api.endlessScaleOf = endlessScaleOf;
  // ================= /ENDLESS =================

  // ---------- fight setup ----------
  // (round 21, DESIGN.md "Combo relics and a gentler, clearer start") DATA.DIFFICULTY.act1 {hp, dmg, elite?, boss?}:
  // act 1 enemies fought in act 1 (never a minion, never after the Endless reboot): a normal reads {hp, dmg}, the
  // run's first fight included (round 22: no gentler first fight any more), an elite or a boss its own sub-dial
  // (none: untouched). An act 1 enemy pulled into a later act reads nothing.
  function crAct1Mul(F, def, tier, diff) {
    const A = diff && diff.act1;
    if (!A || def.minion || F.act !== 1 || num(F.loop, 0) > 0 || clamp(num(def.act, 1) | 0, 1, 3) !== 1) return [1, 1];
    const k = tier === 'normal' ? A : (A[tier] && typeof A[tier] === 'object' ? A[tier] : null);
    if (!k) return [1, 1];
    return [Math.max(0.1, num(k.hp, 1)), Math.max(0.1, num(k.dmg, 1))];
  }
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
    // BALANCE (round 12): elites and bosses hit harder than the normals' dial (DATA.DIFFICULTY.tierDmg, 1 = off)
    if (diff.tierDmg && diff.tierDmg[tier] != null) dmgMul *= num(diff.tierDmg[tier], 1);
    { const a1 = crAct1Mul(F, def, tier, diff); hpMul *= a1[0]; dmgMul *= a1[1]; }   // (round 21/22) the act 1 dial: normals a threat, elites a step up, not a wall
    { const tsc = tiltScale(F); hpMul *= tsc[0]; dmgMul *= tsc[1]; }   // meta: the run's Tilt level (TILT block)
    { const esc = endlessMul(F); hpMul *= esc[0]; dmgMul *= esc[1]; }   // the Endless loop's lift (ENDLESS block)
    { const dm = depMul(def); hpMul *= dm[0]; dmgMul *= dm[1]; }   // DEP (round 15): the Neon Depths' danger dial
    let edef = def;
    if (hpMul !== 1) hp = Math.max(1, Math.round(hp * hpMul));
    if (dmgMul !== 1 && Array.isArray(def.moves)) {
      edef = Object.assign({}, def, { moves: def.moves.map(m => (m && (m.k === 'attack' || m.k === 'charge') && m.v != null) ? Object.assign({}, m, { v: Math.max(1, Math.round(m.v * dmgMul)) }) : m) });
    }
    const e = {
      uid: newUid(), id, def: edef, hp, maxHp: hp, block: 0, status: {}, intent: null, moveIdx: -1,
      alive: true, charged: 0, escaped: false, cyc: 0,
      // The monsters pass: swallowed items [{inst, turns, kind, str, armor}],
      // damage taken this player turn (hiccups), actions taken (Hasty /
      // Greedy), affix ids, the phase two flag and the attack multiplier.
      belly: [], gut: 0, acts: 0, affix: [], enraged: false, dmgMul,
    };
    // Optional starting statuses (e.g. a golem's armor): def.status {s: v}.
    if (def.status && typeof def.status === 'object') {
      for (const s in def.status) e.status[s] = clamp(Math.round(num(def.status[s], 0)), 0, s === 'armor' ? ARMOR_MAX : MAX_STACK);
    }
    endlessEnemy(F, e);   // the run's mutators: Hungry Hungry, Jackpot Fever (ENDLESS block)
    return e;
  }

  // run: {hp, maxHp, act, bin:[inst], relics:[ids], claw:{...}}; rng: U.rng fn or a seed.
  api.newFight = function (run, enemyIds, rng) {
    run = run || {};
    if (typeof rng !== 'function') {
      const seed = num(rng, num(run.seed, 1) + num(run.turns, 0) * 7919);
      rng = (typeof U !== 'undefined') ? U.rng(seed) : null;
    }
    const setIds = setFxOf(run);   // live set bonuses and boon effects (SETS block)
    const mods = api.relicMods((run.relics || []).concat(setIds));
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
      bin: (run.bin || []).map(i => ({ uid: i.uid || newUid(), id: i.id, plus: cmp2Plus(i), frozen: false, junk: !!i.junk })),   // (round 21: a +2 stays +2)
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
    F.sets = setIds;
    F.cr = crFam(F.relics);   // (round 21) the combo families the run's combo relics switch on (CR block)
    evoFight(F, run);   // the evolved items' auras and the pet along (EVOLVE block)
    const rs = api.rulesOf(F.relics.concat(setIds, F.evos));
    F.rules = rs.rules; F.ruleSrc = rs.src;
    // Round 3: who is fighting with which claw (relics read F.clawType), and
    // the Luck meter: the gambler's gift, doubled by the Rabbit's Foot, or
    // the Rabbit's Foot alone for any other crawler.
    F.char = run.char || null;
    F.clawType = run.clawType || 'classic';
    {
      const cd = run.char ? (tbl('CHARACTERS')[run.char] || null) : null;
      const gift = !!(cd && cd.luck), foot = num(F.rules.luck, 0) > 0;
      F.luckK = gift ? (foot ? 2 : 1) : (foot ? 1 : 0);
    }
    F.stats.tix = 0; F.stats.cash = 0;
    F.tur = null;   // Mama Mech's turret (CR8 block; cr8Fight builds it once the fight is set up)
    // A late-run bin can outgrow the cabinet: the overflow waits in the used
    // pile and cycles in through refills, so the physics budget holds.
    if (F.bin.length > MAX_CABINET) {
      const all = F.rng.shuffle(F.bin);
      F.bin = all.slice(0, MAX_CABINET);
      F.used = all.slice(MAX_CABINET);
    }
    F.tiltLv = clamp(num(run.tilt, 0) | 0, 0, 10);   // meta: the run's Tilt level (TILT block)
    endlessSetup(F, run);   // the Endless loop and the run's mutators (ENDLESS block)
    for (const id of (enemyIds || []).slice(0, MAX_ALIVE)) F.enemies.push(makeEnemy(F, id));
    if (!F.enemies.length) F.enemies.push(makeEnemy(F, 'dummy'));
    // Elite affixes ride their own rng stream so the fight's rolls stay put.
    const arng = (typeof U !== 'undefined' && U.rng) ? U.rng((num(F.seed, 0) ^ 0x51f15e) + 1) : null;
    if (arng) F.enemies.forEach(e => rollAffixes(F, e, arng));
    if (arng) tiltFight(F, arng);   // meta: Tilt's extra elite affix and boss rage (TILT block)
    if (arng) endlessFight(F, arng);   // Endless: extra affixes, a borrowed trick, rage from the bell (ENDLESS block)
    if (arng) secFight(F, run, arng);   // the Back Room's elites: the strongest affixes (SECRET block)
    F.digested = [];   // items enemies swallowed and digested: gone for this fight only
    for (const e of F.enemies) api.pickIntent(F, e);
    famFight(F);   // enemy families: the Crescendo, the choir's lockstep (FAMILY block)
    cr8Fight(F, run);   // Mama Mech's turret (CR8 block)
    rosFight(F, run);   // Ms. Bubbles' bubbles, Tiny Claw's size (ROS block)
    legFight(F);   // the legendary relics' merged `leg` numbers (LEG block)
    techFight(F, run);   // Cabinet Tech: the cabinet's state for the relics, quiet until the game says (TECH block)
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
      else if (tgt.alive && amt > 0) monsterHurt(F, tgt, amt);
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
      // Double Grabs, Half Damage (a run mutator, ENDLESS block): the player's hits land for less
      if (F.mut && num(F.mut.dmgOut, 1) !== 1 && isPlayer(F, src) && !isPlayer(F, tgt) && amt > 0) amt = Math.max(1, Math.round(amt * num(F.mut.dmgOut, 1)));
      if (F.leg) amt = legDmgOut(F, src, tgt, amt);   // The Crowd's Hype, the Giant Slayer (LEG block)
      amt = stoAbsorb(F, tgt, amt);   // the Plushie Queen's plushies soak the hit (STORY block)
    }
    let blocked = 0;
    if (!opts.pierce) { blocked = Math.min(tgt.block, amt); tgt.block -= blocked; }
    const loss = Math.min(tgt.hp, amt - blocked);
    tgt.hp -= loss;
    F.stats.blocked += isPlayer(F, tgt) ? blocked : 0;
    const ev = { t: 'dmg', who: whoOf(F, tgt), idx: idxOf(F, tgt), amt: loss, blocked };
    // Loot bookkeeping for the payout screen: the player's biggest hit and
    // the overkill of a killing blow (damage past the last hit point).
    if (isPlayer(F, src) && !isPlayer(F, tgt)) {
      const raw = amt - blocked;
      F.stats.bigHit = Math.max(F.stats.bigHit || 0, raw);
      if (raw > loss && tgt.hp <= 0) F.stats.overkill = Math.max(F.stats.overkill || 0, raw - loss);
    }
    if (!opts.fixed && st(tgt, 'vuln') > 0 && amt >= 12) ev.crit = true;
    emit(F, ev);
    // Thorns bite back at a unit that attacked (block still soaks thorns).
    const th = st(tgt, 'thorns');
    if (attack && th > 0 && !opts.noThorns && (isPlayer(F, src) || src.alive)) {
      api.damage(F, tgt, src, th, { fixed: true, noThorns: true });
    }
    // Vampiric affix: the attacker drinks half of what got through.
    if (loss > 0 && attack && src && !isPlayer(F, src) && isPlayer(F, tgt) && src.alive && hasAffix(src, 'vampiric')) {
      if (api.heal(F, src, Math.ceil(loss / 2)) > 0) text(F, src, 'SLURP');
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
    const cap = id === 'luck' ? LUCK.max : (id === 'armor' && !isPlayer(F, u)) ? Math.max(ARMOR_MAX, before) : MAX_STACK;
    const now = clamp(before + v, 0, cap);
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
    // Everything it swallowed bursts out and rains back into the bin.
    if (e.belly && e.belly.length) spit(F, e, e.belly.length, 'burst');
    bestDeath(F, e);   // a Mole's buried items pop back up (BESTIARY block)
    famDeath(F, e);   // the band loses the beat, the choir gets angry, the Change Machine pays out (FAMILY block)
    stoDeath(F, e);   // the Arctic Arcade's ice block melts open, the King's belt stops (STORY block)
    depDeath(F, e);   // a crab lets go, the lure, the live water and the tide end with their owner (DEP block)
    // Explosive affix: a parting blast (it never finishes the player off).
    if (hasAffix(e, 'explosive') && F.player.hp > 1) {
      const v = Math.min(F.player.hp - 1, Math.round((4 + 4 * F.act) * num(e.dmgMul, 1)));
      text(F, e, 'KABOOM');
      if (v > 0) api.damage(F, null, F.player, v);
    }
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
    const v = m.charged ? e.charged : F ? famHitV(F, e, m) : num(m.v, 0);   // (FAMILY: harmony)
    const vuln = F && F.player ? st(F.player, 'vuln') > 0 : false;
    const armor = F && F.player ? st(F.player, 'armor') : 0;
    return { v: calcHit(v, st(e, 'str'), st(e, 'weak') > 0, vuln, armor), n: Math.max(1, num(m.n, 1) | 0) };
  };

  function sName(s) { const d = statusDef(s); return (d && d.name) || s; }
  // The telegraph, plus what the affixes add to this next action.
  api.intentText = function (e) {
    const s = baseIntent(e);
    if (!s || !e) return s;
    const extra = [];
    if (api.hasteNext(e)) extra.push('twice (Hasty)');
    if (api.greedNext(e)) extra.push('and gulps an item (Greedy)');
    if (bestRide(e)) extra.push(bestRide(e));   // the rival claw (BESTIARY block)
    // A boss signature rides on the next action too (see bossSig).
    if (api.sigNext && api.sigNext(e)) { const si = api.sigInfo(e); if (si && si.text) extra.push('then ' + si.text); }
    return extra.length ? s + ', ' + extra.join(', ') : s;
  };
  function baseIntent(e) {
    const m = e && e.intent;
    if (!m) return '';
    const n = Math.max(1, num(m.n, 1) | 0);
    switch (m.k) {
      case 'attack': {
        const v = calcHit(m.charged ? e.charged : num(m.v, 0), st(e, 'str'), st(e, 'weak') > 0, false, 0);
        if (m.charged) return `Unleashes ${v}`;
        if (m.fam) return famText(e, m, v);   // a SOLO, a hum (FAMILY block)
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
      case 'gulp': { const k = Math.max(1, num(m.n, 1) | 0); return k > 1 ? `Swallows ${k} of your items` : 'Swallows one of your items'; }
      case 'bomb': return `Drops a lit bomb (${Math.round(num(m.v, 0) * num(e.dmgMul, 1))}) in your bin`;
      case 'corrode': return `Rusts ${Math.max(1, num(m.n, 1) | 0)} metal items`;
      case 'jam': return 'Jams your claw rail';
      case 'eggs': return `Lays ${Math.max(1, num(m.n, 1) | 0)} eggs in your bin`;
      case 'none': return 'Waits';
      default: return famText(e, m) || depIntent(e, m) || bestIntent(e, m) || m.txt || m.name || '???';   // (FAMILY: restock, cans, change, lost the beat)
    }
  }

  // A summon move's `id` doubles as the move id in the schema, so accept an
  // explicit summon/enemy/item field first, then `id` if it names an enemy.
  function summonId(m) {
    const E = tbl('ENEMIES');
    for (const k of ['summon', 'enemy', 'item', 'id']) if (m[k] && E[m[k]]) return m[k];
    return m.summon || m.enemy || null;
  }

  // ---------- the monsters pass: bellies, bin tricks, affixes, phase two ----------
  // (DESIGN.md "Enemies".) A gulp moves bin items into e.belly; they come
  // back when the enemy dies (all of them), when the player deals it
  // hiccupAt(e) damage in one turn (one per threshold), and are digested
  // (gone for this fight only) after DIGEST of its turns. What it ate
  // matters: a bomb goes off inside it, potions and food are drunk / eaten on
  // the spot (healing it or giving it the potion's debuffs), a weapon lends
  // it Strength and plate lends it Armor while held, glass cuts it every turn.
  const BELLY_MAX = 4;       // items one enemy holds at once
  const DIGEST = 3;          // its turns before a swallowed item is digested
  const DIGEST_FLOOR = 4;    // digestion never takes the player below this many real (non-junk) items
  // The real items the player still has this fight (bin + used pile, junk aside).
  function playable(F) {
    let n = 0;
    for (const i of F.bin) if (!isJunk(i)) n++;
    for (const i of F.used) if (!isJunk(i)) n++;
    return n;
  }
  const GLASS_CUT = 4;       // hp per act a swallowed glass item costs its eater each turn
  const RAR = { junk: 0, c: 1, u: 2, r: 3, l: 4 };
  const MEAL_DEBUFFS = ['poison', 'burn', 'chill', 'weak', 'vuln', 'bleed', 'stun'];
  const TAUNTS = ['NOM', 'GULP', 'MINE!', 'CHOMP'];

  const hasAffix = (e, id) => !!(e && Array.isArray(e.affix) && e.affix.indexOf(id) >= 0);
  function affixProc(F, e, id, str) {
    const A = (D().AFFIXES || {})[id] || {};
    return emit(F, procEv('affix', id, A.name || id, A.icon || '!', A.color || '#ff5a4a', str, e, F));
  }
  // Put an affix on an enemy: +5% max hp each (AFFIXES[id].hp), Armored / Spiky start stacks.
  function giveAffix(F, e, id) {
    if (!e || !id || hasAffix(e, id)) return false;
    if (!Array.isArray(e.affix)) e.affix = [];
    const A = (D().AFFIXES || {})[id];
    e.affix.push(id);
    const add = Math.round(e.maxHp * num(A && A.hp, 0.1));
    if (add > 0) { e.maxHp += add; e.hp += add; }
    if (id === 'armored') e.status.armor = clamp(st(e, 'armor') + 1, 0, ARMOR_MAX);
    if (id === 'spiky') e.status.thorns = clamp(st(e, 'thorns') + (F.act >= 3 ? 2 : 1), 0, MAX_STACK);
    return true;
  }
  function rollAffixes(F, e, rng) {
    const roll = D().affixRoll;
    if (typeof roll !== 'function') return;
    let ids = [];
    try { ids = roll(rng, e.def, F.act, F.fights) || []; } catch (err) { ids = []; }
    for (const id of ids) giveAffix(F, e, id);
  }
  // Hasty acts twice on every third action; Greedy gulps on its first and
  // every third after (the telegraph shows both ahead of time).
  api.hasteNext = (e) => hasAffix(e, 'hasty') && num(e.acts, 0) % 3 === 2 &&
    !(e.intent && (e.intent.charged || e.intent.k === 'charge' || e.intent.k === 'escape'));
  api.greedNext = (e) => hasAffix(e, 'greedy') && num(e.acts, 0) % 3 === 0;
  // Damage in one player turn that makes an enemy hiccup one item back up.
  api.hiccupAt = (e) => Math.max(6, Math.ceil(num(e && e.maxHp, 20) * 0.15));

  // The telegraphed move, with Greedy and Hasty on top.
  function actMove(F, e) {
    const m = e.intent;
    const greedy = api.greedNext(e), twice = api.hasteNext(e), sig = api.sigNext(e);
    e.acts = num(e.acts, 0) + 1;
    if (greedy && (!m || m.k !== 'gulp')) { affixProc(F, e, 'greedy', 'GREEDY'); gulpItems(F, e, 1, 'shiny'); }
    if (!e.alive || F.phase === 'over') return;
    doMove(F, e, m);
    // The extra action: a quick jab at half value for an attack (never after
    // an unleash), the whole move again for anything else.
    if (twice && m && !m.charged && m.k !== 'charge' && m.k !== 'escape' && e.alive && F.phase !== 'over' && F.player.hp > 0) {
      affixProc(F, e, 'hasty', 'AGAIN!');
      doMove(F, e, m.k === 'attack' ? { id: 'haste', k: 'attack', v: Math.max(1, Math.round(num(m.v, 0) / 2)), n: m.n } : m);
    }
    // A boss's signature trick, telegraphed a turn ahead (DESIGN.md "Bosses").
    if (sig && e.alive && F.phase !== 'over' && F.player.hp > 0) bossSig(F, e);
  }

  // What a swallowed item does to its eater.
  function mealKind(def) {
    if (def.art === 'bomb') return 'boom';
    if (tagHas(def, 'potion')) return 'drink';
    if (tagHas(def, 'food')) return 'snack';
    if (tagHas(def, 'weapon')) return 'armed';
    if (tagHas(def, 'glass')) return 'crunch';
    if (tagHas(def, 'metal')) return 'plated';
    return 'held';
  }
  function fxSum(def, plus, k) {
    let s = 0;
    for (const f of fxOf(def, plus)) {
      if (!f || f.k !== k) continue;
      s += Math.max(0, num(f.v, 0)) * Math.max(1, num(f.n, 1) | 0);
    }
    return s;
  }
  // The potion's (or bomb's) debuffs land on the eater. Returns how many.
  function mealDebuffs(F, e, def, plus) {
    let n = 0;
    for (const f of fxOf(def, plus)) {
      if (!f || !e.alive) continue;
      if (f.k === 'status' && MEAL_DEBUFFS.indexOf(f.s) >= 0 && f.to !== 'self' && num(f.v, 1) > 0) { api.status(F, e, f.s, num(f.v, 1)); n++; }
      if (f.k === 'poisonAll' && num(f.v, 0) > 0) { api.status(F, e, 'poison', num(f.v, 0)); n++; }
    }
    return n;
  }
  function selfStr(def, plus) {
    let s = 0;
    for (const f of fxOf(def, plus)) if (f && f.k === 'status' && f.s === 'str' && f.to === 'self') s += Math.max(0, num(f.v, 0));
    return s;
  }
  // The item a gulp goes for: its favourite tag first, else the rarest
  // (shiny also loves metal); never junk or an iced item.
  function pickMeal(F, like) {
    let best = null, bs = -1;
    for (const i of F.bin) {
      if (isJunk(i) || i.frozen) continue;
      const d = itemDef(i.id);
      const rank = num(RAR[d.rarity], 1);
      let s = rank * 10 + (i.plus ? 5 : 0) + F.rng() * 8;
      if (like === 'shiny') s += rank * 10 + (tagHas(d, 'metal') ? 6 : 0);
      else if (like && tagHas(d, like)) s += 100;
      s += Math.max(0, num(d.lure, 0));   // bait (round 3): monsters go for it
      if (s > bs) { bs = s; best = i; }
    }
    return best;
  }
  function eat(F, e, inst) {
    const at = F.bin.indexOf(inst);
    if (at < 0) return;
    F.bin.splice(at, 1);
    const def = itemDef(inst.id), plus = cmp2Plus(inst);
    const kind = mealKind(def), idx = F.enemies.indexOf(e);
    emit(F, { t: 'binEat', inst, idx, kind });
    text(F, e, TAUNTS[Math.floor(F.rng() * TAUNTS.length)]);
    log(F, `${e.def.name || e.id} swallows ${def.name || def.id}.`);
    if (kind === 'boom') {
      // It swallowed a bomb. It went off.
      F.used.push(inst);
      emit(F, { t: 'binDigest', inst, idx, k: 'boom' });
      text(F, e, 'KABOOM');
      mealDebuffs(F, e, def, plus);
      loseHp(F, e, Math.max(8, 2 * (fxSum(def, plus, 'dmg') + fxSum(def, plus, 'random'))));
      hook(F, 'onEat', e, inst, def);
      return;
    }
    const bait = eatenOf(def, plus);
    if (bait && (kind === 'drink' || kind === 'snack')) {
      // Bait (a Poison Pill, a Hot Potato): it hurts whoever swallowed it.
      F.used.push(inst);
      emit(F, { t: 'binDigest', inst, idx, k: kind });
      const ss = bait.status && typeof bait.status === 'object' ? bait.status : {};
      for (const s in ss) if (e.alive) api.status(F, e, s, Math.max(0, num(ss[s], 0)));
      if (num(bait.dmg, 0) > 0 && e.alive) loseHp(F, e, bait.dmg);
      if (e.alive) text(F, e, 'BLEGH');
      hook(F, 'onEat', e, inst, def);
      return;
    }
    if (kind === 'drink' || kind === 'snack') {
      // Drunk or eaten on the spot; the item goes to the used pile as if played.
      F.used.push(inst);
      emit(F, { t: 'binDigest', inst, idx, k: kind });
      hook(F, 'onEat', e, inst, def);
      const bad = mealDebuffs(F, e, def, plus);
      const s = selfStr(def, plus);
      if (s > 0) api.status(F, e, 'str', s);
      let h = fxSum(def, plus, 'heal') * 2 + (kind === 'snack' ? 4 : 0);
      if (!bad && !s && !h) h = 5;
      if (h > 0) api.heal(F, e, h);
      text(F, e, bad ? 'BLEGH' : kind === 'drink' ? 'GLUG' : 'YUM');
      return;
    }
    const b = { inst, turns: Math.max(1, num(e.def.digest, DIGEST) | 0), kind, str: 0, armor: 0 };
    e.belly.push(b);
    if (kind === 'armed') { b.str = 2; api.status(F, e, 'str', 2); }
    if (kind === 'plated') b.armor = Math.max(0, api.status(F, e, 'armor', 1));   // at the Armor cap it lends none (and takes none back)
    hook(F, 'onEat', e, inst, def);
  }
  // Swallow up to n bin items. Returns how many went down.
  function gulpItems(F, e, n, like) {
    let got = 0;
    for (let i = 0; i < n; i++) {
      if (!e.alive || F.phase === 'over' || e.belly.length >= BELLY_MAX) break;
      const inst = pickMeal(F, like);
      if (!inst) break;
      eat(F, e, inst);
      got++;
    }
    return got;
  }
  // A held item stops lending its Strength / Armor.
  function unhold(F, e, b) {
    if (!e.alive) return;
    if (b.str) api.status(F, e, 'str', -Math.min(b.str, st(e, 'str')));
    if (b.armor) api.status(F, e, 'armor', -Math.min(b.armor, st(e, 'armor')));
  }
  // Items come back out (the newest first) and land in the bin, or in the
  // used pile when the cabinet is full. why: 'hiccup' | 'burst'.
  function spit(F, e, n, why) {
    const out = [];
    for (let i = 0; i < n && e.belly.length; i++) {
      const b = e.belly.pop();
      unhold(F, e, b);
      out.push(b.inst);
      if (F.bin.length < MAX_CABINET) F.bin.push(b.inst); else F.used.push(b.inst);
    }
    if (!out.length) return out;
    emit(F, { t: 'binReturn', insts: out, idx: F.enemies.indexOf(e), why });
    text(F, e, why === 'hiccup' ? 'HIC!' : 'BLORP');
    return out;
  }
  // Start of its action: glass cuts, digestion counts down.
  function bellyTick(F, e) {
    if (!e.belly || !e.belly.length) return;
    const idx = F.enemies.indexOf(e);
    for (const b of e.belly.slice()) {
      if (!e.alive || F.phase === 'over') return;
      if (b.kind === 'crunch') {
        text(F, e, 'CRUNCH');
        loseHp(F, e, GLASS_CUT * F.act);
        if (!e.alive || F.phase === 'over') return;
      }
      b.turns--;
      if (b.turns > 0) continue;
      // never the player's last few items: a gulper that ate the bin down to
      // one or two things made a fight nobody could win (the QA bot's
      // Ironjaw, 17 of 19 digested), so it coughs this one back up instead
      if (playable(F) < DIGEST_FLOOR) {
        e.belly.splice(e.belly.indexOf(b), 1); e.belly.push(b);
        spit(F, e, 1, 'burst');
        continue;
      }
      e.belly.splice(e.belly.indexOf(b), 1);
      unhold(F, e, b);
      F.digested.push(b.inst);
      emit(F, { t: 'binDigest', inst: b.inst, idx, k: 'digest' });
      text(F, e, 'BURP');
    }
  }
  // Every hit on an enemy: hiccups (the player's turn only), then phase two.
  function monsterHurt(F, e, amt) {
    if (F.phase === 'player' && e.belly && e.belly.length) {
      e.gut = num(e.gut, 0) + amt;
      const need = api.hiccupAt(e);
      while (e.alive && e.belly.length && e.gut >= need) { e.gut -= need; spit(F, e, 1, 'hiccup'); }
    }
    phaseTwo(F, e);
    bossFinal(F, e);
  }
  // Elites and bosses transform once at half hp: a roar, Strength and
  // sometimes a new pattern (def.enrage {name, text, str, pattern}; false: never).
  function phaseTwo(F, e) {
    if (e.enraged || !e.alive || e.hp * 2 > e.maxHp) return;
    const tier = e.def.tier;
    if ((tier !== 'elite' && tier !== 'boss') || e.def.enrage === false) return;
    e.enraged = true;
    const R = (e.def.enrage && typeof e.def.enrage === 'object') ? e.def.enrage : {};
    const moves = e.def.moves || [];
    emit(F, { t: 'enrage', idx: F.enemies.indexOf(e), name: R.name || 'ENRAGED', text: R.text || `${e.def.name || e.id} is furious` });
    log(F, `${e.def.name || e.id} enters phase two.`);
    const s = R.str != null ? num(R.str, 0) : (F.act >= 2 ? 2 : 1);
    if (s > 0) api.status(F, e, 'str', s);
    const pat = Array.isArray(R.pattern) ? R.pattern.filter(i => i >= 0 && i < moves.length) : [];
    if (pat.length && (e.def.ai || 'cycle') === 'cycle') { e.def = Object.assign({}, e.def, { pattern: pat }); e.cyc = 0; }
    bossPhase(F, e);
  }

  // ---- bin tricks: lit bombs, rust, eggs
  const roomFor = (F) => F.bin.length < MAX_CABINET && F.bin.length + F.used.length < MAX_ITEMS;
  function dropBomb(F, e, m) {
    if (!roomFor(F)) { text(F, e, 'NO ROOM'); return null; }
    const inst = { uid: newUid(), id: m.item || 'fusebomb', plus: false, frozen: false, junk: true, temp: true,
      fuse: Math.max(1, num(m.fuse, 2) | 0), boom: Math.max(1, Math.round(num(m.v, 8) * num(e.dmgMul, 1))), by: e.uid, lit: F.turn };
    F.bin.push(inst);
    emit(F, { t: 'binBomb', inst, idx: F.enemies.indexOf(e) });
    hook(F, 'onJunk', 1, [inst]);
    return inst;
  }
  function layEggs(F, e, m) {
    const items = [];
    const n = clamp(num(m.n, 1) | 0, 1, 6);
    for (let i = 0; i < n && roomFor(F); i++) {
      const inst = { uid: newUid(), id: m.item || 'broodegg', plus: false, frozen: false, junk: true, temp: true,
        hatch: Math.max(1, num(m.turns, 2) | 0), spawn: m.hatch || 'spiderling', by: e.uid, lit: F.turn };
      F.bin.push(inst);
      items.push(inst);
    }
    if (!items.length) { text(F, e, 'NO ROOM'); return items; }
    emit(F, { t: 'binEggs', items, idx: F.enemies.indexOf(e) });
    hook(F, 'onJunk', items.length, items);
    return items;
  }
  function corrode(F, e, n) {
    const pool = F.bin.filter(i => !i.rust && !isJunk(i) && tagHas(itemDef(i.id), 'metal'));
    let k = 0;
    while (k < n && pool.length) {
      const inst = pool.splice(Math.floor(F.rng() * pool.length), 1)[0];
      inst.rust = true;
      k++;
      emit(F, { t: 'binRust', inst, idx: F.enemies.indexOf(e) });
    }
    return k;
  }
  // A rusted item's numbers are halved (rounded up) for this fight.
  function rusty(inst, f) {
    if (!inst || !inst.rust || !f) return f;
    const half = (v) => (num(v, 0) > 0 ? Math.ceil(num(v, 0) / 2) : v);
    switch (f.k) {
      case 'dmg': case 'block': case 'heal': case 'lifesteal': case 'dmgPer': case 'blockPer':
        return num(f.v, 0) > 0 ? Object.assign({}, f, { v: half(f.v) }) : f;
      case 'random': return Object.assign({}, f, { v: half(f.v), min: half(f.min), max: half(f.max) });
      default: return f;
    }
  }
  // End of the enemy phase: a bomb not lit this round burns down (at 0 it
  // blows up in the cabinet, hitting the player through Block), an egg
  // counts down and hatches into its minion when there is room.
  function binTimers(F) {
    for (const inst of F.bin.slice()) {
      if (F.phase === 'over') return;
      if (inst.lit === F.turn) continue;
      if (inst.fuse != null) {
        inst.fuse--;
        if (inst.fuse > 0) continue;
        F.bin.splice(F.bin.indexOf(inst), 1);
        F.purged.push(inst);
        emit(F, { t: 'binBoom', inst });
        text(F, F.player, 'BOOM');
        api.damage(F, null, F.player, num(inst.boom, 8));
      } else if (inst.hatch != null) {
        inst.hatch--;
        if (inst.hatch > 0) continue;
        if (alive(F).length >= MAX_ALIVE) { inst.hatch = 1; continue; }
        F.bin.splice(F.bin.indexOf(inst), 1);
        F.purged.push(inst);
        emit(F, { t: 'binHatch', inst });
        summon(F, null, inst.spawn);
      }
    }
  }
  // A lit bomb the player grabbed out: back at the thrower (or the target).
  function throwBack(F, inst) {
    const tgt = F.enemies.find(x => x.uid === inst.by && x.alive) || aimOf(F, { idx: F.target });
    if (!tgt) return;
    text(F, F.player, 'RETURN TO SENDER');
    api.damage(F, F.player, tgt, Math.round(num(inst.boom, 8) * 1.5));
  }
  api.giveAffix = (F, e, id) => giveAffix(F, unit(F, e), id);
  api.gulp = (F, e, n, like) => { const c = begin(F); const u = unit(F, e); if (u && u.alive) gulpItems(F, u, Math.max(1, num(n, 1) | 0), like); return end(F, c); };
  api.hasAffix = hasAffix;
  api.BELLY_MAX = BELLY_MAX;
  api.DIGEST = DIGEST;
  api.ARMOR_MAX = ARMOR_MAX;
  api.DIGEST_FLOOR = DIGEST_FLOOR;

  // ---------- boss signatures (DESIGN.md "Bosses") ----------
  /* Each boss has one signature trick that rides on top of its move, like
     Greedy: def.sig {id, name, sign, shout, text, first, every, ...}. It is
     due on the action numbered `first` (0-based, counted by e.acts) and every
     `every` actions after (0: never again on its own); e.sigForce makes the
     next action carry it whatever the count (the Prize Master rigs the
     machine again at each new phase). sigNext is the telegraph (the intent
     text, the bubble's chip, the game's cabinet sign). The state a signature
     leaves (F.heat + inst.hot, F.ice, F.rigged) lasts for the player's next
     turn and clears as that turn ends; F.lean (the Hoard's phase two) and
     F.final (the Prize Master's last quarter) stay for the fight. */
  const HOT_DMG = 2;     // a red hot metal item delivered burns the hand (Block soaks it)
  const ICE_HP = 2;      // prizes it takes to crack the iced chute lip open (a heavy one: 1)
  const sigOf = (e) => (e && e.def && e.def.sig && typeof e.def.sig === 'object') ? e.def.sig : null;
  api.sigNext = function (e) {
    const s = sigOf(e);
    if (!s || !e.alive) return false;
    if (e.sigForce) return true;
    const a = num(e.acts, 0), first = Math.max(0, num(s.first, 1) | 0), every = Math.max(0, num(s.every, 3) | 0);
    if (a < first) return false;
    return a === first || (every > 0 && (a - first) % every === 0);
  };
  // The next signature, for the telegraph: Glacius alternates its parts.
  api.sigInfo = function (e) {
    const s = sigOf(e);
    if (!s) return null;
    if (s.id === 'machine') return secInfo(e, s);   // The Machine: a cabinet event per phase (SECRET block)
    const parts = Array.isArray(s.parts) && s.parts.length ? s.parts : null;
    const part = parts ? parts[num(e.sigN, 0) % parts.length] : null;
    const text = (part && s.texts && s.texts[part]) || s.text || '';
    return { id: s.id, name: s.name || s.id, sign: s.sign || s.name || s.id, shout: s.shout || s.sign || s.name || s.id, text, part };
  };
  function bossJunk(F, id, n) {
    const out = [];
    for (let i = 0; i < n && roomFor(F); i++) {
      const inst = { uid: newUid(), id, plus: false, frozen: false, junk: true, temp: true };
      F.bin.push(inst);
      out.push(inst);
    }
    if (out.length) hook(F, 'onJunk', out.length, out);
    return out;
  }
  function bossSig(F, e) {
    const s = sigOf(e), info = api.sigInfo(e);
    if (!s || !info) return;
    e.sigN = num(e.sigN, 0) + 1;
    e.sigForce = false;
    const idx = F.enemies.indexOf(e);
    text(F, e, String(info.shout).toUpperCase());
    switch (s.id) {
      // The Hoard: a coin avalanche (junk that pays a little gold when grabbed out).
      case 'spill': {
        const items = bossJunk(F, s.item || 'hoardcoin', clamp(Math.round(num(s.n, 4)) + (e.enraged ? 2 : 0), 1, 10));
        emit(F, { t: 'boss', k: 'spill', idx, items, name: info.name });
        if (!items.length) text(F, e, 'NO ROOM');
        break;
      }
      // The Smelter: metal in the bin turns red hot, a lump of slag drips in.
      case 'heat': {
        F.heat = 1;
        F.heatBurn = Math.max(1, Math.round(num(s.burn, HOT_DMG)));
        const pool = F.bin.filter(i => !i.hot && !isJunk(i) && tagHas(itemDef(i.id), 'metal'));
        const insts = [];
        const n = clamp(Math.round(num(s.n, 4)), 1, 12);
        while (insts.length < n && pool.length) {
          const inst = pool.splice(Math.floor(F.rng() * pool.length), 1)[0];
          inst.hot = true;
          insts.push(inst);
        }
        const items = bossJunk(F, 'slag', clamp(Math.round(num(s.drip, 1)), 0, 3));
        emit(F, { t: 'boss', k: 'heat', idx, insts, items, name: info.name });
        break;
      }
      // Glacius: the chute lip or the claw rail ices over for a turn.
      case 'ice': {
        F.ice = { part: info.part || 'lid', hp: ICE_HP, by: e.uid };
        emit(F, { t: 'boss', k: 'ice', idx, part: F.ice.part, name: info.name });
        break;
      }
      // The Prize Master: the machine is rigged (a drop it steers, a shuffle).
      case 'rig': {
        F.rigged = { drops: 1, stage: e.final ? 3 : e.enraged ? 2 : 1, by: e.uid };
        emit(F, { t: 'boss', k: 'rig', idx, stage: F.rigged.stage, name: info.name });
        break;
      }
      case 'machine': secSig(F, e, s, info, idx); break;   // The Machine's cabinet events (SECRET block)
      case 'plush': case 'belt': case 'glacier': stoSig(F, e, s, info, idx); break;   // the alternate bosses (STORY block)
      case 'tide': depSig(F, e, s, info, idx); break;   // The Drowned Jukebox's High Tide (DEP block)
      default: break;
    }
    log(F, `${e.def.name || e.id}: ${info.name}.`);
  }
  // Phase two on a boss: the Hoard's pile leans its way for good; the Prize
  // Master rigs the machine again on its next action.
  function bossPhase(F, e) {
    const s = sigOf(e);
    if (!s) return;
    if (s.lean) { F.lean = -1; emit(F, { t: 'boss', k: 'lean', idx: F.enemies.indexOf(e), dir: -1 }); }
    if (s.rephase) e.sigForce = true;
  }
  // The final phase (sig.final, a quarter hp, after phase two): +1 Strength,
  // one more rigged drop and the cabinet lights go red.
  function bossFinal(F, e) {
    const s = sigOf(e);
    if (!s || !s.final || e.final || !e.enraged || !e.alive || e.hp * 4 > e.maxHp) return;
    e.final = true;
    F.final = true;
    if (s.rephase) e.sigForce = true;
    emit(F, { t: 'boss', k: 'final', idx: F.enemies.indexOf(e), name: s.finalName || 'FINAL PHASE', text: s.finalText || '' });
    api.status(F, e, 'str', 1);
    log(F, `${e.def.name || e.id} enters its final phase.`);
  }
  // A red hot item delivered burns the hand that grabbed it (through Block).
  function burnHot(F, inst) {
    delete inst.hot;
    if (F.phase !== 'player' || F.player.hp <= 0) return;
    const v = Math.max(1, Math.round(num(F.heatBurn, HOT_DMG)));
    emit(F, { t: 'boss', k: 'sear', idx: -1, inst, v });
    text(F, F.player, 'RED HOT!');
    api.damage(F, null, F.player, v);
  }
  // The player's turn is over: hot metal cools, ice thaws, the rigging comes off.
  function bossTurnEnd(F) {
    let cooled = false;
    for (const list of [F.bin, F.used]) for (const i of list) if (i && i.hot) { delete i.hot; cooled = true; }
    if (F.heat || cooled) { F.heat = 0; emit(F, { t: 'boss', k: 'cool', idx: -1 }); }
    if (F.ice) { F.ice = null; emit(F, { t: 'boss', k: 'thaw', idx: -1 }); }
    F.rigged = null;
    secTurnEnd(F);   // The Machine: zero g, the live rail, the shutter (SECRET block)
    stoTurnEnd(F);   // the Conveyor King's belt stops (STORY block)
    depTurnEnd(F);   // the lure, the live water and the tide go (DEP block)
  }
  // Game hooks: a prize lands on the iced chute lip (a heavy one smashes it),
  // the ice is shattered outright, a rigged drop is spent. Return the new state.
  api.crackIce = function (F, heavy) {
    if (!F || !F.ice) return null;
    F.ice.hp = heavy ? 0 : F.ice.hp - 1;
    if (F.ice.hp <= 0) F.ice = null;
    return F.ice;
  };
  api.breakIce = function (F) { if (!F || !F.ice) return false; F.ice = null; return true; };
  api.unrig = function (F) {
    if (!F || !F.rigged) return false;
    F.rigged.drops--;
    if (F.rigged.drops <= 0) F.rigged = null;
    return true;
  };
  api.HOT_DMG = HOT_DMG;
  api.ICE_HP = ICE_HP;

  // ================= SECRET (round 6: The Machine, DESIGN.md "Secret act (round 6)") =================
  /* The Machine's signature (sig.id 'machine'): a cabinet event on every
     action, drawn from its phase's set (sig.phases[0] the opening, [1] once
     OVERCLOCKED at half hp, [2] in the MELTDOWN quarter), telegraphed a turn
     ahead like any signature (secInfo feeds sigInfo). What it leaves lasts
     the player's next turn and clears as that turn ends (secTurnEnd):
     tilt (F.tilt via binTilt: the game leans the whole cabinet), flood (junk
     poured in, it stays like any junk), claw (F.rigged: the Prize Master's
     hijack, two drops in the meltdown), grav (F.secGrav: zero g, the pile
     floats up under the lid, grabbable mid-air), rail (F.secZap: every drop
     shocks you through Block until a metal prize grounds the rail) and
     shutter (F.secShut: a steel shutter over the chute; only heavy prizes
     dent it, sig.shut dents knock it open). The Back Room's elites
     (run.sec.room) get the strongest affixes stacked on (secFight). */
  const secPhase = (e) => (e && e.final ? 2 : e && e.enraged ? 1 : 0);
  function secPart(e, s) {
    const ph = Array.isArray(s.phases) && s.phases.length ? s.phases : [['tilt']];
    const set = ph[Math.min(ph.length - 1, secPhase(e))] || ph[0];
    return (set && set.length ? set[num(e.sigN, 0) % set.length] : 'tilt') || 'tilt';
  }
  function secInfo(e, s) {
    const part = secPart(e, s);
    const pick = (o, d) => (o && o[part]) || d;
    return { id: s.id, name: s.name || s.id, sign: pick(s.signs, s.sign || 'CABINET EVENT'), shout: pick(s.shouts, s.shout || 'MALFUNCTION'), text: pick(s.texts, s.text || ''), part };
  }
  // The phase's number from a per-phase list (the flood, the shock, the float).
  const secN = (arr, e, d) => { const a = Array.isArray(arr) && arr.length ? arr : [d]; return num(a[Math.min(a.length - 1, secPhase(e))], d); };
  function secSig(F, e, s, info, idx) {
    const name = info.sign;
    switch (info.part) {
      case 'flood': {
        const ids = (Array.isArray(s.junk) && s.junk.length ? s.junk : ['rock']).filter(id => !!tbl('ITEMS')[id]);
        const n = clamp(Math.round(secN(s.flood, e, 5)), 1, 12);
        const items = [];
        for (let i = 0; i < n; i++) { const got = bossJunk(F, ids.length ? ids[i % ids.length] : 'rock', 1); if (!got.length) break; items.push(got[0]); }
        emit(F, { t: 'boss', k: 'mFlood', idx, items, name });
        if (!items.length) text(F, e, 'NO ROOM');
        break;
      }
      case 'claw': {
        F.rigged = { drops: e.final ? 2 : 1, stage: e.final ? 3 : e.enraged ? 2 : 1, by: e.uid, secret: true };
        emit(F, { t: 'boss', k: 'mClaw', idx, stage: F.rigged.stage, drops: F.rigged.drops, name });
        break;
      }
      case 'grav': {
        const src = F.bin.filter(i => i && !i.frozen), insts = [];
        const n = clamp(Math.round(secN(s.float, e, 8)), 1, 20);
        while (insts.length < n && src.length) insts.push(src.splice(Math.floor(F.rng() * src.length), 1)[0]);
        F.secGrav = 1;
        emit(F, { t: 'boss', k: 'mGrav', idx, insts, name });
        break;
      }
      case 'rail': {
        F.secZap = { v: Math.max(1, Math.round(secN(s.zap, e, 3))), by: e.uid };
        emit(F, { t: 'boss', k: 'mRail', idx, v: F.secZap.v, name });
        break;
      }
      case 'shutter': {
        const hp = Math.max(1, Math.round(num(s.shut, 2)));
        F.secShut = { hp, max: hp, by: e.uid };
        emit(F, { t: 'boss', k: 'mShutter', idx, hp, name });
        break;
      }
      default: {   // 'tilt': the whole cabinet heels over for the turn
        const dir = F.rng() < 0.5 ? -1 : 1;
        F.tilt = dir;
        emit(F, { t: 'binTilt', dir });
        emit(F, { t: 'boss', k: 'mTilt', idx, dir, name });
        break;
      }
    }
  }
  function secTurnEnd(F) {
    const had = !!(F.secGrav || F.secZap || F.secShut);
    F.secGrav = 0; F.secZap = null; F.secShut = null;
    if (had) emit(F, { t: 'boss', k: 'mEnd', idx: -1 });
  }
  // A drop on the live rail: the shock goes through Block. Returns the events.
  api.secDrop = function (F) {
    const c = begin(F);
    if (F && F.secZap && F.phase === 'player' && F.player.hp > 0) {
      const v = Math.max(1, Math.round(num(F.secZap.v, 3)));
      emit(F, { t: 'boss', k: 'mZap', idx: -1, v });
      api.damage(F, null, F.player, v);
      checkOver(F);
    }
    return end(F, c);
  };
  // A metal prize delivered grounds the rail for the rest of the turn.
  api.secGround = function (F) { if (!F || !F.secZap) return false; F.secZap = null; return true; };
  // A prize lands on the shutter: only a heavy one dents it; the last dent knocks it open. Returns what is left (null: open).
  api.secShutHit = function (F, heavy) {
    if (!F || !F.secShut) return null;
    if (heavy) F.secShut.hp--;
    if (F.secShut.hp <= 0) F.secShut = null;
    return F.secShut;
  };
  function secFight(F, run, rng) {
    const sc = run && run.sec;
    if (!sc || !sc.room) return;
    F.secRoom = true;
    const S0 = D().SECRET || {}, A = D().AFFIXES || {};
    const want = Math.max(0, num(S0.eliteAffix, 3));
    for (const e of F.enemies) {
      if (!e.def || e.def.tier !== 'elite') continue;
      const ids = (Array.isArray(S0.affixPool) ? S0.affixPool : []).filter(id => !!A[id] && !hasAffix(e, id));
      while ((e.affix || []).length < want && ids.length) giveAffix(F, e, ids.splice(Math.floor(rng() * ids.length), 1)[0]);
    }
  }
  api.secInfo = (e) => { const s = sigOf(e); return s && s.id === 'machine' ? secInfo(e, s) : null; };
  api.secPhase = secPhase;
  // ================= /SECRET =================

  // ---------- enemy moves ----------
  function doMove(F, e, m) {
    if (!m) return;
    const p = F.player;
    const tgts = (m.to === 'all') ? alive(F) : [e];
    switch (m.k) {
      case 'attack': {
        const n = Math.max(1, num(m.n, 1) | 0);
        const v = m.charged ? e.charged : famHitV(F, e, m);   // (FAMILY: a SOLO or a hum swells with harmony)
        if (m.charged) e.charged = 0;
        if (m.fam) famBefore(F, e, m);   // the SOLO's spotlight, the choir's shake (FAMILY block)
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
      // The monsters pass (see the monsters section below).
      case 'gulp': if (!gulpItems(F, e, Math.max(1, num(m.n, 1) | 0), m.like)) text(F, e, 'NOTHING'); break;
      case 'bomb': dropBomb(F, e, m); break;
      case 'corrode': if (!corrode(F, e, Math.max(1, num(m.n, 1) | 0))) text(F, e, 'NOTHING'); break;
      case 'jam': {
        api.status(F, p, 'jam', Math.max(1, num(m.v, 1)));
        emit(F, { t: 'binJam', idx: F.enemies.indexOf(e) });
        break;
      }
      case 'eggs': layEggs(F, e, m); break;
      case 'escape': {
        e.alive = false;
        e.escaped = true;
        e.block = 0;
        F.escaped.push(e.id);
        // Whatever it swallowed leaves with it (gone for this fight).
        for (const b of (e.belly || []).splice(0)) {
          F.stolen.push(b.inst);
          emit(F, { t: 'binDigest', inst: b.inst, idx: F.enemies.indexOf(e), k: 'escape' });
        }
        // The die event carries escaped:true; the game shows ESCAPED from it.
        emit(F, { t: 'die', idx: F.enemies.indexOf(e), escaped: true });
        retarget(F);
        checkOver(F);
        break;
      }
      default: if (!famMove(F, e, m) && !depMove(F, e, m)) bestMove(F, e, m); break;   // (DEP round 15: the Neon Depths' water tricks)   // the families' moves (FAMILY block), the bestiary's machine tricks (BESTIARY block)   // the bestiary's machine tricks (BESTIARY block)
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
    // The monsters pass: Regenerating heals, the belly digests (glass cuts).
    if (hasAffix(e, 'regen')) api.heal(F, e, Math.max(2, Math.ceil(e.maxHp * 0.02)));
    bellyTick(F, e);
    if (!e.alive || F.phase === 'over') return;
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
    actMove(F, e);
    famActed(F, e);   // the band's Crescendo builds (FAMILY block)
    bestAfterAct(F, e);   // the Claw Collector's rival claw (BESTIARY block)
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
    // A wrench in the rail (jam) costs a grab while it lasts (never the last
    // one); a fresh turn empties every belly's hiccup meter.
    if (st(p, 'jam') > 0 && p.grabs > 1) { p.grabs--; text(F, p, 'JAMMED'); }
    for (const e of F.enemies) e.gut = 0;
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
  /* ---- CR (round 21): combo relics (DESIGN.md "Combo relics and a gentler, clearer start (round 21)").
     A grab fires a named combo (and a Bubble Combo) only when a combo relic switches its family on: a relic's
     `combo` is a family ('steel', 'brew', ... the recipe's `cr`) or 'all'. A recipe without a family needs 'all'.
     F.cr = {all: relic id or null, fam: {family: relic id}}, read from F.relics at newFight. */
  function crFam(relics) {
    const on = { all: null, fam: {} };
    for (const id of relics || []) {
      const c = relicDef(id) && relicDef(id).combo;
      if (c === 'all') { if (!on.all) on.all = id; } else if (typeof c === 'string' && c && !on.fam[c]) on.fam[c] = id;
    }
    return on;
  }
  // The relic that switches this combo (a recipe or a family name) on, or null when it is off.
  function crSrc(F, c) {
    const on = F && (F.cr || (Array.isArray(F.relics) ? (F.cr = crFam(F.relics)) : null));
    if (!on) return null;
    const f = typeof c === 'string' ? c : c && c.cr;
    return (f && on.fam[f]) || on.all || null;
  }
  const crOn = (F, c) => !!crSrc(F, c);
  api.crOn = crOn;
  // The combo's relic flashes as the combo fires, so the player sees where the power comes from.
  function crProc(F, c) { const id = crSrc(F, c); if (id) emit(F, relicProc(F, id)); }

  function fireCombo(F, combo, defs) {
    if (!crOn(F, combo)) return false;   // (CR) no combo relic for its family: it never fires
    if (combo.once === 'turn') {
      if (F.comboTurn[combo.id] === F.turn) return false;
      F.comboTurn[combo.id] = F.turn;
    }
    emit(F, { t: 'combo', id: combo.id, name: combo.name, text: combo.text, color: combo.color || '#ffc94d',
      n: defs.length, tier: clamp(num(combo.tier, 1) | 0, 1, 3) });
    crProc(F, combo);
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
      // the grab's state for recipes that read it (Lucky Seven)
      // (CR round 21) on: the run's combo relics; a recipe that is off never takes a slot
      if (!F.cr) F.cr = crFam(F.relics);   // a fight from before round 21 (a co-op seat's, a test's)
      const on = (cb) => crOn(F, cb);
      const fire = D().combosFor && (F.cr.all || Object.keys(F.cr.fam).length) ?(D().combosFor(defs, { luck: st(F.player, 'luck'), streak: F.streak, pet: F.petId || null, perfect: F.tech ? F.tech.perf | 0 : 0, on }) || []).filter(on) : [];   // pet: the pet combos (EVOLVE); perfect: this grab's PERFECT streak (TECH)
      for (const combo of fire) { if (F.phase !== 'player') break; if (combo && combo.id) fireCombo(F, combo, defs); }
      const got = Math.max(n, defs.length);
      if (F.phase === 'player') luckAfterGrab(F, got);
      if (F.phase === 'player' && got >= 3) hook(F, 'onJackpot', got);
      if (F.phase === 'player') hook(F, 'onGrab', n);
      sanitize(F);
      checkOver(F);
    }
    F.grab = { insts: [], defs: [] };
    if (F.tech) F.tech.perf = 0;   // (TECH) the PERFECT was this grab's
    return end(F, c);
  };
  api.comboFx = function (F, combo) { const c = begin(F); if (F && combo && F.phase === 'player') runCombo(F, combo); return end(F, c); };

  // ---------- round 3: Luck, tickets, bait, materials ----------
  // Add Luck to the player (capped at LUCK.max by api.status). label floats
  // over the player. Returns the Luck actually gained.
  function addLuck(F, v, label) {
    const p = F.player;
    const g = Math.min(Math.round(num(v, 0)), LUCK.max - st(p, 'luck'));
    if (g <= 0) { if (v > 0) text(F, p, 'MAX LUCK'); return 0; }
    if (label) text(F, p, label);
    return api.status(F, p, 'luck', g);
  }
  // Spend every point of Luck: per damage each to ALL enemies (x jackpot
  // on 3+ items). Relic damage rules: no attacker, so no Strength or Thorns.
  function cashOut(F, got) {
    const p = F.player, L = st(p, 'luck');
    if (L <= 0 || F.phase !== 'player') return 0;
    const amp = Math.max(0, num(F.rules && F.rules.cashAmp, 0));
    const jack = got >= 3;
    const dmg = Math.round(L * (LUCK.per + amp) * (jack ? LUCK.jackpot : 1));
    delete p.status.luck;
    emit(F, { t: 'status', who: 'p', idx: -1, s: 'luck', v: -L });
    emit(F, { t: 'luck', k: 'cash', v: L, dmg, jackpot: jack });
    text(F, p, (jack ? 'JACKPOT PAYOUT ' : 'CASH OUT ') + dmg);
    if (amp > 0) ruleProc(F, 'cashAmp', 'HIGH ROLLER');
    F.stats.cash = Math.max(num(F.stats.cash, 0), L);
    log(F, `Cashed out ${L} Luck for ${dmg}.`);
    for (const e of alive(F)) { if (F.phase === 'over') break; api.damage(F, null, e, dmg); }
    if (F.phase !== 'over') hook(F, 'onCashOut', L, got);
    return dmg;
  }
  // After each grab: a whiff fills the meter (when it is on), a grab of 2+
  // items cashes it out.
  function luckAfterGrab(F, got) {
    if (got === 0 && F.luckK > 0) {
      if (num(F.rules.luck, 0) > 0) ruleProc(F, 'luck', 'LUCKY FOOT');
      addLuck(F, LUCK.miss * F.luckK, 'BAD BEAT');
    } else if (got >= 2 && st(F.player, 'luck') > 0 && !(F.leg && F.leg.noCash > 0)) cashOut(F, got);   // (LEG: the Fate Engine keeps it)
  }
  // The game calls this on a near miss (SO CLOSE): +1 Luck with the meter on.
  api.nearMiss = function (F) {
    const c = begin(F);
    if (F && F.phase === 'player' && num(F.luckK, 0) > 0) addLuck(F, LUCK.near * F.luckK, '+LUCK');
    return end(F, c);
  };
  api.addLuck = function (F, v, label) { const c = begin(F); if (F && F.player) addLuck(F, v, label); return end(F, c); };
  api.cashOut = function (F, got) { const c = begin(F); if (F && F.player) cashOut(F, got == null ? 2 : got); return end(F, c); };
  api.luckOf = (F) => (F && F.player ? st(F.player, 'luck') : 0);
  api.LUCK = LUCK;
  // Arcade tickets a relic prints in the fight: banked on F.stats.tix, the
  // game adds them to the payout (a 'Ticket relics' line).
  api.tickets = function (F, v) {
    v = Math.round(num(v, 0));
    if (!F || v <= 0) return 0;
    F.stats.tix = num(F.stats.tix, 0) + v;
    text(F, F.player, `+${v} tickets`);
    return v;
  };
  // A cabinet material reacted in the game (crack, shatter in the bin, a
  // fuse lit, a bomb going off): relics hear it on onMaterial, and a glass
  // item shattering in the bin counts as a shatter (onShatter) too.
  api.material = function (F, kind, inst) {
    const c = begin(F);
    if (!F || F.phase === 'over' || !kind) return end(F, c);
    const def = inst ? itemDef(inst.id) : null;
    if (kind === 'shatter' && def) { F.stats.shattered++; hook(F, 'onShatter', inst, def); }
    hook(F, 'onMaterial', kind, inst || null, def);
    sanitize(F);
    checkOver(F);
    return end(F, c);
  };

  // ================= SETS (relic sets and boons, round 6) =================
  // A set bonus (DATA.SET_FX, 'set:<id>:2' / ':3') is a relic-shaped def
  // that runs next to the real relics: its mods, rules and hooks join theirs.
  // F.relics keeps the real relics only; F.sets the live bonus ids.
  function setFxOf(run) {
    const f = D().setFxIds;
    if (typeof f !== 'function') return [];
    try { return (f(run) || []).filter(id => tbl('SET_FX')[id]); } catch (e) { return []; }
  }
  function setHookIds(F) { const e = F.evos && F.evos.length ? F.evos : null; return F.sets && F.sets.length ? F.relics.concat(F.sets, e || []) : e ? F.relics.concat(e) : F.relics; }   // + the evolved items' auras (EVOLVE)
  // The game's companion pet did a trick (Treat Jar, Dog Whistle, The Hungry Pack).
  api.petTrick = function (F, petId) {
    const c = begin(F);
    if (!F || F.phase === 'over') return end(F, c);
    hook(F, 'onPet', petId || null);
    sanitize(F);
    checkOver(F);
    return end(F, c);
  };
  api.setFxOf = setFxOf;
  // ================= /SETS =================

  // ================= EVOLVE (round 7: item evolutions and pet synergies) =================
  // An evolved item's aura (DATA.EVO_FX 'evo:<id>') runs next to the relics
  // while the item is in the run's bin: F.evos, read by setHookIds and the
  // rules. The game evolves an item as it is delivered (api.evolve) and
  // stages the ceremony; api.evoPet fires a pet synergy (a proc, then its
  // effect). F.petId is the pet along (the pet combos read it).
  function evoFight(F, run) {
    const f = D().evoAuraIds;
    let ids = [];
    if (typeof f === 'function') { try { ids = (f(run) || []).filter(id => tbl('EVO_FX')[id]); } catch (e) { ids = []; } }
    F.evos = ids;
    F.petId = run && run.pet && typeof run.pet.id === 'string' ? run.pet.id : null;
    F.evolved = [];
  }
  // Merge one def's rules into the live F.rules (numbers add, amp per tag).
  function evoRules(F, id) {
    const rs = api.rulesOf([id]);
    for (const k in rs.rules) {
      const v = rs.rules[k];
      if (v && typeof v === 'object') { F.rules[k] = F.rules[k] || {}; for (const t in v) F.rules[k][t] = num(F.rules[k][t], 0) + num(v[t], 0); }
      else F.rules[k] = num(F.rules[k], 0) + num(v, 0);
      if (!F.ruleSrc[k]) F.ruleSrc[k] = id;
    }
  }
  // The recipe a fight instance is ready for: plus, real, the relic in hand (else null).
  api.evoCheck = function (F, inst) {
    const f = D().evoReady;
    if (!F || !inst || typeof f !== 'function') return null;
    try { return f(inst, F.relics) || null; } catch (e) { return null; }
  };
  // Evolve a fight instance for good (the game mirrors it on the run's bin):
  // the evolved id, no plus, and its aura joins the fight at once. -> recipe | null
  api.evolve = function (F, inst, recipe) {
    const r = recipe || api.evoCheck(F, inst);
    if (!F || !inst || !r || !itemDef(r.to) || !tbl('ITEMS')[r.to]) return null;
    inst.id = r.to; inst.plus = false;
    if (!Array.isArray(F.evolved)) F.evolved = [];
    if (!Array.isArray(F.evos)) F.evos = [];
    F.evolved.push({ uid: inst.uid, from: r.from, to: r.to });
    const aid = 'evo:' + r.to;
    if (relicDef(aid) && F.evos.indexOf(aid) < 0) { F.evos.push(aid); evoRules(F, aid); }
    log(F, `${r.name || r.to} evolved.`);
    return r;
  };
  // A pet synergy (DATA.PET_SYN) goes off: its proc, then k's effect.
  //   marbles  2 damage to a random enemy per small item in the bin (max 5)   copy {id}  a fight copy of that item
  //   burn {v} Burn on ALL enemies   feast  1 Strength and 3 Block   luck  1 Luck   anything else: the proc only
  api.evoPet = function (F, petId, k, o) {
    const c = begin(F);
    if (!F || F.phase === 'over') return end(F, c);
    o = o || {};
    const s = tbl('PET_SYN')[petId] || {};
    emit(F, procEv('pet', 'pet:' + petId, s.name || petId, s.icon || '', s.color || '#ff9ec7', o.label || String(s.name || 'PET').toUpperCase(), F.player, F));
    const p = F.player;
    switch (k) {
      case 'marbles': {
        const n = clamp(F.bin.filter(i => tagHas(itemDef(i.id), 'small')).length, 0, 5);
        for (let i = 0; i < n && F.phase !== 'over'; i++) { const e = hitTargets(F, 'random')[0]; if (e) api.damage(F, null, e, 2); }
        break;
      }
      case 'copy': if (o.id && tbl('ITEMS')[o.id]) api.addTemp(F, o.id, 1); break;
      case 'burn': alive(F).forEach(e => api.status(F, e, 'burn', Math.max(1, Math.round(num(o.v, 2))))); break;
      case 'feast': api.status(F, p, 'str', 1); gainBlock(F, p, 3); break;
      case 'luck': api.status(F, p, 'luck', 1); break;
      default: break;
    }
    sanitize(F);
    checkOver(F);
    return end(F, c);
  };
  // The firefly's Frost Light: the game marks the spotlit instance (inst.spot);
  // played against a Frozen target it resolves once more.
  function evoSpot(F, inst, def, mode, plus) {
    if (!inst || !inst.spot) return;
    delete inst.spot;
    const e = aimOf(F, { idx: F.target });
    if (F.phase !== 'player' || !e || st(e, 'freeze') <= 0) return;
    const s = tbl('PET_SYN').firefly || {};
    emit(F, procEv('pet', 'pet:firefly', s.name || 'Frost Light', s.icon || '', s.color || '#9fd8ff', 'FROST LIGHT x2', F.player, F));
    retarget(F);
    resolveFx(F, { inst, def, mode, idx: F.target, again: true }, plus);
  }
  // ================= /EVOLVE =================
  // Bait (def.eaten, per plus): what a swallowed Poison Pill or Hot Potato
  // does to its eater instead of feeding it.
  function eatenOf(def, plus) {
    if (plus && def.plus && def.plus.eaten) return def.plus.eaten;
    return def.eaten && typeof def.eaten === 'object' ? def.eaten : null;
  }
  // Hot items (def.hot) still in the bin as the turn ends burn their holder.
  function hotHands(F) {
    let v = 0;
    for (const inst of F.bin) if (!inst.frozen) v += Math.max(0, num(itemDef(inst.id).hot, 0));
    if (v <= 0) return;
    text(F, F.player, 'HOT POTATO!');
    api.status(F, F.player, 'burn', v);
  }

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
      case 'luck': return st(F.player, 'luck');
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
      runFx(F, rusty(ctx.inst, scaled(F, ctx.def, f0)), ctx);
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
        // Luck: the dice roll twice and keep the best (never on a combo's roll)
        const lucky = !ctx.combo && st(p, 'luck') > 0 && hi > lo;
        if (lucky && !ctx.luckyRoll) { ctx.luckyRoll = true; text(F, p, 'LUCKY ROLL'); }
        for (let i = 0; i < n && F.phase !== 'over'; i++) {
          const r = F.rng.int(lo, hi);
          hit(lucky ? Math.max(r, F.rng.int(lo, hi)) : r);
        }
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
    const inst = { uid: newUid(), id: src.id, plus: cmp2Plus(src), frozen: false, junk: false, temp: true };
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
      const plus = cmp2Plus(inst);
      const ctx = { inst, def, mode, idx };
      // Rules that change this item's numbers credit their relic.
      const real = !isJunk(inst) && fxOf(def, plus).length > 0;
      if (real && num(F.rules.glassBreak, 0) > 0 && tagHas(def, 'glass')) ruleProc(F, 'glassBreak', 'GLASS CANNON');
      if (real && F.rules.amp && !F.grab.amped && Object.keys(F.rules.amp).some(t => tagHas(def, t))) {
        F.grab.amped = true;   // once a grab: a scoop of marbles is one proc
        ruleProc(F, 'amp');
      }
      if (inst.rust && fxOf(def, plus).length) text(F, F.player, 'RUSTY');
      resolveFx(F, ctx, plus);
      if (F.phase === 'player') cr8Play(F, inst, def);   // metal feeds Mama Mech's turret (CR8 block)
      rosPlay(F, inst, def);   // soap blows bubbles (ROS block)
      // A lit bomb grabbed out flies back at whoever lit it.
      if (inst.fuse != null) throwBack(F, inst);
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
      evoSpot(F, inst, def, mode, plus);   // the firefly's Frost Light: a spotlit item on a Frozen enemy resolves twice (EVOLVE)
      if (!hasAgain(def, plus)) F.lastPlay = { inst, def, plus };
      // Bleed: the player bleeds when acting (playing an item).
      if (F.phase !== 'over') tickDmg(F, F.player, 'bleed');
      if (F.result !== 'lose') hook(F, 'onPlay', inst, def);
      // Glass that exhausts shatters (Glass Cannon makes every glass item do so).
      const glass = tagHas(def, 'glass');
      const gone = exhausts(def, plus) || (glass && num(F.rules.glassBreak, 0) > 0);
      (gone ? F.exhausted : F.used).push(inst);
      legAfterPlay(F, inst);   // the black hole takes it, or it bounces back into the cabinet (LEG block)
      if (gone && glass && F.result !== 'lose') {
        F.stats.shattered++;
        itemProc(F, def, 'SHATTER');
        hook(F, 'onShatter', inst, def);
      }
      // This grab's deliveries, for the combos at grabDone.
      F.grab.insts.push(inst);
      F.grab.defs.push(def);
    }
    // The Smelter's red hot metal: the grab worked, the hand pays for it.
    if (inst.hot) burnHot(F, inst);
    stoPlayed(F, inst, def);   // the ice block smashes, metal jams the conveyor (STORY block)
    depPlayed(F, inst, def);   // the boot snaps the lure off, a chest pays or bites (DEP block)
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
    if (!(F.leg && F.leg.noVolley > 0)) cr8TurnEnd(F);   // Mama Mech's turret fires its volley (CR8 block) (LEG: not with the Overclocked Core)
    if (checkOver(F)) return end(F, c);
    hotHands(F);   // a Hot Potato left in the bin (round 3)
    tickDmg(F, p, 'burn');
    if (checkOver(F)) return end(F, c);
    F.tilt = 0;
    F.fresh = {};
    F.dry = !F.playedThisTurn;
    F.phase = 'enemy';
    bossTurnEnd(F);
    famPhaseStart(F);   // who plays the SOLO, who hums (FAMILY block)
    for (const e of F.enemies.slice()) {
      if (!e.alive || F.enemies.indexOf(e) < 0) continue;
      enemyAct(F, e);
      sanitize(F);
      if (checkOver(F)) break;
    }
    famPhaseEnd(F);   // the choir's anger, a full Crescendo turns into a SOLO, the choir in step (FAMILY block)
    depPhaseEnd(F);   // a Crab Changer takes what is still pinched into its shell (DEP block)
    // After the enemies acted: lit bombs left in the bin burn down, eggs
    // left alone hatch (the hatchlings act from next round).
    if (F.phase === 'enemy') { binTimers(F); sanitize(F); checkOver(F); }
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
  // (RROW round 21) An item's effects as this fight's relic rules scale them (the resolve row's Block and heal chips).
  api.fxNow = function (F, def, plus) { return F && def ? fxOf(def, plus).map(f => scaled(F, def, f)) : []; };
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

  /* ================================================================ BESTIARY
     Round 4 (DESIGN.md "Enemies", the bestiary): enemies whose tricks play
     with the claw machine itself. COMBAT decides and emits a bin event; the
     game stages it in the cabinet (game.js BESTIARY block). The only fight
     state kept here is F.buried (the Mole's items under the floor, [{inst,
     by: enemy uid}]); the physical looks (a wiggling claw, sticky goo, a
     magnetic lid, invisible items) live in the game's FS and end with the
     player's next turn.
       tickle  {v}  {t:'binTickle', idx, turns}            the claw wiggles on every drop next turn
       glue    {v}  {t:'binGlue', idx, turns}              the pile sticks together next turn
       ceiling {v}  {t:'binCeiling', idx, turns, insts}    metal floats up under the lid for a turn
       plow         {t:'binPlow', idx, dir}                the pile is shoved to the far wall
       vanish  {n}  {t:'binVanish', idx, insts}            items go invisible until the claw touches them
       bury    {n}  {t:'binBury', idx, inst} per item      under the floor (F.buried) until dug up
       wheel        {t:'binWheel', idx, w, who, label}     then the prize itself (status / block / heal / gold)
       def.rival    {t:'binRival', idx, inst}, then binEat  the rival claw takes the rarest item every turn
     A Mole that dies gives its buried items back ({t:'binUnbury', idx, insts}). */
  const BEST_KINDS = ['tickle', 'glue', 'ceiling', 'plow', 'vanish', 'bury', 'wheel'];
  const BEST_FLOOR = 4;      // bury and the rival claw never take the player below this many real items
  // The Carnival Barker's prize wheel: eight wedges, its own and yours in turn.
  const BEST_WHEEL = [
    { who: 'it', k: 'str', v: 2, label: '+2 STRENGTH', col: '#ff5a4a' },
    { who: 'you', k: 'block', v: 8, label: 'YOU: +8 BLOCK', col: '#2ee6d6' },
    { who: 'it', k: 'heal', v: 12, label: 'IT HEALS 12', col: '#a6ff5e' },
    { who: 'you', k: 'gold', v: 15, label: 'YOU: +15 GOLD', col: '#ffc94d' },
    { who: 'it', k: 'thorns', v: 2, label: '+2 THORNS', col: '#8fae3a' },
    { who: 'you', k: 'str', v: 1, label: 'YOU: +1 STRENGTH', col: '#ff9a2e' },
    { who: 'it', k: 'block', v: 12, label: '+12 BLOCK', col: '#8fb6ff' },
    { who: 'you', k: 'heal', v: 8, label: 'YOU: HEAL 8', col: '#6bd35e' },
  ];
  const BEST_HOUSE = 1.3;    // the house edge: its own wedges weigh this much (twice that once enraged)

  // Resolve one bestiary move. False for a kind this block does not know.
  function bestMove(F, e, m) {
    if (!m || BEST_KINDS.indexOf(m.k) < 0) return false;
    const idx = F.enemies.indexOf(e), turns = Math.max(1, num(m.v, 1) | 0);
    switch (m.k) {
      case 'tickle': emit(F, { t: 'binTickle', idx, turns }); text(F, e, 'COOCHIE COO'); break;
      case 'glue': emit(F, { t: 'binGlue', idx, turns }); text(F, e, 'SPLORT'); break;
      case 'ceiling': {
        const insts = F.bin.filter(i => !i.frozen && tagHas(itemDef(i.id), 'metal'));
        if (!insts.length) { text(F, e, 'NO METAL'); break; }
        emit(F, { t: 'binCeiling', idx, turns, insts });
        text(F, e, 'ZZZT');
        break;
      }
      case 'plow': emit(F, { t: 'binPlow', idx, dir: -1 }); text(F, e, 'BEEP BEEP'); break;
      case 'vanish': {
        const pool = F.bin.filter(i => !isJunk(i));
        const insts = [];
        for (let k = Math.min(pool.length, Math.max(1, num(m.n, 1) | 0)); k > 0; k--) insts.push(pool.splice(Math.floor(F.rng() * pool.length), 1)[0]);
        if (!insts.length) { text(F, e, 'NOTHING'); break; }
        emit(F, { t: 'binVanish', idx, insts });
        text(F, e, 'BOO!');
        break;
      }
      case 'bury': if (!bestBury(F, e, Math.max(1, num(m.n, 1) | 0))) text(F, e, 'NOTHING'); break;
      case 'wheel': bestWheel(F, e); break;
      default: break;
    }
    return true;
  }
  // The Mole: n random real items go under the floor (never below BEST_FLOOR).
  function bestBury(F, e, n) {
    if (!Array.isArray(F.buried)) F.buried = [];
    let got = 0;
    for (let k = 0; k < n; k++) {
      if (playable(F) <= BEST_FLOOR) break;
      const pool = F.bin.filter(i => !isJunk(i) && !i.frozen);
      if (!pool.length) break;
      const inst = pool[Math.floor(F.rng() * pool.length)];
      F.bin.splice(F.bin.indexOf(inst), 1);
      F.buried.push({ inst, by: e.uid });
      emit(F, { t: 'binBury', idx: F.enemies.indexOf(e), inst });
      got++;
    }
    if (got) text(F, e, 'DIG DIG');
    return got;
  }
  // The claw dug a mound up: the item is back in the bin ('bin'), or the used
  // pile when the cabinet is full ('used'); null when it was not buried.
  api.bestUnbury = function (F, inst) {
    if (!F || !Array.isArray(F.buried)) return null;
    for (let k = 0; k < F.buried.length; k++) {
      const b = F.buried[k];
      if (b.inst !== inst && !(inst && b.inst.uid === inst.uid)) continue;
      F.buried.splice(k, 1);
      if (F.bin.length < MAX_CABINET) { F.bin.push(b.inst); return 'bin'; }
      F.used.push(b.inst);
      return 'used';
    }
    return null;
  };
  // A Mole that goes down coughs up everything it buried.
  function bestDeath(F, e) {
    if (!F || !e || !Array.isArray(F.buried) || !F.buried.length) return;
    const back = [];
    for (let k = 0; k < F.buried.length; k++) if (F.buried[k].by === e.uid) back.push(F.buried[k].inst);
    if (!back.length) return;
    F.buried = F.buried.filter(b => b.by !== e.uid);
    for (const inst of back) (F.bin.length < MAX_CABINET ? F.bin : F.used).push(inst);
    emit(F, { t: 'binUnbury', idx: F.enemies.indexOf(e), insts: back });
  }
  // The Carnival Barker spins its wheel: the wedge is rolled here (the house
  // edge weighs its own wedges), the event goes first so the game can spin
  // it, then the prize lands through the usual status / block / heal / gold.
  function bestWheel(F, e) {
    const p = F.player, itW = BEST_HOUSE * (e.enraged ? 2 : 1);
    let tot = 0;
    for (const w of BEST_WHEEL) tot += w.who === 'it' ? itW : 1;
    let r = F.rng() * tot, wi = BEST_WHEEL.length - 1;
    for (let k = 0; k < BEST_WHEEL.length; k++) { r -= BEST_WHEEL[k].who === 'it' ? itW : 1; if (r < 0) { wi = k; break; } }
    const w = BEST_WHEEL[wi], u = w.who === 'it' ? e : p;
    emit(F, { t: 'binWheel', idx: F.enemies.indexOf(e), w: wi, who: w.who, label: w.label });
    if (w.k === 'heal') api.heal(F, u, w.v);
    else if (w.k === 'block') gainBlock(F, u, w.v);
    else if (w.k === 'gold') api.gainGold(F, w.v);
    else api.status(F, u, w.k, w.v);
    return wi;
  }
  // The item the rival claw goes for next: the rarest, upgraded first, metal
  // breaks ties, then bin order. Pure (no rng), so the game can mark it on
  // the player's turn and the telegraph is the truth.
  api.bestRivalPick = function (F) {
    let best = null, bs = -1;
    for (const i of (F && F.bin) || []) {
      if (isJunk(i) || i.frozen) continue;
      const d = itemDef(i.id);
      const s = num(RAR[d.rarity], 1) * 10 + (i.plus ? 5 : 0) + (tagHas(d, 'metal') ? 3 : 0);
      if (s > bs) { bs = s; best = i; }
    }
    return best;
  };
  // After a rival's move its own claw grabs the rarest item into its case
  // (the belly rules: hiccups and its death give them back; digest 99 means
  // it keeps them for the fight). Twice once enraged.
  function bestAfterAct(F, e) {
    if (!e || !e.def || !e.def.rival || !e.alive || F.phase === 'over' || F.player.hp <= 0) return;
    for (let k = e.enraged ? 2 : 1; k > 0; k--) {
      if (!Array.isArray(e.belly) || e.belly.length >= BELLY_MAX) { text(F, e, 'CASE FULL'); return; }
      if (playable(F) <= BEST_FLOOR) return;
      const inst = api.bestRivalPick(F);
      if (!inst) return;
      emit(F, { t: 'binRival', idx: F.enemies.indexOf(e), inst });
      eat(F, e, inst);
    }
  }
  // The rival claw rides on every action: the telegraph says so.
  function bestRide(e) {
    if (!e || !e.def || !e.def.rival || !e.alive) return '';
    return e.enraged ? 'then its claw grabs your 2 rarest items' : 'then its claw grabs your rarest item';
  }
  function bestIntent(e, m) {
    const n = Math.max(1, num(m && m.n, 1) | 0);
    switch (m && m.k) {
      case 'tickle': return 'Tickles your claw (it wiggles next turn)';
      case 'glue': return 'Slimes the bin (sticky next turn)';
      case 'ceiling': return 'Magnetizes the lid (metal floats up)';
      case 'plow': return 'Plows your pile to the far wall';
      case 'vanish': return `Turns ${n} items invisible`;
      case 'bury': return n > 1 ? `Buries ${n} items under the floor` : 'Buries an item under the floor';
      case 'wheel': return 'Spins the prize wheel';
      default: return '';
    }
  }
  api.BEST_KINDS = BEST_KINDS;
  api.BEST_WHEEL = BEST_WHEEL;
  api.BEST_FLOOR = BEST_FLOOR;
  api.bestRide = bestRide;
  /* ============================================================ end BESTIARY */

  /* ================= QA (round 7): the incoming-damage telegraph =================
     A pure read of F (nothing changes, no rng) for the elite readability pass:
     what one enemy's next action hits the player for, and what the whole
     enemy phase would cost if the turn ended now. A hit is calcHit of the
     move's value with the enemy's Strength (its Enrage lands before it acts,
     a held weapon due to be digested or coughed up leaves first), its Weak,
     the player's Vulnerable and Armor, exactly as api.damage does. Multi-hits
     and a Hasty jab count; a frozen or stunned enemy, or one its own Poison
     and Burn finish first, skips. A charge reports the unleash it winds up
     for next turn (one more Enrage by then; a 1-stack Vulnerable or Weak has
     worn off). The phase: the player's Burn ticks first (a Hot Potato adds
     to it, through Block), then the hits in acting order (Dodge eats whole
     hits, Block soaks the rest, a Vulnerable debuff lands for the enemies
     after it), then lit bombs that go off in the bin, then the player's own
     Poison as the next turn starts. */
  function qaIntentOf(F, e, vulnSim, strAdd) {
    const m = e && e.alive ? e.intent : null;
    const out = { k: m ? m.k || '' : '', hit: 0, n: 0, jab: 0, total: 0, next: 0, skip: false, charged: !!(m && m.charged), name: m ? m.name || '' : '' };
    if (!m || !F || !F.player) return out;
    const p = F.player;
    let str = st(e, 'str') + st(e, 'enrage') + num(strAdd, 0);
    for (const b of e.belly || []) if (b && b.str && num(b.turns, 9) <= 1) str -= Math.min(b.str, Math.max(0, str));
    const weak = st(e, 'weak') > 0, vuln = vulnSim || st(p, 'vuln') > 0, armor = st(p, 'armor');
    out.skip = st(e, 'freeze') > 0 || st(e, 'stun') > 0 || st(e, 'poison') + st(e, 'burn') >= e.hp;
    if (m.k === 'attack') {
      out.n = Math.max(1, num(m.n, 1) | 0);
      out.hit = calcHit(m.charged ? e.charged : famHitV(F, e, m), str, weak, vuln, armor);   // (FAMILY: a SOLO or a hum with its harmony)
      if (m.fam) { out.fam = m.fam; out.band = famIn(F, e, m.fam); }
      if (api.hasteNext(e)) out.jab = calcHit(Math.max(1, Math.round(num(m.v, 0) / 2)), str, weak, vuln, armor);
      out.total = (out.hit + out.jab) * out.n;
    } else if (m.k === 'charge') {
      out.next = calcHit(Math.max(0, num(m.v, 0)), str + st(e, 'enrage'), st(e, 'weak') > 1, st(p, 'vuln') > 1, armor);
    }
    return out;
  }
  api.qaIntent = (F, e) => qaIntentOf(F, unit(F, e) || e, false, 0);
  api.qaThreat = function (F) {
    // net: everything that gets through (uncapped, so a lethal preview can say
    // how much more Block would do); loss: what the engine would take (capped at hp)
    const r = { raw: 0, burn: 0, poison: 0, bomb: 0, dodged: 0, blocked: 0, net: 0, loss: 0, hp: 0, left: 0, lethal: false, per: [] };
    if (!F || !F.player || F.phase === 'over') return r;
    const p = F.player;
    let block = Math.max(0, num(p.block, 0)), dodge = st(p, 'dodge');
    r.hp = Math.max(0, num(p.hp, 0));
    let burn = st(p, 'burn');
    for (const inst of F.bin) if (inst && !inst.frozen) burn += Math.max(0, num(itemDef(inst.id).hot, 0));
    r.burn = Math.min(MAX_STACK, burn);
    r.net = r.burn;
    let vulnSim = false, strAll = 0, poisonAdd = 0;
    F.enemies.forEach((e, idx) => {
      if (!e || !e.alive) return;
      const q = qaIntentOf(F, e, vulnSim, strAll);
      q.idx = idx;
      r.per.push(q);
      const m = e.intent;
      if (q.skip) return;
      const reps = m && m.k !== 'attack' && api.hasteNext(e) ? 2 : 1;   // Hasty does the whole move again
      if (m && m.k === 'debuff' && m.s === 'vuln') vulnSim = true;
      if (m && m.k === 'debuff' && m.s === 'poison') poisonAdd += reps * Math.max(0, Math.round(num(m.v, 1)));
      if (m && m.k === 'buff' && m.s === 'str' && m.to === 'all') strAll += reps * num(m.v, 1);
      if (q.k !== 'attack') return;
      for (let s = 0; s < 2; s++) {
        const v = s ? q.jab : q.hit;
        if (s && !v) break;
        for (let i = 0; i < q.n; i++) {
          r.raw += v;
          if (dodge > 0) { dodge--; r.dodged += v; continue; }
          const b = Math.min(block, v);
          block -= b; r.blocked += b; r.net += v - b;
        }
      }
    });
    // lit bombs left in the bin go off as the enemy phase ends (no Strength, through Block)
    for (const inst of F.bin) {
      if (!inst || inst.fuse == null || inst.lit === F.turn || num(inst.fuse, 9) > 1) continue;
      const v = calcHit(num(inst.boom, 8), 0, false, vulnSim || st(p, 'vuln') > 0, st(p, 'armor'));
      const b = Math.min(block, v);
      block -= b; r.blocked += b; r.raw += v; r.bomb += v; r.net += v - b;
    }
    // and the player's own Poison ticks as the next turn starts (no Block by then)
    r.poison = Math.min(MAX_STACK, st(p, 'poison') + poisonAdd);
    r.net += r.poison;
    r.loss = Math.min(r.hp, r.net);
    r.left = r.hp - r.net;
    r.lethal = r.hp > 0 && r.left <= 0;
    return r;
  };
  /* ================= /QA ================= */

  /* ================= STORY (round 8: the alternate bosses, story callbacks in a fight) =================
     DESIGN.md "Stories, the rival and alternate bosses (round 8)". The
     alternate bosses' signatures ride bossSig like the old ones (a one-line
     case there); what they leave lasts the player's next turn like the rest:
     - plush (the Plushie Queen): sig.n Royal Plush junk into the bin (one more
       enraged, never past sig.max in the bin); while they sit there every
       hit on an enemy carrying the plush signature loses sig.soak per plush
       (stoAbsorb, one line in damage). Grabbed out they give Block like junk.
     - belt (the Conveyor King): F.conv {v, by, dir} for the player's next turn
       (the game runs the floor away from the chute) and sig.crates Shipping
       Crates ride in; a metal item delivered jams it (stoPlayed). It stops
       as the turn ends (stoTurnEnd).
     - glacier (the Arctic Arcade): sig.n real items (one more enraged) leave
       the bin into F.stoIce.insts and the block (a junk sto_glacierN in the
       bin) grows a size; delivering the block smashes it (the items come
       back, the boss takes sig.dmg per item, fixed); its death gives them
       back too (stoDeath). Never below BEST_FLOOR real items.
     Story callbacks at the bell (the game calls them after newFight):
     stoAlly(F, id, pow) (the crab pinches the strongest foe twice and gives
     Block; the ghost makes every foe Weak and gives a Dodge), stoSabotage(F,
     s, cut) (the boss starts with less hp and debuffs), stoGear(F, gear)
     (Grabby Gary's gear: more hp, Strength from the jacket on). Events:
     {t:'boss', k:'plush' | 'belt' | 'beltJam' | 'beltOff' | 'glacier' |
     'glacierBreak', ...} and {t:'sto', k:'ally' | 'sabotage' | 'gear', ...}. */
  const STO_SOAK_MAX = 6;
  const stoSigOf = (e) => (e && e.def && e.def.sig && typeof e.def.sig === 'object' ? e.def.sig : null);
  function stoPlushN(F) { let n = 0; for (const i of F.bin) if (itemDef(i.id).sto === 'plush') n++; return n; }
  function stoSig(F, e, s, info, idx) {
    switch (s.id) {
      case 'plush': {
        const cap = clamp(num(s.max, STO_SOAK_MAX) | 0, 1, 12);
        const want = clamp(Math.round(num(s.n, 3)) + (e.enraged ? 1 : 0), 1, 8);
        const items = bossJunk(F, s.item || 'sto_plush', Math.max(0, Math.min(want, cap - stoPlushN(F))));
        emit(F, { t: 'boss', k: 'plush', idx, items, name: info.name });
        if (!items.length) text(F, e, 'FULLY FLUFFED');
        break;
      }
      case 'belt': {
        F.conv = { v: Math.round(num(s.v, 70) * (e.enraged ? 1.4 : 1)), by: e.uid, dir: -1 };
        const items = bossJunk(F, s.item || 'sto_crate', clamp(Math.round(num(s.crates, 2)), 0, 4));
        emit(F, { t: 'boss', k: 'belt', idx, v: F.conv.v, items, name: info.name });
        break;
      }
      case 'glacier': {
        if (!stoFreeze(F, e, s, clamp(Math.round(num(s.n, 1)) + (e.enraged ? 1 : 0), 1, 3))) text(F, e, 'TOO WARM');
        break;
      }
      default: break;
    }
  }
  // The Arctic Arcade freezes n real items into its block (the block is made, or grows a size).
  function stoFreeze(F, e, s, n) {
    const cap = clamp(num(s.cap, 6) | 0, 1, 6);
    const I = F.stoIce || (F.stoIce = { insts: [], block: null, by: e.uid });
    const froze = [];
    for (let k = 0; k < n; k++) {
      if (I.insts.length >= cap || playable(F) <= BEST_FLOOR) break;
      const pool = F.bin.filter(i => !isJunk(i) && !i.frozen && !i.hot);
      if (!pool.length) break;
      const inst = pool[Math.floor(F.rng() * pool.length)];
      F.bin.splice(F.bin.indexOf(inst), 1);
      I.insts.push(inst);
      froze.push(inst);
    }
    if (!froze.length) return 0;
    I.by = e.uid;
    const id = 'sto_glacier' + Math.min(6, I.insts.length);
    let block = I.block && (F.bin.indexOf(I.block) >= 0 || F.used.indexOf(I.block) >= 0) ? I.block : null;
    if (block) block.id = id;
    else { block = { uid: newUid(), id, plus: false, frozen: false, junk: true, temp: true }; F.bin.push(block); I.block = block; }
    emit(F, { t: 'boss', k: 'glacier', idx: F.enemies.indexOf(e), inst: block, insts: froze, n: I.insts.length });
    text(F, e, 'FROZEN SOLID');
    return froze.length;
  }
  // The block breaks: everything inside comes back; smashed (delivered) the boss takes sig.dmg per item.
  function stoBreak(F, block, smash) {
    const I = F.stoIce;
    if (!I) return 0;
    if (block && I.block && I.block !== block && I.block.uid !== block.uid) return 0;
    I.block = null;
    if (!I.insts.length) return 0;
    const back = I.insts.splice(0);
    for (const i of back) (F.bin.length < MAX_CABINET ? F.bin : F.used).push(i);
    const e = F.enemies.find(x => x.uid === I.by) || null, s = stoSigOf(e);
    const v = smash && e && e.alive ? back.length * Math.max(1, num(s && s.dmg, 5)) : 0;
    emit(F, { t: 'boss', k: 'glacierBreak', idx: e ? F.enemies.indexOf(e) : -1, insts: back, v, smash: !!smash });
    if (v > 0) { text(F, e, 'SMASH!'); api.damage(F, null, e, v, { fixed: true }); }
    return back.length;
  }
  // COMBAT.damage: the plushies in the bin soak hits on the Queen (and on any boss borrowing her trick).
  function stoAbsorb(F, tgt, amt) {
    if (!(amt > 0) || !tgt || isPlayer(F, tgt) || !tgt.alive) return amt;
    const s = stoSigOf(tgt);
    if (!s || s.id !== 'plush') return amt;
    const n = Math.min(stoPlushN(F), clamp(num(s.max, STO_SOAK_MAX) | 0, 1, 12));
    const soak = Math.min(amt, n * Math.max(1, num(s.soak, 1)));
    if (soak <= 0) return amt;
    text(F, tgt, 'FLUFF -' + soak);
    return amt - soak;
  }
  // COMBAT.play: the ice block smashes open; a metal item jams the conveyor.
  function stoPlayed(F, inst, def) {
    if (!def) return;
    if (def.sto === 'glacier') { stoBreak(F, inst, true); return; }
    if (F.conv && tagHas(def, 'metal')) {
      F.conv = null;
      emit(F, { t: 'boss', k: 'beltJam', idx: -1, inst });
      text(F, F.player, 'JAMMED!');
    }
  }
  // bossTurnEnd: the conveyor stops as the player's turn ends.
  function stoTurnEnd(F) {
    if (!F.conv) return;
    F.conv = null;
    emit(F, { t: 'boss', k: 'beltOff', idx: -1 });
  }
  // kill: the Arctic Arcade's block melts open when it goes down; the King's belt stops.
  function stoDeath(F, e) {
    if (F.stoIce && F.stoIce.by === e.uid) stoBreak(F, null, false);
    if (F.conv && F.conv.by === e.uid) stoTurnEnd(F);
  }
  // A friend from a story fights one turn for you (the game calls it at the bell).
  api.stoAlly = function (F, id, pow) {
    const c = begin(F);
    if (!F || F.phase === 'over') return end(F, c);
    const A = (D().STO && D().STO.ally) || {};
    pow = clamp(num(pow, 1), 1, 3);
    if (id === 'crab') {
      const K = A.crab || { dmg: 6, perAct: 3, hits: 2, block: 5 };
      const foes = alive(F);
      if (!foes.length) return end(F, c);
      const e = foes.reduce((a, b) => (b.hp > a.hp ? b : a));
      const v = Math.round((num(K.dmg, 6) + num(K.perAct, 3) * (F.act - 1)) * pow);
      const n = Math.max(1, num(K.hits, 2) | 0);
      emit(F, { t: 'sto', k: 'ally', id, idx: F.enemies.indexOf(e), v, n, pow });
      text(F, e, 'PINCH!');
      for (let k = 0; k < n && e.alive; k++) api.damage(F, null, e, v);
      gainBlock(F, F.player, Math.round(num(K.block, 5) * pow));
    } else if (id === 'ghost') {
      const K = A.ghost || { weak: 2, dodge: 1 };
      emit(F, { t: 'sto', k: 'ally', id, idx: -1, pow });
      for (const e of alive(F)) api.status(F, e, 'weak', Math.round(num(K.weak, 2) * pow));
      api.status(F, F.player, 'dodge', Math.round(num(K.dodge, 1) * pow));
    } else return end(F, c);
    log(F, `A friend from the road helps out (${id}).`);
    checkOver(F);
    return end(F, c);
  };
  // The intern's sabotage: the boss starts cut * its hp down, with statuses {s: v}.
  api.stoSabotage = function (F, s, cut) {
    const c = begin(F);
    const e = F && F.phase !== 'over' ? alive(F).find(x => x.def && x.def.tier === 'boss') : null;
    if (!e) return end(F, c);
    const lost = Math.round(e.hp * clamp(num(cut, 0.12), 0, 0.5));
    e.hp = Math.max(1, e.hp - lost);
    emit(F, { t: 'sto', k: 'sabotage', id: 'intern', idx: F.enemies.indexOf(e), v: lost });
    text(F, e, 'SABOTAGED');
    for (const k in (s || {})) if (statusDef(k)) api.status(F, e, k, clamp(num(s[k], 0) | 0, 0, 5));
    log(F, `${e.def.name || e.id} was sabotaged.`);
    return end(F, c);
  };
  // Grabby Gary's gear: +hp per piece, and from the jacket on he starts pumped.
  api.stoGear = function (F, gear) {
    const c = begin(F);
    const K = (D().GARY && D().GARY.duel) || { hpPerGear: 0.06, strAt: 3 };
    gear = clamp(num(gear, 0) | 0, 0, 9);
    for (const e of F ? F.enemies : []) {
      if (!e.alive || e.id !== 'gary' || e.gear != null) continue;
      e.gear = gear;
      if (gear > 0) { const m = 1 + num(K.hpPerGear, 0.06) * gear; e.maxHp = Math.round(e.maxHp * m); e.hp = Math.round(e.hp * m); }
      if (gear >= num(K.strAt, 3)) api.status(F, e, 'str', 1);
      emit(F, { t: 'sto', k: 'gear', idx: F.enemies.indexOf(e), v: gear });
    }
    return end(F, c);
  };
  api.stoIce = (F) => (F && F.stoIce ? F.stoIce : null);
  api.stoPlush = (F) => (F ? stoPlushN(F) : 0);
  api.stoBreak = (F, block, smash) => { const c = begin(F); if (F) stoBreak(F, block || null, !!smash); return end(F, c); };
  /* ================= /STORY ================= */

  /* ================= CR8 (round 8): Mama Mech's scrap turret ================= */
  // DESIGN.md "Mama Mech and two new claws". Mama Mech (CHARACTERS.engineer,
  // `turret: true`) builds a turret on the cabinet frame out of what she
  // delivers: every metal item played is a part (an item's `part` field says
  // how many it is worth instead), the parts climb the levels in TUR.need, and
  // at the end of each player turn (before the enemies act) the turret fires
  // TUR.shots[lv] shots of TUR.dmg[lv] (+ the relics' tur.amp) at the target
  // (at Lv 5 the last one hits ALL). Past the top level every part is ammo: an
  // OVERCLOCK shot on the spot. A relic's `tur: {amp}` adds shot damage.
  // Turret damage has no attacker (no Strength, no Thorns), like a
  // relic's. rules.turret (Blueprints) builds it for any crawler, and gives
  // Mama TUR.bonus more parts at the bell. F.tur = {parts, lv, amp, shots,
  // dealt, over} or null. Events: {t:'turret', k:'part'|'up'|'fire'|'over', ...}.
  const TUR = {
    need: [0, 2, 4, 7, 11, 16], shots: [0, 1, 2, 2, 3, 4], dmg: [0, 3, 3, 5, 5, 6], max: 5, bonus: 3,
    names: ['BARE MOUNT', 'PEA SHOOTER', 'BOLT GUN', 'RIVET CANNON', 'GATLING', 'MEGA MECH'],
  };
  function turLv(parts) { let lv = 0; for (let i = 1; i < TUR.need.length; i++) if (parts >= TUR.need[i]) lv = i; return lv; }
  // newFight: who has a turret, its relic bonuses, the starting parts.
  function cr8Fight(F, run) {
    const cd = run.char ? (tbl('CHARACTERS')[run.char] || null) : null;
    const gift = !!(cd && cd.turret), rule = num(F.rules && F.rules.turret, 0) > 0;
    let amp = 0;
    for (const id of F.relics.concat(F.sets || [], F.evos || [])) {
      const r = relicDef(id), t = r && r.tur;
      if (t && typeof t === 'object') amp += Math.max(0, num(t.amp, 0));
    }
    const more = gift && rule ? TUR.bonus : 0;
    F.tur = gift || rule ? { parts: 0, lv: 0, amp, shots: 0, dealt: 0, over: 0 } : null;
    if (F.tur && rule) ruleProc(F, 'turret', gift ? 'BLUEPRINTS +' + more : 'TURRET BUILT');
    if (F.tur && more) turretParts(F, more, 'BLUEPRINTS');
  }
  // Feed the turret n parts (label: who gave them, for the float). Returns the parts added.
  function turretParts(F, n, label) {
    const T = F && F.tur;
    n = Math.round(num(n, 0));
    if (!T || n <= 0 || F.phase === 'over') return 0;
    const lv0 = T.lv, top = TUR.need[TUR.max];
    const add = Math.min(n, Math.max(0, top - T.parts)), extra = n - add;
    if (add > 0) {
      T.parts += add;
      T.lv = turLv(T.parts);
      emit(F, { t: 'turret', k: 'part', n: add, parts: T.parts, lv: T.lv, need: T.lv < TUR.max ? TUR.need[T.lv + 1] : top, label: label || '' });
      if (T.lv > lv0) {
        emit(F, { t: 'turret', k: 'up', lv: T.lv, name: TUR.names[T.lv], parts: T.parts });   // (the game floats the words by the turret)
        log(F, `The turret is now a ${TUR.names[T.lv]}.`);
      }
    }
    // maxed out: every extra part is ammo, fired at once
    for (let i = 0; i < extra && F.phase !== 'over'; i++) { T.over++; turretShot(F, 'over', 0, 1); }
    return add;
  }
  // One shot at the target (or ALL on a mega shot). Returns the damage dealt.
  function turretShot(F, k, i, n, all) {
    const T = F.tur;
    retarget(F);
    const lv = Math.max(1, T.lv), dmg = TUR.dmg[lv] + T.amp;
    const foes = all ? alive(F) : [F.enemies[F.target]].filter(e => e && e.alive);
    if (!foes.length) return 0;
    emit(F, { t: 'turret', k, idx: all ? -1 : F.enemies.indexOf(foes[0]), dmg, shot: i, shots: n, lv: T.lv, all: !!all });
    let got = 0;
    for (const e of foes) { if (F.phase === 'over') break; got += api.damage(F, null, e, dmg); }
    T.shots++; T.dealt += got;
    return got;
  }
  // The end of the player's turn: the turret fires its volley.
  function cr8TurnEnd(F) {
    const T = F.tur;
    if (!T || T.lv < 1 || F.phase !== 'player') return;
    const n = TUR.shots[T.lv];
    for (let i = 0; i < n && F.phase === 'player'; i++) turretShot(F, 'fire', i, n, T.lv >= TUR.max && i === n - 1);
    sanitize(F);
  }
  // A played item: metal feeds the turret (def.part overrides the count).
  function cr8Play(F, inst, def) {
    if (!F.tur || !def) return;
    const p = def.part != null ? num(def.part, 0) : tagHas(def, 'metal') ? 1 : 0;
    if (p > 0) turretParts(F, p);
  }
  api.TUR = TUR;
  api.turLv = turLv;
  api.turretParts = function (F, n, label) { const c = begin(F); if (F && F.tur) { turretParts(F, n, label); sanitize(F); checkOver(F); } return end(F, c); };
  api.turretFire = function (F) { const c = begin(F); if (F && F.tur) { cr8TurnEnd(F); checkOver(F); } return end(F, c); };
  api.turretOf = (F) => (F && F.tur ? F.tur : null);
  /* ================= /CR8 ================= */

  /* ================= ROS (round 10): Ms. Bubbles' bubbles, the mutator pack's claw, the new pets ================= */
  // DESIGN.md "Ms. Bubbles, the mutator pack and three pets". Ms. Bubbles
  // (CHARACTERS.bubbler, `bubbles: true`) blows ROS.gift bubbles into the
  // cabinet every turn (rules.bubbles, the Foam Machine, blows ROS.rule for
  // anyone, and one more for her); an item's `soap` blows that many more when
  // it is played ({t:'ros', k:'blow', n}). The game floats them and reports
  // the pops: api.rosPop(F, n, 'chute' | 'bin'). A bubble popped in the chute
  // pays the relics' `bub.block` Block and `bub.dmg` to a random enemy; two
  // or more in one grab is a BUBBLE COMBO: n x combo damage to ALL. A bubble
  // that bursts in the bin at the turn's end pays `bub.bin` Block. Pop damage
  // has no attacker, like a relic's. F.bub = {n, first, block, dmg, combo,
  // bin, blown, popped, combos, best} or null.
  const ROS = { gift: 2, rule: 1, combo: 4, max: 6 };
  // A relic-shaped def's bubble numbers (relics, set bonuses, evolved auras).
  function rosSum(F) {
    const s = { n: 0, first: 0, block: 0, dmg: 0, combo: 0, bin: 0 };
    for (const id of F.relics.concat(F.sets || [], F.evos || [])) {
      const r = relicDef(id), b = r && r.bub;
      if (!b || typeof b !== 'object') continue;
      for (const k in s) s[k] += Math.max(0, num(b[k], 0));
    }
    return s;
  }
  function rosState(F, n) {
    const s = rosSum(F);
    return { n: clamp(Math.round(n + s.n), 0, ROS.max), first: s.first, block: s.block, dmg: s.dmg, combo: ROS.combo + s.combo, bin: s.bin,
      blown: 0, popped: 0, combos: 0, best: 0 };
  }
  // newFight: who blows bubbles, and the mutator pack's claw size.
  function rosFight(F, run) {
    const cd = run.char ? (tbl('CHARACTERS')[run.char] || null) : null;
    const gift = !!(cd && cd.bubbles), rule = num(F.rules && F.rules.bubbles, 0) > 0;
    F.bub = gift || rule ? rosState(F, (gift ? ROS.gift : 0) + (rule ? ROS.rule : 0)) : null;
    if (F.bub && rule) ruleProc(F, 'bubbles', gift ? 'FOAM MACHINE +1' : 'BUBBLES ON');
    // Tiny Claw, Big Prizes: the claw's size (the game builds the rig from F.claw)
    const k = F.mut ? num(F.mut.clawK, 1) : 1;
    if (k > 0 && k !== 1) F.claw.width = clamp(num(F.claw.width, 1) * k, 0.35, 2.5);
  }
  // A played item with `soap` blows that many bubbles (the game floats them).
  function rosPlay(F, inst, def) {
    const n = def ? Math.round(num(def.soap, 0)) : 0;
    if (n <= 0 || F.phase !== 'player') return;
    if (!F.bub) F.bub = rosState(F, 0);   // soap in anyone's hands still bubbles
    emit(F, { t: 'ros', k: 'blow', n, src: def.id });
  }
  // How many bubbles the game blows at the start of this turn.
  api.rosBlowN = (F) => (F && F.bub ? F.bub.n + (F.turn === 1 ? F.bub.first : 0) : 0);
  // The game popped n bubbles: 'chute' (delivered) or 'bin' (burst at the turn's end).
  api.rosPop = function (F, n, where) {
    const c = begin(F);
    n = Math.round(num(n, 0));
    if (!F || !F.bub || n <= 0 || F.phase === 'over') return end(F, c);
    const B = F.bub, p = F.player;
    if (where === 'bin') {
      emit(F, { t: 'ros', k: 'burst', n });
      if (B.bin > 0) gainBlock(F, p, B.bin * n);
    } else {
      B.popped += n;
      emit(F, { t: 'ros', k: 'pop', n, block: B.block * n });
      if (B.block > 0) gainBlock(F, p, B.block * n);
      for (let i = 0; i < n && B.dmg > 0 && F.phase !== 'over'; i++) { const e = hitTargets(F, 'random')[0]; if (e) api.damage(F, null, e, B.dmg); }
      if (n >= 2 && F.phase !== 'over' && crOn(F, (D().CR && D().CR.BUBBLE) || 'party')) {   // (CR round 21: the Party family's)
        const dmg = n * B.combo;
        crProc(F, (D().CR && D().CR.BUBBLE) || 'party');
        B.combos++; B.best = Math.max(B.best, n);
        emit(F, { t: 'ros', k: 'combo', n, dmg });
        log(F, `Bubble Combo x${n}.`);
        for (const e of alive(F)) { if (F.phase === 'over') break; api.damage(F, null, e, dmg); }
      }
    }
    if (F.phase !== 'over') hook(F, 'onBubble', where === 'bin' ? 'bin' : 'chute', n);   // (LEG: the Crown of Foam, the Kraken Sponge)
    sanitize(F);
    checkOver(F);
    return end(F, c);
  };
  api.rosBlown = (F, n) => { if (F && F.bub) F.bub.blown += Math.max(0, Math.round(num(n, 0))); };
  // A new pet's synergy (DATA.PET_SYN): its proc, then chill {v} ALL, gold {v}, block {v}.
  api.rosPetSyn = function (F, petId, k, o) {
    const c = begin(F);
    if (!F || F.phase === 'over') return end(F, c);
    o = o || {};
    const s = tbl('PET_SYN')[petId] || {};
    emit(F, procEv('pet', 'pet:' + petId, s.name || petId, s.icon || '', s.color || '#ff9ec7', o.label || String(s.name || 'PET').toUpperCase(), F.player, F));
    const v = Math.max(1, Math.round(num(o.v, 1)));
    if (k === 'chill') alive(F).forEach(e => api.status(F, e, 'chill', v));
    else if (k === 'gold') api.gainGold(F, v);
    else if (k === 'block') gainBlock(F, F.player, v);
    sanitize(F);
    checkOver(F);
    return end(F, c);
  };
  api.ROS = ROS;
  api.rosOf = (F) => (F && F.bub ? F.bub : null);
  /* ================= /ROS ================= */

  /* ================= FAMILY (round 9: enemy families) =================
     DESIGN.md "Enemy families (round 9)". Members carry def.fam, the numbers
     live in DATA.FAM. F.fam is the fight's family state (null without a
     family, so every other fight is bit for bit the same; no rng is drawn).
     - The Band: each member that takes its action adds Crescendo (a
       frozen or stunned one does not). At full Crescendo, as the enemy phase
       ends, every member's intent becomes a SOLO (its pattern resumes after).
       A member knocked out on your turn cancels a telegraphed SOLO: the rest
       lose the beat ('fumble'). Otherwise a loss drops the meter.
     - A SOLO and the Choir's hum are attacks that swell with harmony: v x
       (1 + harm x the other members in it). Who is in it is read the way the
       telegraph reads it (alive, the same move, not frozen or stunned, not
       about to fall to its own Poison and Burn) and snapshotted as the enemy
       phase starts, so COMBAT.qaIntent / qaThreat stay exact.
     - The Vending Gang: restock, cans, change (FAM_KINDS). The Change
       Machine banks the gold it takes and pays it back when it breaks.
     - The Choir: the first hum of a phase scrambles the pile (the game
       shuffles the bodies); the choir is resynced to one pattern step after
       every phase; a globe that shatters makes the rest angry at once on
       your turn, at the end of the phase during theirs (no hit in flight changes). */
  const FAM_KINDS = ['restock', 'cans', 'change'];
  const famCfg = (id) => { const T = D().FAM; return T && id && T[id] ? T[id] : null; };
  const famId = (e) => (e && e.def && e.def.fam && famCfg(e.def.fam) ? e.def.fam : null);
  const famMates = (F, fam) => F.enemies.filter((x) => x && x.alive && famId(x) === fam);
  const famIdx = (F, e) => F.enemies.indexOf(e);
  // Would it sit this phase out? (exactly the telegraph's skip)
  const famSits = (e) => st(e, 'freeze') > 0 || st(e, 'stun') > 0 || st(e, 'poison') + st(e, 'burn') >= e.hp;
  // The members of e's family whose intent is the same family move (kind), and who will play it.
  function famIn(F, e, kind) {
    let n = 0;
    for (const x of F.enemies) if (x && x.alive && famId(x) === famId(e) && x.intent && x.intent.fam === kind && !famSits(x)) n++;
    return n;
  }
  function famFight(F) {
    F.fam = null;
    const ids = [];
    for (const e of F.enemies) { const f = famId(e); if (f && ids.indexOf(f) < 0) ids.push(f); }
    if (!ids.length) return;
    const band = famCfg('band');
    F.fam = { ids, cres: 0, max: Math.max(1, num(band && band.max, 8)), snap: {}, soloOn: false, humOn: false, angry: 0, solos: 0, hums: 0, cancels: 0, taken: 0, paid: 0 };
  }
  // The hit a family move deals (before Strength, Weak, Vulnerable and Armor).
  function famHitV(F, e, m) {
    const v = num(m && m.v, 0);
    const fam = famId(e), cfg = famCfg(fam);
    if (!m || !m.fam || !cfg || !F) return v;
    const key = fam + ':' + m.fam;
    const n = F.phase === 'enemy' && F.fam && F.fam.snap[key] != null ? F.fam.snap[key] : famIn(F, e, m.fam);
    return Math.max(1, Math.round(v * (1 + num(cfg.harm, 0) * Math.max(0, n - 1))));
  }
  // A band member's SOLO (its value scaled like its attacks).
  function famSoloMove(e) {
    const cfg = famCfg('band') || {};
    const base = num((cfg.solo || {})[e.id], 4);
    return { id: 'solo', name: 'SOLO', k: 'attack', v: Math.max(1, Math.round(base * num(e.dmgMul, 1))), n: 1, fam: 'solo',
      txt: 'Plays a SOLO with the band. Every bandmate in it makes it louder.' };
  }
  const FAM_FUMBLE = { id: 'fumble', name: 'Lost the Beat', k: 'fumble', txt: 'Lost the beat: the solo is off.' };
  // As the enemy phase starts: who plays the SOLO and who hums (the telegraph's count, kept for the phase).
  function famPhaseStart(F) {
    if (!F.fam) return;
    F.fam.snap = {}; F.fam.soloOn = false; F.fam.humOn = false;
    for (const e of F.enemies) {
      if (!e || !e.alive || !e.intent || !e.intent.fam || !famId(e)) continue;
      const key = famId(e) + ':' + e.intent.fam;
      if (F.fam.snap[key] == null) F.fam.snap[key] = famIn(F, e, e.intent.fam);
    }
  }
  // Just before a family attack lands: the SOLO's spotlight, the choir's shake (once a phase).
  function famBefore(F, e, m) {
    if (!F.fam || !m || !m.fam) return;
    const idx = famIdx(F, e), n = F.fam.snap[famId(e) + ':' + m.fam] || 1;
    if (m.fam === 'solo') {
      if (!F.fam.soloOn) { F.fam.soloOn = true; F.fam.solos++; emit(F, { t: 'fam', k: 'solo', fam: 'band', idx, n }); }
      text(F, e, 'SOLO!');
    } else if (m.fam === 'chorus') {
      if (!F.fam.humOn) { F.fam.humOn = true; F.fam.hums++; emit(F, { t: 'fam', k: 'scramble', fam: 'choir', idx, n }); }
      emit(F, { t: 'fam', k: 'hum', fam: 'choir', idx, n });
    }
  }
  // The Vending Gang's moves (and a band member that lost the beat). True when handled.
  function famMove(F, e, m) {
    if (!m) return false;
    const idx = famIdx(F, e), fam = famId(e);
    switch (m.k) {
      case 'restock': {
        // the most dented member (another one when there is one), healed, and half as much Block
        const mates = fam ? famMates(F, fam) : [e];
        let to = e, worst = 9;
        for (const a of mates) {
          const k = a.hp / Math.max(1, a.maxHp) + (a === e && mates.length > 1 ? 0.5 : 0);
          if (k < worst) { worst = k; to = a; }
        }
        const v = Math.max(1, Math.round(num(m.v, 8)));
        emit(F, { t: 'fam', k: 'restock', fam: fam || 'vending', idx, to: famIdx(F, to), v });
        api.heal(F, to, v);
        gainBlock(F, to, Math.max(1, Math.round(v / 2)));
        return true;
      }
      case 'cans': {
        const n = clamp(Math.round(num(m.n, 1)), 1, 5), c = [];
        for (let i = 0; i < n && F.bin.length + F.used.length < MAX_ITEMS; i++) {
          const inst = { uid: newUid(), id: 'fam_can', plus: false, frozen: false, junk: true, temp: true };
          F.bin.push(inst);
          c.push(inst);
        }
        if (!c.length) { text(F, e, 'NO ROOM'); return true; }
        emit(F, { t: 'fam', k: 'cans', fam: fam || 'vending', idx, items: c });
        hook(F, 'onJunk', c.length, c);
        return true;
      }
      case 'change': {
        const cfg = famCfg(fam || 'vending') || {};
        const take = Math.min(Math.max(1, Math.round(num(m.v, num(cfg.take, 12)))), api.gold(F));
        if (take <= 0) { text(F, e, 'NO CHANGE?'); gainBlock(F, e, 6); return true; }
        const arm = Math.max(1, Math.floor(take / Math.max(1, num(cfg.per, 4))));
        F.gain.gold -= take;
        e.bank = num(e.bank, 0) + take;
        if (F.fam) F.fam.taken += take;
        emit(F, { t: 'fam', k: 'change', fam: fam || 'vending', idx, gold: take, armor: arm });
        text(F, F.player, `-${take} gold`);
        for (const a of (fam ? famMates(F, fam) : [e])) api.status(F, a, 'armor', arm);
        return true;
      }
      case 'fumble': {
        text(F, e, 'LOST THE BEAT');
        emit(F, { t: 'fam', k: 'fumble', fam: fam || 'band', idx });
        return true;
      }
      default: return false;
    }
  }
  // After a member took its action (not when frozen or stunned): the band's Crescendo.
  function famActed(F, e) {
    if (!F.fam || famId(e) !== 'band' || !e.intent || e.intent.fam === 'solo') return;
    const cfg = famCfg('band');
    const add = Math.max(0, num((cfg.beat || {})[e.id], num(cfg.per, 1)));
    const was = F.fam.cres;
    F.fam.cres = Math.min(F.fam.max, was + add);
    if (F.fam.cres !== was) emit(F, { t: 'fam', k: 'cres', fam: 'band', idx: famIdx(F, e), v: F.fam.cres, max: F.fam.max, add: F.fam.cres - was });
  }
  // As the enemy phase ends: the choir's anger lands, a full Crescendo turns into SOLO intents
  // (or a SOLO just played empties the meter), and the choir steps back into one pattern step.
  function famPhaseEnd(F) {
    const S = F.fam;
    if (!S || F.phase !== 'enemy') return;
    if (S.angry > 0) { famAnger(F, S.angry); S.angry = 0; }
    const band = famMates(F, 'band');
    if (S.soloOn) {
      S.cres = 0;
      emit(F, { t: 'fam', k: 'cres', fam: 'band', idx: -1, v: 0, max: S.max, reset: true });
      // one that sat the SOLO out (frozen) does not keep it for later
      for (const a of band) if (a.intent && a.intent.fam === 'solo') api.pickIntent(F, a);
    } else if (S.cres >= S.max && band.length) {
      for (const a of band) {
        if (a.charged > 0) continue;
        if ((a.def.ai || 'cycle') === 'cycle') a.cyc = Math.max(0, num(a.cyc, 0) - 1);   // the pattern resumes after the SOLO
        a.intent = famSoloMove(a);
        emit(F, { t: 'intent', idx: famIdx(F, a), fam: true });
      }
      emit(F, { t: 'fam', k: 'soloReady', fam: 'band', idx: famIdx(F, band[0]), n: band.length });
    }
    const ch = famMates(F, 'choir');
    if (ch.length > 1) {
      let top = 0;
      for (const a of ch) top = Math.max(top, num(a.cyc, 0));
      for (const a of ch) if (num(a.cyc, 0) !== top && !(a.charged > 0)) { a.cyc = Math.max(0, top - 1); api.pickIntent(F, a); }
    }
    S.snap = {}; S.soloOn = false; S.humOn = false;
  }
  // The choir gets angry: every globe left gains Strength (n shattered globes' worth).
  function famAnger(F, n) {
    const cfg = famCfg('choir') || {}, left = famMates(F, 'choir');
    if (!left.length) return;
    for (const a of left) { a.famAngry = num(a.famAngry, 0) + n; api.status(F, a, 'str', Math.max(1, Math.round(num(cfg.angry, 3) * n))); }
    emit(F, { t: 'fam', k: 'angry', fam: 'choir', idx: famIdx(F, left[0]), n: left.length });
  }
  // A member falls (kill): the band loses the beat, the choir gets angry, the Change Machine pays out.
  function famDeath(F, e) {
    const fam = famId(e);
    if (!fam || !F.fam) return;
    const idx = famIdx(F, e);
    if (fam === 'band') {
      const rest = famMates(F, 'band');
      const pending = rest.filter((a) => a.intent && a.intent.fam === 'solo');
      if (pending.length && F.phase !== 'enemy') {
        for (const a of pending) a.intent = Object.assign({}, FAM_FUMBLE);
        F.fam.cres = 0; F.fam.cancels++;
        emit(F, { t: 'fam', k: 'cancel', fam, idx, n: pending.length });
      } else if (!pending.length && F.fam.cres > 0) {
        F.fam.cres = Math.max(0, F.fam.cres - Math.max(0, num((famCfg('band') || {}).drop, 3)));
        emit(F, { t: 'fam', k: 'cres', fam, idx, v: F.fam.cres, max: F.fam.max, lost: true });
      }
    } else if (fam === 'choir') {
      emit(F, { t: 'fam', k: 'shatter', fam, idx });
      if (famMates(F, 'choir').length) { if (F.phase === 'enemy') F.fam.angry++; else famAnger(F, 1); }
    } else if (fam === 'vending' && num(e.bank, 0) > 0) {
      const g = num(e.bank, 0);
      e.bank = 0; F.fam.paid += g;
      emit(F, { t: 'fam', k: 'payout', fam, idx, gold: g });
      api.gainGold(F, g);
    }
  }
  // The telegraph's words for the family moves ('' for anything else).
  function famText(e, m, v) {
    if (!m) return '';
    if (m.k === 'attack' && m.fam === 'solo') return `SOLO: ${v} each, louder with every bandmate in it`;
    if (m.k === 'attack' && m.fam === 'chorus') return `Hums in harmony: ${v}, louder with every globe humming, and shakes your pile`;
    switch (m.k) {
      case 'restock': return `Restocks a friend: heals ${Math.round(num(m.v, 8))}, ${Math.max(1, Math.round(num(m.v, 8) / 2))} Block`;
      case 'cans': return `Lobs ${Math.max(1, num(m.n, 1) | 0)} empty cans into your bin`;
      case 'change': return `Makes change: takes up to ${Math.round(num(m.v, 12))} of your gold as Armor for the gang`;
      case 'fumble': return 'Lost the beat';
      default: return '';
    }
  }
  api.FAM_KINDS = FAM_KINDS;
  api.famHit = (F, e, m) => famHitV(F, unit(F, e) || e, m || (e && e.intent));
  api.famIn = (F, e, kind) => famIn(F, unit(F, e) || e, kind);
  api.famState = (F) => (F && F.fam ? F.fam : null);
  api.famOf = (e) => famId(e);
  /* ================= /FAMILY ================= */

  /* ================= LEG (round 12): legendary relics ================= */
  // DESIGN.md "Legends (round 12)". A legendary relic (or an evolved aura)
  // may carry a `leg` object; newFight merges every one the fight holds into
  // F.leg (numbers add): golden (every nth grab is a golden grab), peek (see
  // the move after the telegraphed one), noCash (Luck never cashes out:
  // luckAfterGrab), noVolley (the turret skips its turn-end volley: endTurn),
  // hypeK (the player's hits +hypeK per Hype, F.leg.hype, kept by The Crowd's
  // hooks), slay (the Giant Slayer: elites and bosses take more, normals
  // less), glass (the game makes every body glass). A fight without one has
  // F.leg === null and is bit for bit the old one. The hooks set two flags
  // on a played instance that play() honours right after it lands in the
  // used pile: legGo 'void' (Black Hole Bin: gone for the fight) and
  // 'bounce' (Perpetual Motion: back into the cabinet).
  const LEG_SLAY = { up: 0.3, down: 0.2 };
  function legFight(F) {
    let L = null;
    for (const id of setHookIds(F)) {
      const r = relicDef(id), g = r && r.leg;
      if (!g || typeof g !== 'object') continue;
      L = L || { hype: 0, voided: 0, bounced: 0 };
      for (const k in g) L[k] = num(L[k], 0) + num(g[k], 0);
    }
    F.leg = L;
  }
  // The player's hit on an enemy after the Hype and the Giant Slayer.
  function legDmgOut(F, src, tgt, amt) {
    const L = F.leg;
    if (!L || !(amt > 0) || !isPlayer(F, src) || isPlayer(F, tgt) || !tgt) return amt;
    let k = 1;
    if (L.hypeK > 0 && L.hype > 0) k *= 1 + L.hypeK * L.hype;
    if (L.slay > 0) {
      const K = (D().LEG && D().LEG.K) || {}, tier = tgt.def && tgt.def.tier;
      k *= tier === 'elite' || tier === 'boss' ? 1 + num(K.slayUp, LEG_SLAY.up) : 1 - num(K.slayDown, LEG_SLAY.down);
    }
    return k === 1 ? amt : Math.max(1, Math.round(amt * k));
  }
  // play(): a played instance's legGo flag, after it went to the used pile.
  function legAfterPlay(F, inst) {
    const go = inst && inst.legGo;
    if (!go) return;
    delete inst.legGo;
    const at = F.used.indexOf(inst);
    if (go === 'void') {
      // (a Rock already exhausts; anything else junk would cycle back: not any more)
      if (at >= 0) { F.used.splice(at, 1); F.purged.push(inst); }
      if (F.leg) F.leg.voided++;
      emit(F, { t: 'leg', k: 'void', inst, idx: F.target });
    } else if (go === 'bounce' && at >= 0 && F.bin.length < MAX_CABINET) {   // (exhausted or shattered: it stays gone)
      F.used.splice(at, 1);
      F.bin.push(inst);
      if (F.leg) F.leg.bounced++;
      emit(F, { t: 'leg', k: 'bounce', inst });
    }
  }
  // Overclocked Core (and the Gear Grinder's Flywheel): one turret shot now.
  api.legShot = function (F) {
    const c = begin(F);
    if (F && F.tur && F.tur.lv >= 1 && F.phase === 'player') { turretShot(F, 'fire', 0, 1, false); sanitize(F); checkOver(F); }
    return end(F, c);
  };
  // The Golden Claw: is the next grab (idle) or this one (a grab in flight) golden?
  api.legGolden = function (F, inFlight) {
    const k = F && F.leg ? Math.round(num(F.leg.golden, 0)) : 0;
    if (k <= 0 || F.phase !== 'player') return false;
    const g = num(F.stats && F.stats.grabs, 0) | 0;
    return inFlight ? g > 0 && g % k === 0 : (g + 1) % k === 0;
  };
  /* The Monocle: the move after the telegraphed one (pure), or null. A charge
     is followed by its unleash; a cycling enemy by the next step of its
     pattern (a phase two may still change it); a random one is unknown.
     -> {k, v, n, name, txt, unknown} (v: the per-hit number with its Strength now). */
  api.legPeek = function (F, e) {
    e = unit(F, e) || e;
    if (!F || !F.leg || !(F.leg.peek > 0) || !e || !e.alive || !e.def) return null;
    const m = e.intent;
    const hit = (v) => calcHit(num(v, 0), st(e, 'str'), st(e, 'weak') > 0, st(F.player, 'vuln') > 0, st(F.player, 'armor'));
    if (m && m.k === 'charge') return { k: 'attack', v: hit(m.v), n: 1, name: 'Unleash', txt: 'Unleashes ' + hit(m.v), charged: true };
    const moves = (e.def.moves || []).filter(Boolean);
    const ai = e.def.ai || 'cycle';
    if (!moves.length) return { k: 'none', v: 0, n: 1, name: 'Idle', txt: 'Waits' };
    if (ai !== 'cycle') return { k: '?', v: 0, n: 1, name: '???', txt: 'Anything', unknown: true };
    const pat = (Array.isArray(e.def.pattern) && e.def.pattern.length) ? e.def.pattern.filter(p => p >= 0 && p < moves.length) : null;
    const seq = pat && pat.length ? pat : moves.map((x, k) => k);
    const nx = moves[clamp(seq[num(e.cyc, 0) % seq.length] | 0, 0, moves.length - 1)];
    const n = Math.max(1, num(nx.n, 1) | 0);
    const v = nx.k === 'attack' ? hit(nx.v) : Math.round(num(nx.v, 0));
    const txt = nx.k === 'attack' ? 'Attacks ' + v + (n > 1 ? ' x' + n : '') : nx.k === 'charge' ? 'Charges' : nx.k === 'block' ? 'Blocks ' + v : String(nx.name || nx.k);
    return { k: nx.k, v, n, name: nx.name || nx.k, txt };
  };
  api.LEG_SLAY = LEG_SLAY;
  api.legOf = (F) => (F && F.leg ? F.leg : null);
  /* ================= /LEG ================= */

  /* ================= TRD (round 14): an evolved pet's trick ================= */
  // An evolved pet's flourish (DATA.PEV_FORMS[petId].fx) after its trick: a
  // proc badge, then dmg (a random enemy), dmgAll, block, heal or status (ALL
  // enemies). The game calls it once per trick of an evolved pet. -> events
  api.pevTrick = function (F, petId) {
    const c = begin(F);
    const f = (tbl('PEV_FORMS') || {})[petId];
    if (!F || F.phase === 'over' || !f || !f.fx) return end(F, c);
    const x = f.fx, v = Math.max(1, Math.round(num(x.v, 1))), p = F.player;
    emit(F, procEv('pet', 'pev:' + petId, f.name || petId, f.icon || '', f.col || '#ffc94d', String(f.trick || f.name || 'EVOLVED').toUpperCase() + '!', p, F));
    switch (x.k) {
      case 'dmg': { const e = hitTargets(F, 'random')[0]; if (e) api.damage(F, null, e, v); break; }
      case 'dmgAll': for (const e of alive(F)) { if (F.phase === 'over') break; api.damage(F, null, e, v); } break;
      case 'block': gainBlock(F, p, v); break;
      case 'heal': api.heal(F, p, v); break;
      case 'status': alive(F).forEach(e => api.status(F, e, x.s, v)); break;
      default: break;
    }
    if (!Array.isArray(F.pevLog)) F.pevLog = [];
    F.pevLog.push({ pet: petId, k: x.k, v, turn: F.turn });
    sanitize(F);
    checkOver(F);
    return end(F, c);
  };
  /* ================= /TRD ================= */

  /* ================= DEP (round 15): the Neon Depths' monsters and The Drowned Jukebox =================
     DESIGN.md "The Neon Depths (round 15)". Five move kinds (DATA.DEP_KINDS)
     and one boss signature ('tide'), decided here and staged by the game's
     DEP block. Fight state only (never saved; a reload replays the seeded
     fight): F.depLure {by, inst} (the Angler Token's lure over its Old Boot,
     for the player's next turn), F.depShock {v, by} (live water, the next
     turn), inst.depPinch / depPinchT (a prize a Crab Changer pinched, and
     when), inst.depSting (a jelly's sting), inst.depBite / depReal (the
     Sunken Mimic's chests), F.tide {lo, hi, beats, bpm, by, rage} (High
     Tide, the next turn). Nothing here changes a hit of the enemy phase (a
     crab takes its catch only after the enemies have acted, a turn after it
     pinched), so COMBAT.qaIntent / qaThreat stay exact. The claw's own
     troubles (a sting, a shock, a bite) land on the player's turn through
     depSting / depZap / play. Events: {t:'dep', k:'lure' | 'lureOff' |
     'jellies' | 'sting' | 'pinch' | 'unpinch' | 'take' | 'shock' |
     'shockOff' | 'zap' | 'decoy' | 'chest', idx, ...} and the boss's
     {t:'boss', k:'tide' | 'ebb', ...}. */
  const DEP_KINDS = ['lure', 'jellies', 'pinch', 'shock', 'decoy'];
  const depK = () => tbl('DEP_K');
  // A trick's number, scaled with its owner's hits (the Endless lift, Tilt, the Depths' dial).
  const depHit = (e, v) => Math.max(1, Math.round(num(v, 1) * num(e && e.dmgMul, 1)));
  // makeEnemy: a Depths monster hits and lasts a little more than the act 3 pools it stands in for.
  function depMul(def) {
    if (!def || !def.dep) return END_ONE;
    const K = depK();
    return [Math.max(0.1, num(K.hpK, 1)), Math.max(0.1, num(K.dmgK, 1))];
  }
  // What a crab goes for: the rarest, then upgraded, then bin order (pure: the telegraph is the truth).
  const depVal = (i) => num(RAR[itemDef(i.id).rarity], 1) * 10 + (i.plus ? 5 : 0);
  function depPinchPick(F, n) {
    const pool = F.bin.filter(i => !isJunk(i) && !i.frozen && !i.depPinch);
    const ord = pool.map((i, k) => [i, k]).sort((a, b) => depVal(b[0]) - depVal(a[0]) || a[1] - b[1]);
    return ord.slice(0, n).map(x => x[0]);
  }
  // Resolve one Depths move. False for a kind this block does not know.
  function depMove(F, e, m) {
    if (!m || DEP_KINDS.indexOf(m.k) < 0) return false;
    const idx = F.enemies.indexOf(e);
    switch (m.k) {
      case 'lure': {
        const items = bossJunk(F, m.item || 'dep_boot', 1);
        F.depLure = { by: e.uid, inst: items[0] || null };
        emit(F, { t: 'dep', k: 'lure', idx, items, inst: F.depLure.inst });
        text(F, e, 'OOH, A LIGHT');
        break;
      }
      case 'jellies': {
        const n = clamp(Math.round(num(m.n, 2)) + (e.enraged ? 1 : 0), 1, 4);
        const v = depHit(e, m.v || 2);
        const items = bossJunk(F, 'dep_jellyling', n);
        for (const i of items) i.depSting = v;
        emit(F, { t: 'dep', k: 'jellies', idx, items, v });
        text(F, e, items.length ? 'BLOOP' : 'NO ROOM');
        break;
      }
      case 'pinch': {
        const insts = depPinchPick(F, clamp(Math.round(num(m.n, 1)), 1, 3));
        for (const i of insts) { i.depPinch = e.uid; i.depPinchT = F.turn; }
        emit(F, { t: 'dep', k: 'pinch', idx, insts });
        text(F, e, insts.length ? 'SNIP SNIP' : 'NOTHING');
        break;
      }
      case 'shock': {
        F.depShock = { v: depHit(e, m.v || 3), by: e.uid };
        emit(F, { t: 'dep', k: 'shock', idx, v: F.depShock.v });
        text(F, e, 'BZZZT');
        break;
      }
      case 'decoy': {
        const n = clamp(Math.round(num(m.n, 3)) + (e.enraged ? 1 : 0), 1, 5);
        const bite = depHit(e, m.v || 6);
        const items = bossJunk(F, 'dep_chest', n);
        const real = items.length ? items[Math.floor(F.rng() * items.length)] : null;
        for (const i of items) { i.depBite = bite; if (i === real) i.depReal = true; }
        emit(F, { t: 'dep', k: 'decoy', idx, items, v: bite });
        text(F, e, items.length ? 'PICK ONE' : 'NO ROOM');
        break;
      }
      default: break;
    }
    return true;
  }
  // The Drowned Jukebox's High Tide (bossSig): the water rises and falls with the music for the player's next turn.
  function depSig(F, e, s, info, idx) {
    const T = depK().tide || {}, rage = !!e.enraged;
    F.tide = {
      lo: clamp(num(T.lo, 0.14), 0, 0.9), hi: clamp(rage ? num(T.hiRage, 0.74) : num(T.hi, 0.62), 0.05, 0.9),
      beats: Math.max(2, num(T.beats, 8) | 0), bpm: Math.max(30, num(T.bpm, 88) * (rage ? num(T.rageK, 1.5) : 1)), by: e.uid, rage,
    };
    emit(F, { t: 'boss', k: 'tide', idx, name: info.name, lo: F.tide.lo, hi: F.tide.hi, bpm: F.tide.bpm, rage });
  }
  // bossTurnEnd: the player's turn is over: the lure, the live water and the tide go.
  function depTurnEnd(F) {
    if (F.depLure) { F.depLure = null; emit(F, { t: 'dep', k: 'lureOff', idx: -1 }); }
    if (F.depShock) { F.depShock = null; emit(F, { t: 'dep', k: 'shockOff', idx: -1 }); }
    if (F.tide) { F.tide = null; emit(F, { t: 'boss', k: 'ebb', idx: -1 }); }
  }
  // endTurn, after every enemy has acted: a crab takes into its shell what it
  // pinched on an earlier turn and is still in the bin (the belly rules; never
  // below BEST_FLOOR real items, never past a full shell).
  function depPhaseEnd(F) {
    if (!F || F.phase !== 'enemy') return;
    for (const e of F.enemies.slice()) {
      if (!e.alive || !e.def || e.def.dep !== 'crab' || F.phase === 'over') continue;
      const mine = F.bin.filter(i => i.depPinch === e.uid && num(i.depPinchT, F.turn) < F.turn);
      if (!mine.length) continue;
      const took = [];
      for (const inst of mine) {
        delete inst.depPinch; delete inst.depPinchT;
        if (!Array.isArray(e.belly) || e.belly.length + took.length >= BELLY_MAX || playable(F) - took.length <= BEST_FLOOR) continue;
        took.push(inst);
      }
      if (!took.length) continue;
      emit(F, { t: 'dep', k: 'take', idx: F.enemies.indexOf(e), insts: took });
      text(F, e, 'MINE NOW');
      for (const inst of took) { if (!e.alive || F.phase === 'over') break; eat(F, e, inst); }
    }
  }
  // COMBAT.play: the Old Boot snaps the lure off; a chest pays or bites; a delivered prize is no longer pinched.
  function depPlayed(F, inst, def) {
    if (!inst || !def) return;
    if (inst.depPinch) { delete inst.depPinch; delete inst.depPinchT; }
    if (def.dep === 'boot' && F.depLure && F.depLure.inst && (F.depLure.inst === inst || F.depLure.inst.uid === inst.uid)) {
      F.depLure = null;
      emit(F, { t: 'dep', k: 'lureOff', idx: -1, why: 'bait' });
      text(F, F.player, 'LURE LOST');
    }
    if (def.dep !== 'chest' || F.phase !== 'player' || F.player.hp <= 0) return;
    if (inst.depReal) {
      const R = depK().real || {};
      emit(F, { t: 'dep', k: 'chest', idx: -1, inst, real: true });
      text(F, F.player, 'TREASURE!');
      api.gainGold(F, Math.max(1, num(R.gold, 12)));
      gainBlock(F, F.player, Math.max(1, num(R.block, 8)));
    } else {
      const v = Math.max(1, Math.round(num(inst.depBite, 6)));
      emit(F, { t: 'dep', k: 'chest', idx: -1, inst, real: false, v });
      text(F, F.player, 'CHOMP!');
      api.damage(F, null, F.player, v);
    }
  }
  // kill: a crab lets go of what it pinched; the angler's lure, the eel's current and the tide end with their owner.
  function depDeath(F, e) {
    if (!e || !e.def) return;
    if (e.def.dep === 'crab') {
      const insts = [];
      for (const i of F.bin) if (i.depPinch === e.uid) { delete i.depPinch; delete i.depPinchT; insts.push(i); }
      if (insts.length) emit(F, { t: 'dep', k: 'unpinch', idx: F.enemies.indexOf(e), insts });
    }
    if (F.depLure && F.depLure.by === e.uid) { F.depLure = null; emit(F, { t: 'dep', k: 'lureOff', idx: -1 }); }
    if (F.depShock && F.depShock.by === e.uid) { F.depShock = null; emit(F, { t: 'dep', k: 'shockOff', idx: -1 }); }
    if (F.tide && F.tide.by === e.uid) { F.tide = null; emit(F, { t: 'boss', k: 'ebb', idx: -1 }); }
  }
  // intentText for the Depths' tricks ('' for any other kind).
  function depIntent(e, m) {
    const n = Math.max(1, num(m && m.n, 1) | 0);
    switch (m && m.k) {
      case 'lure': return 'Lures your claw toward junk';
      case 'jellies': return `Drifts ${n} stinging jellies into your bin`;
      case 'pinch': return n > 1 ? `Pinches your ${n} best items` : 'Pinches your best item';
      case 'shock': return `Electrifies the water (${depHit(e, m.v || 3)} per wet prize)`;
      case 'decoy': return `Scatters ${n} chests (one holds treasure)`;
      default: return '';
    }
  }
  // The claw touched a jelly (the game calls it once a grab per jelly): it stings through Block. -> events
  api.depSting = function (F, inst) {
    const c = begin(F);
    if (!F || F.phase !== 'player' || !inst || F.player.hp <= 0) return end(F, c);
    const v = Math.max(1, Math.round(num(inst.depSting, 2)));
    emit(F, { t: 'dep', k: 'sting', idx: -1, inst, v });
    text(F, F.player, 'STUNG!');
    api.damage(F, null, F.player, v);
    sanitize(F);
    checkOver(F);
    return end(F, c);
  };
  // A wet prize was delivered while the water is live: a shock through Block. -> events
  api.depZap = function (F, inst) {
    const c = begin(F);
    if (!F || F.phase !== 'player' || !F.depShock || F.player.hp <= 0) return end(F, c);
    const v = Math.max(1, Math.round(num(F.depShock.v, 3)));
    emit(F, { t: 'dep', k: 'zap', idx: -1, inst: inst || null, v });
    text(F, F.player, 'ZAP!');
    api.damage(F, null, F.player, v);
    sanitize(F);
    checkOver(F);
    return end(F, c);
  };
  // The claw lifted a pinched prize clear: the crab lets go of it. -> bool
  api.depUnpinch = function (F, inst) {
    if (!F || !inst || !inst.depPinch) return false;
    delete inst.depPinch; delete inst.depPinchT;
    emit(F, { t: 'dep', k: 'unpinch', idx: -1, insts: [inst] });
    return true;
  };
  api.depPinched = (F) => (F ? F.bin.filter(i => !!i.depPinch) : []);
  api.depPinchPick = (F, n) => (F ? depPinchPick(F, Math.max(1, n | 0)) : []);
  api.depOf = (F) => (F ? { lure: F.depLure || null, shock: F.depShock || null, tide: F.tide || null } : null);
  api.DEP_KINDS = DEP_KINDS;
  /* ================= /DEP ================= */

  /* ================= TECH (round 17: Cabinet Tech, DESIGN.md "Cabinet Tech and the new crawler (round 17)") =================
     The cabinet's round 16 systems (events, the Jackpot Lamp, PERFECT grabs) live in the game;
     here is what the relics see of them. F.tech = {on: the cabinet is live (the game says so at
     the bell; a quiet cabinet, as in Duo or a headless suite, has no events), gift: Joy Stick's,
     perf: this grab's PERFECT streak (0 if none; combos read it), events, perfects, fevers}.
     The game calls techCab on the player's own turn only; every relic answer goes through the
     `onCab` hook, so the proc labels, Block and damage play like any relic's. */
  function techFight(F, run) {
    const cd = run && run.char ? (tbl('CHARACTERS')[run.char] || null) : null;
    F.tech = { on: false, gift: !!(cd && cd.tech), perf: 0, events: 0, perfects: 0, fevers: 0 };
  }
  // The game: the cabinet is live (or quiet) for this fight. -> F.tech
  api.techOn = function (F, on) { if (F && F.tech) F.tech.on = !!on; return F ? F.tech || null : null; };
  // The cabinet did something on the player's turn: kind 'event' (id), 'perfect' (v: the streak),
  // 'fever' (v: fevers this fight), 'double' (id: the second event). -> events
  api.techCab = function (F, kind, v, id) {
    const c = begin(F);
    if (!F || !F.tech || F.phase !== 'player' || F.player.hp <= 0 || !kind) return end(F, c);
    const T = F.tech, n = Math.max(0, num(v, 0) | 0);
    if (kind === 'perfect') { T.perf = Math.max(1, n); T.perfects++; }
    else if (kind === 'event') T.events++;
    else if (kind === 'fever') T.fevers++;
    emit(F, { t: 'tech', k: kind, n: kind === 'perfect' ? T.perf : n, id: id || null, idx: -1 });
    hook(F, 'onCab', kind, kind === 'perfect' ? T.perf : n, id || null);
    sanitize(F);
    checkOver(F);
    return end(F, c);
  };
  api.techOf = (F) => (F ? F.tech || null : null);
  /* ================= /TECH ================= */

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
