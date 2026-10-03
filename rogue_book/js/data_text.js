// Inkwoven -- text generation and card resolution. An extension of DATA (one IIFE, no top-level names).
//
// Everything the player reads about rules is produced here from the ops themselves, so numbers can never drift from
// behaviour. All functions are pure, DOM-free and deterministic. HTML output uses only two kinds of markup:
//   <span class="kw" data-kw="block">Block</span>   a keyword; data-kw is a key of DATA.keywords OR DATA.statuses
//                                                   (UI.tip.kw resolves both)
//   <span class="num up">9</span>                   a number; class "up" (higher) or "down" (lower) when the number is
//                                                   not the printed base value: see "Up and down" below
//
// PUBLIC API (all added to DATA)
//   DATA.resolveCard(inst | id, ctx?)  -> resolved card, THE single source of truth for name, cost, keywords, slots, ops
//        { inst, def, id, name ("Petal Slash+" when upgraded), cost (number | 'X' | null for unplayable junk), costX:bool,
//          type, rarity, kw:[..], slots:[colour], gems:[gemId|null] (as long as slots), fx:[ops], hero, up:bool,
//          playableType:'attack'|'skill'|'power'|null, art,
//          gemActive:[bool]      per slot: true when that gem changes the card (false = shown grey, no effect: empty slot, colour
//                                mismatch, nothing to apply to, or a row-gated gem that is not active)
//          gemNotes:[{slot, gem, cond}]   row-gated gems that are NOT merged (no ctx.unit, or the unit is in the other row)
//          base:{fx, cost, kw}   the printed definition (no upgrade, no gems), used for up/down colouring }
//        Upgrade: up.fx replaces fx, up.cost replaces cost, up.kw REPLACES kw. Gems (DESIGN 4.6): dmg/block/heal +N add
//        `plus: N` to EVERY matching op (through cond and repeat, not into hook fx), hits +N adds `hitsPlus` to the first top-level
//        dmg op, cost is a signed delta (tier 3, ignored on X and 0 cost, min 0), draw/energy/status/poison/fx are APPENDED in
//        slot order (in that order per gem), kw adds and kwRemove removes keywords. A gem is skipped when its colour does not
//        match its slot (a prism 'any' slot takes everything). A gem with mod.cond is merged only when ctx.unit.row equals it.
//        Resolved ops may therefore carry `plus` and `hitsPlus` (numbers, added AFTER the V is evaluated and clamped >= 0):
//        anything that executes or prints ops must honour them. ctx = { unit?: hero unit (needs .row) }. The returned arrays and
//        ops may be shared with the definition: never mutate them.
//   DATA.cardHtml(inst | id, ctx?)     rules text as HTML. ctx = { unit (a combat hero unit: live Might, Weak, Bulwark, Frail and
//                                      row numbers), C (combat: relic ids for row bonuses) }; no ctx prints the card's own numbers.
//        Up and down: without ctx a number is "up" when it is above the same number on the printed (un-upgraded, un-gemmed)
//        card and "down" when below. With ctx.unit the printed number is the LIVE number (Might, row damage, Bulwark, Frail,
//        Weak included), "up" or "down" versus the number without live modifiers, or, when those are equal, versus the
//        printed card. Target-specific effects (Vulnerable, Mark) are C.preview's business, not the card text.
//   DATA.cardPlain(inst | id, ctx?)    the same text without markup (tests, aria labels)
//   DATA.opsText(ops, ctx?)            plain text for an op list (card, hook, hand, gem and run ops). The move, start, phase and hook fx
//                                      arrays of registered ENEMIES are recognised by identity and read from the enemy's side
//                                      ("Deal 5 damage and apply 1 Vulnerable to the front hero."), so the bestiary needs no flag;
//                                      ctx.enemy forces the enemy side for any other list.
//   DATA.moveText(move)                the bestiary sentence for one enemy move (opsText of its fx with the enemy side forced)
//   DATA.hookText(hook, ctx?)          plain sentence for one hook {on, fx, filter?, limit?, once?, every?}; run hooks and enemy hooks too.
//                                      A hook inside a CARD (an owned hook) says "you" for its own hero and "either hero" when
//                                      filter.hero is 'any'; a relic or passive (a party hook) keeps the plain "you".
//   DATA.gemText(gemId | def)          plain text of a gem mod ("+2 damage", "Front row: +1 hit, draw 1 card"); def.text wins
//   DATA.relicText(id | def)           the relic's own hand written text
//   DATA.statusText(id, n?)            "Poison 4: At the start of its turn, lose 4 HP (ignores Block), then Poison falls by 1."
//   DATA.intentText(intent)            "Deals 7 x2 to the front hero and applies 2 Weak" from a C.intent object. The intent carries who gets each
//                                      effect (statuses[].to, blockTo, healTo, removes[].to), so the sentence says "Gives all enemies 8 Block".
//                                      An older intent object that reports help for other enemies as help for itself is still read right: the
//                                      move is looked up by id and name and every enemy move of that name must agree.
//   DATA.rowText(heroId, row)          "Front: +2 damage on attacks"
//   DATA.targetMode(inst | id | resolved) -> 'enemy' | 'none'   whether the player must choose an enemy (DESIGN 4.3)
//   DATA.cardOps(resolved | inst | id) -> flat list of every op (through cond, repeat and hook fx)
//
// Writing rules of thumb (so card text stays under the 110 character audit): sentences are short and merged where it reads
// well ("Apply 2 Vulnerable and 1 Weak." "Deal 4 damage 3 times."), a conditional bonus after a same-kind op reads "Front:
// deal 3 more damage.", leading keywords (Innate, Retain, Ethereal, Unplayable) come first and Exhaust comes last.
// A hook op reads "Whenever you play a Skill, gain 1 Sumi." / "At the start of your turn, ..." / "Next turn: gain 2 Energy."
//
// Editor's rules (what the generator does so a card never has to): gains of different kinds share a sentence ("Gain 5 Block and 1
// Taunt."); a status taken back by a once-hook reads "until the end of this turn" or "until your next turn"; a swap that only happens
// from one row reads "Move to the front row."; row bonuses after a swap read "Now Front:"; "Spend up to 3 Sumi. Deal 4 damage to all
// enemies, plus 2 for each Sumi spent." keeps the target next to "damage"; doubling reads "Double the target's Poison (adds at most
// 10)."; Curse and Status cards are acted by the front hero ("The front hero loses 2 HP."); a "If you have Sumi" line on another
// hero's card is not printed (a hero never holds another hero's resource); numbers inside a hook are never given the hero's row,
// Might or Weak, because hook damage has no attacker (DESIGN 4.2).
(() => {
  const D = DATA;
  const ST = D.statuses;
  const esc = U.esc;

  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const list = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
  const fl = (x) => Math.floor(x + 1e-9);
  const stName = (s) => (ST[s] ? ST[s].name : String(s));
  const HERO_NAME = (id) => (D.heroes[id] ? D.heroes[id].name : String(id));

  // ------------------------------------------------------------------------------------------------
  // Card resolution
  // ------------------------------------------------------------------------------------------------
  const ENEMY_TGTS = ['enemy', 'all', 'random', 'lowest', 'others'];

  // The target an op is aimed at once defaults are applied (DESIGN 4.4), or null for ops with no target notion.
  function resolvedTgt(o) {
    if (o.op === 'dmg') return o.tgt || 'enemy';
    if (o.op === 'status') return o.tgt || (D.isDebuff(o.s) ? 'enemy' : 'self');
    if (o.op === 'removeStatus') return o.tgt || ((o.s === 'debuffs' || D.isDebuff(o.s)) ? 'self' : (o.s === 'buffs' || D.isBuff(o.s)) ? 'enemy' : 'self');
    return null;
  }

  // The card's enemy target for a gem's `poison N`: the first op aimed at enemies ("others" needs a chosen enemy, so it reads as enemy).
  function enemyTargetOf(fx) {
    let found = null;
    D.walkOps(fx, (o) => {
      if (found) return;
      const t = resolvedTgt(o);
      if (t && ENEMY_TGTS.indexOf(t) >= 0) found = t === 'others' ? 'enemy' : t;
    });
    return found;
  }

  function eachOfKind(ops, kind, fn) {
    list(ops).forEach((o) => {
      if (!o || typeof o !== 'object') return;
      if (o.op === kind) fn(o);
      if (o.op === 'cond') { eachOfKind(o.then, kind, fn); eachOfKind(o.else, kind, fn); }
      if (o.op === 'repeat') eachOfKind(o.do, kind, fn);
    });
  }
  const hasOfKind = (ops, kind) => { let f = false; eachOfKind(ops, kind, () => { f = true; }); return f; };

  function applyGems(fx0, cost0, kw0, slots, gems, ctx, active, notes) {
    let fx = fx0, cost = cost0;
    const kw = kw0;
    let cloned = false;
    const own = () => { if (!cloned) { fx = U.deepCopy(fx); cloned = true; } };
    const usable = [];
    gems.forEach((gid, i) => {
      if (!gid) return;
      const g = D.gems[gid];
      if (!g || !g.mod) return;
      const slot = slots[i];
      if (slot !== 'any' && slot !== g.color) return;
      if (g.mod.cond && !(ctx && ctx.unit && ctx.unit.row === g.mod.cond)) { notes.push({ slot: i, gem: gid, cond: g.mod.cond }); return; }
      usable.push({ i, mod: g.mod, hit: false });
    });
    if (!usable.length) return { fx, cost, kw };
    // phase 1, in slot order: appended ops, keywords, cost
    usable.forEach((u) => {
      const m = u.mod;
      const add = [];
      if (m.draw) add.push({ op: 'draw', n: m.draw });
      if (m.energy) add.push({ op: 'energy', n: m.energy });
      if (m.status) add.push(Object.assign({ op: 'status' }, m.status));
      if (m.poison) { const tg = enemyTargetOf(fx); if (tg) add.push({ op: 'status', s: 'poison', n: m.poison, tgt: tg }); }
      if (m.fx) m.fx.forEach((o) => add.push(U.deepCopy(o)));
      if (add.length) { own(); fx = fx.concat(add); u.hit = true; }
      list(m.kw).forEach((k) => { if (kw.indexOf(k) < 0) { kw.push(k); u.hit = true; } });
      list(m.kwRemove).forEach((k) => { const j = kw.indexOf(k); if (j >= 0) { kw.splice(j, 1); u.hit = true; } });
      if (m.cost && cost !== 'X' && isNum(cost) && cost > 0) { const nc = Math.max(0, cost + m.cost); if (nc !== cost) { cost = nc; u.hit = true; } }
    });
    // phase 2: flat mods apply to every matching op, appended ones included
    ['dmg', 'block', 'heal'].forEach((k) => {
      const who = usable.filter((u) => u.mod[k]);
      if (!who.length || !hasOfKind(fx, k)) return;
      own();
      const total = who.reduce((s, u) => s + u.mod[k], 0);
      eachOfKind(fx, k, (o) => { o.plus = (o.plus || 0) + total; });
      who.forEach((u) => { u.hit = true; });
    });
    const hitGems = usable.filter((u) => u.mod.hits);
    if (hitGems.length && fx.some((o) => o && o.op === 'dmg')) {
      own();
      const first = fx.find((o) => o && o.op === 'dmg');
      first.hitsPlus = (first.hitsPlus || 0) + hitGems.reduce((s, u) => s + u.mod.hits, 0);
      hitGems.forEach((u) => { u.hit = true; });
    }
    usable.forEach((u) => { active[u.i] = u.hit; });
    return { fx, cost, kw };
  }

  function resolveCard(x, ctx) {
    const inst = typeof x === 'string' ? { id: x, up: 0, gems: [] } : (x || {});
    const def = D.cards[inst.id];
    if (!def) {
      return { inst, def: null, id: inst.id, name: String(inst.id), cost: null, costX: false, type: 'skill', rarity: 'token', kw: [], slots: [], gems: [], fx: [], hero: null, up: false, playableType: null, art: { m: 'void' }, gemActive: [], gemNotes: [], base: { fx: [], cost: null, kw: [] } };
    }
    const upgraded = !!inst.up && !!def.up;
    const upDef = upgraded ? def.up : null;
    let fx = upDef && upDef.fx ? upDef.fx : (def.fx || []);
    let cost = upDef && upDef.cost !== undefined ? upDef.cost : def.cost;
    let kw = (upDef && upDef.kw !== undefined ? upDef.kw : (def.kw || [])).slice();
    const slots = (def.slots || []).slice();
    const gems = slots.map((_, i) => (inst.gems && inst.gems[i]) || null);
    const gemActive = gems.map(() => false);
    const gemNotes = [];
    if (gems.some(Boolean)) {
      const r = applyGems(fx, cost, kw, slots, gems, ctx, gemActive, gemNotes);
      fx = r.fx; cost = r.cost; kw = r.kw;
    }
    const type = def.type;
    return {
      inst, def, id: def.id, name: def.name + (upgraded ? '+' : ''), cost: cost === undefined ? null : cost, costX: cost === 'X', type, rarity: def.rarity, kw, slots, gems,
      fx, hero: def.hero, up: upgraded, playableType: type === 'attack' || type === 'skill' || type === 'power' ? type : null, art: def.art,
      gemActive, gemNotes, base: { fx: def.fx || [], cost: def.cost === undefined ? null : def.cost, kw: def.kw || [] },
    };
  }

  const isResolved = (x) => !!x && typeof x === 'object' && !!x.inst && Array.isArray(x.fx) && 'gemActive' in x;
  const asResolved = (x, ctx) => (isResolved(x) ? x : resolveCard(x, ctx));

  // ---- target mode ----
  function vNeedsTarget(v) {
    if (!isObj(v)) return false;
    return v.who === 'target' || v.who === 'enemy' || v.per === 'targetBlock';
  }
  function condNeedsTarget(c) {
    if (!isObj(c)) return false;
    if (c.targetStatus) return true;
    if (c.status && (c.status.who === 'target' || c.status.who === 'enemy')) return true;
    if (c.hpPct && (c.hpPct.who === 'target' || c.hpPct.who === 'enemy')) return true;
    return false;
  }
  function needsEnemy(fx) {
    let need = false;
    D.walkOps(fx, (o) => {
      if (need || o.op === 'pick') return;
      const t = resolvedTgt(o);
      if (t === 'enemy' || t === 'others') need = true;
      if (vNeedsTarget(o.n) || vNeedsTarget(o.hits) || (isObj(o.consume) && vNeedsTarget(o.consume.upTo))) need = true;
      if (o.op === 'cond' && condNeedsTarget(o.if)) need = true;
    });
    return need;
  }
  function targetMode(x) { return needsEnemy(asResolved(x).fx) ? 'enemy' : 'none'; }
  function cardOps(x) { const out = []; D.walkOps(asResolved(x).fx, (o) => out.push(o)); return out; }

  // ------------------------------------------------------------------------------------------------
  // Text: markup helpers
  // ------------------------------------------------------------------------------------------------
  const KW = (word, key) => `<span class="kw" data-kw="${key}">${word}</span>`;
  const KS = (s) => KW(stName(s), s);
  const NUM = (v, cls) => `<span class="num${cls ? ' ' + cls : ''}">${v}</span>`;
  const capHtml = (h) => h.replace(/^((?:<[^>]*>)*)([a-z])/, (m, tags, c) => tags + c.toUpperCase());
  const plainOf = (h) => h.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  const sentence = (h) => { const c = capHtml(h.trim()); return /[.!?]$/.test(plainOf(c)) ? c : c + '.'; };
  const joinAnd = (items) => (items.length <= 1 ? (items[0] || '') : items.length === 2 ? `${items[0]} and ${items[1]}` : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
  const aAn = (word) => (/^(<[^>]*>)*[aeiouAEIOU]/.test(word) ? 'an' : 'a');
  const KW_BLOCK = () => KW('Block', 'block');
  const KW_EXHAUST = () => KW('Exhaust', 'exhaust');
  const ROWKW = { front: () => KW('Front', 'front'), back: () => KW('Back', 'back') };
  const ordinal = (n) => (n % 100 >= 11 && n % 100 <= 13 ? n + 'th' : n % 10 === 1 ? n + 'st' : n % 10 === 2 ? n + 'nd' : n % 10 === 3 ? n + 'rd' : n + 'th');

  const clsOf = (shown, resolved, ref) => {
    if (shown > resolved) return 'up';
    if (shown < resolved) return 'down';
    if (ref === undefined || ref === null) return '';
    return resolved > ref ? 'up' : resolved < ref ? 'down' : '';
  };
  // the constant a V prints: a plain number, else the multiplier (or the base when there is no multiplier)
  const vKey = (v) => (isNum(v) ? v : isObj(v) ? (v.mul !== undefined ? v.mul : (v.base || 0)) : 0);

  // reference numbers: align the resolved ops with the printed card's ops, k-th op of a kind with k-th op of that kind
  function buildRef(res) {
    const map = new Map();
    if (!res.def) return map;
    const flat = (fx) => { const o = []; D.walkOps(fx, (x) => o.push(x)); return o; };
    const cur = flat(res.fx), base = flat(res.base.fx);
    const by = {};
    base.forEach((o) => { (by[o.op] = by[o.op] || []).push(o); });
    const seen = {};
    cur.forEach((o) => {
      const i = seen[o.op] === undefined ? 0 : seen[o.op] + 1;
      seen[o.op] = i;
      const b = by[o.op] && by[o.op][i];
      const compat = b && (o.op !== 'status' || b.s === o.s) && (o.op !== 'removeStatus' || b.s === o.s) && (o.op !== 'add' || b.card === o.card);
      map.set(o, compat ? b : null);
    });
    return map;
  }

  // live numbers for a combat hero unit (ctx.unit). `hook` is the same thing for the ops inside a hook: hook damage has no attacker
  // (no Might, row bonus or Weak) and hook Block gets no row bonus, only Bulwark and Frail (DESIGN 4.2).
  function liveFns(ctx) {
    if (!ctx || !ctx.unit || !ctx.unit.st) return {};
    const u = ctx.unit;
    const relics = (ctx.C && ctx.C.relics) || ctx.relics || [];
    const row = D.rowFor(u.id, u.row, relics);
    const blk = (rowAdd) => (n) => Math.max(0, fl((n + (u.st.bulwark || 0) + rowAdd) * ((u.st.frail || 0) > 0 ? 0.75 : 1)));
    return {
      dmg: (n) => { let r = Math.max(0, n + (row.dmgAdd || 0) + (u.st.might || 0)); if ((u.st.weak || 0) > 0) r = fl(r * 0.75); return r; },
      block: blk(row.blockAdd || 0),
      hook: { block: blk(0) },
    };
  }

  // ------------------------------------------------------------------------------------------------
  // Text: value expressions
  // ------------------------------------------------------------------------------------------------
  // Enemy ops (a move's fx, an enemy hook) read from the enemy's side: `self` is the enemy, `target` the hero it is hitting.
  // The flag is module state set by withEnemy(), because perInfo and the helpers below are called from deep inside amt().
  let enemyMode = false;
  const withEnemy = (on, fn) => { const prev = enemyMode; enemyMode = on; try { return fn(); } finally { enemyMode = prev; } };
  const isTarget = (w) => w === 'target' || w === 'enemy';
  const whoPos = (w) => (enemyMode ? (w === 'self' || w === undefined ? 'its' : "the hero's") : w === 'ally' ? "your ally's" : isTarget(w) ? "the target's" : 'your');
  const whoHas = (w) => (enemyMode ? (w === 'self' || w === undefined ? 'it has' : 'the hero has') : w === 'ally' ? 'your ally has' : isTarget(w) ? 'the target has' : 'you have');
  const whoIs = (w) => (enemyMode ? (w === 'self' || w === undefined ? 'it is' : 'the hero is') : w === 'ally' ? 'your ally is' : isTarget(w) ? 'the target is' : 'you are');

  function perInfo(v) {
    const w = v.who;
    switch (v.per) {
      case 'X': return { eq: KW('X', 'xcost'), unit: 'Energy spent' };
      case 'handSize': return { eq: 'the number of cards in your hand', unit: 'card in your hand' };
      case 'drawPile': return { eq: 'the number of cards in your draw pile', unit: 'card in your draw pile' };
      case 'discardPile': return { eq: 'the number of cards in your discard pile', unit: 'card in your discard pile' };
      case 'exhaustPile': return { eq: `the number of cards in your ${KW_EXHAUST()} pile`, unit: `card in your ${KW_EXHAUST()} pile` };
      // the engine reads these BEFORE the card being played counts, so they are "earlier" plays
      case 'cardsPlayed': return { eq: 'the number of cards you played earlier this turn', unit: 'card played earlier this turn' };
      case 'attacksPlayed': return { eq: 'the number of Attacks you played earlier this turn', unit: 'Attack played earlier this turn' };
      case 'skillsPlayed': return { eq: 'the number of Skills you played earlier this turn', unit: 'Skill played earlier this turn' };
      case 'energy': return { eq: 'your remaining Energy', unit: 'Energy you have left' };
      case 'block': return { eq: `${whoPos(w)} ${KW_BLOCK()}`, unit: `${KW_BLOCK()} ${whoHas(w)}` };
      case 'hp': return { eq: `${whoPos(w)} current HP`, unit: `HP ${whoHas(w)}` };
      case 'missingHp': return { eq: `${whoPos(w)} missing HP`, unit: `HP ${whoIs(w)} missing` };
      case 'status': return { eq: `${whoPos(w)} ${KS(v.s)}`, unit: `${KS(v.s)} ${whoHas(w)}` };
      case 'debuffs': { const t = enemyMode ? (w === 'self' ? 'it' : 'the hero') : w === 'self' ? 'you' : w === 'ally' ? 'your ally' : 'the target'; return { eq: `the number of debuffs on ${t}`, unit: `debuff on ${t}` }; }
      case 'enemies': return enemyMode ? { eq: 'the number of enemies still standing', unit: 'enemy still standing' } : { eq: 'the number of living enemies', unit: 'living enemy' };
      case 'kills': return { eq: 'the number of enemies defeated this combat', unit: 'enemy defeated this combat' };
      case 'turn': return enemyMode ? { eq: 'its turn count', unit: 'turn it has had' } : { eq: 'the turn number', unit: 'turn of this combat' };
      case 'gems': return { eq: 'the number of gems in this card', unit: 'gem in this card' };
      case 'damageTaken': return { eq: 'the damage you took last enemy turn', unit: 'damage you took last enemy turn' };
      case 'hitsTaken': return { eq: 'the number of hits you took last enemy turn', unit: 'hit you took last enemy turn' };
      case 'targetBlock': return { eq: `the target's ${KW_BLOCK()}`, unit: `${KW_BLOCK()} on the target` };
      case 'picked': return { eq: 'the number of cards chosen', unit: 'card chosen' };
      default: return { eq: 'something', unit: 'something' };
    }
  }
  const capSuffix = (v) => `${v.upTo !== undefined ? ` (up to ${NUM(v.upTo)})` : ''}${v.cap !== undefined ? ` (max ${NUM(v.cap)})` : ''}`;

  // "6 damage" | "damage equal to your Block" | "3 damage for each Bloom you have". noun may be ''.
  // o.mid is text that belongs right after the noun (a target, a hit count): the "plus" and "for each" forms put it there, so
  // "Deal 4 damage to all enemies, plus 2 for each Sumi spent." never hangs the target on the tail; the plain and "equal to"
  // forms leave it to the caller (o.out.mid reports whether it was used).
  function frac(mul) {
    // 0.5 reads "1 for every 2", 0.25 "1 for every 4", 0.75 "3 for every 4": a player never sees a decimal
    for (const d of [2, 3, 4, 5, 6, 8, 10]) { const n = Math.round(mul * d); if (Math.abs(n / d - mul) < 1e-9) return { n, d }; }
    return { n: Math.round(mul * 100), d: 100 };
  }
  function amt(v, noun, o) {
    o = o || {};
    if (v === undefined || v === null) v = 0;
    if (isObj(v) && v.per === undefined) v = v.base || 0;
    if (isNum(v)) {
      const resolved = v + (o.plus || 0);
      const shown = o.live ? o.live(resolved) : resolved;
      return `${NUM(shown, clsOf(shown, resolved, o.ref))}${noun ? ' ' + noun : ''}`;
    }
    const base = v.base || 0, mul = v.mul === undefined ? 1 : v.mul;
    const rv = o.refV;
    const rb = isObj(rv) ? (rv.base || 0) : isNum(rv) ? rv : undefined;
    const rm = isObj(rv) ? (rv.mul === undefined ? 1 : rv.mul) : undefined;
    const NB = (x) => NUM(x, rb === undefined ? '' : clsOf(x, x, rb));
    const NM = (x) => NUM(x, rm === undefined ? '' : clsOf(x, x, rm));
    const plus = o.plus ? `, plus ${NUM(o.plus, 'up')}` : '';
    const n = noun || 'an amount';
    const take = () => { if (o.out) o.out.mid = true; return o.mid || ''; };
    const eachUnit = (info) => (Number.isInteger(mul) ? `for each ${info.unit}` : `for every ${NUM(frac(mul).d)} ${info.plural || info.unit}`);
    const mulNum = () => (Number.isInteger(mul) ? NM(mul) : NUM(frac(mul).n));
    if (v.per === 'front') {
      if (base === 0) return `${NUM(mul)} ${n} while in the ${ROWKW.front()} row${plus}`;
      return `${NB(base)} ${n} (${NUM(base + mul)} in the ${ROWKW.front()} row)${plus}`;
    }
    const info = perInfo(v);
    const cap = capSuffix(v);
    if (o.spent) {
      // the "Spend N Foo." sentence came first: name the count instead of restating it
      if (base === 0) return mul === 1 ? `${n} equal to the ${KS(v.s)} spent${plus}` : `${NM(mul)} ${n}${take()} for each ${KS(v.s)} spent${plus}`;
      return `${NB(base)} ${n}${take()}, plus ${NM(mul)} for each ${KS(v.s)} spent${plus}`;
    }
    if (v.per === 'picked' && mul === 1) return base === 0 ? `${NUM(1)} ${n}${take()} for each card chosen${plus}` : `${NUM(base)} ${n}${take()}, plus ${NUM(1)} for each card chosen${plus}`;
    if (mul === 1 && base === 0) return `${n} equal to ${info.eq}${cap}${plus}`;
    // a counted thing with a count limit and no total cap reads "5 damage, plus 1 for each Charge you have (up to 3)"
    if (mul === 1 && v.upTo !== undefined && v.cap === undefined) return `${NB(base)} ${n}${take()}, plus ${NUM(1)} for each ${info.unit}${cap}${plus}`;
    if (mul === 1) return `${n} equal to ${NB(base)} plus ${info.eq}${cap}${plus}`;
    if (base === 0) return `${mulNum()} ${n}${take()} ${eachUnit(info)}${cap}${plus}`;
    return `${NB(base)} ${n}${take()}, plus ${mulNum()} ${eachUnit(info)}${cap}${plus}`;
  }

  // "3 times" | "X times" | "for each card in your hand"
  function timesPhrase(v, o) {
    o = o || {};
    if (v === undefined || v === null) v = 1;
    if (isObj(v) && v.per === undefined) v = v.base || 0;
    if (isNum(v)) {
      const shown = v + (o.plus || 0);
      return `${NUM(shown, clsOf(shown, shown, o.ref))} times`;
    }
    if (v.per === 'X' && (v.mul === undefined || v.mul === 1) && !v.base) return `${KW('X', 'xcost')} times`;
    if (v.per === 'front') return `${NUM(1 + (v.base || 0))} times (${NUM((v.base || 0) + (v.mul || 1) + 1)} in the ${ROWKW.front()} row)`;
    if (o.spent && v.per === 'status') return `for each ${KS(v.s)} spent`;
    return `for each ${perInfo(v).unit}${capSuffix(v)}`;
  }

  // ------------------------------------------------------------------------------------------------
  // Text: target phrases
  // ------------------------------------------------------------------------------------------------
  function enemySuffix(tgt, S) {
    if (tgt === 'all') return ' to all enemies';
    if (tgt === 'random') return ' to a random enemy';
    if (tgt === 'lowest') return ' to the enemy with the lowest HP';
    if (tgt === 'others') return ' to all other enemies';
    if (S.hookOn) return S.hookOn === 'onDamaged' ? ' to the attacker' : S.hookOn === 'onPlay' ? ' to the same target' : ' to a random enemy';
    return '';
  }
  function enemyObj(tgt, S) {
    if (tgt === 'all') return 'all enemies';
    if (tgt === 'random') return 'a random enemy';
    if (tgt === 'lowest') return 'the enemy with the lowest HP';
    if (tgt === 'others') return 'all other enemies';
    if (S.hookOn) return S.hookOn === 'onDamaged' ? 'the attacker' : S.hookOn === 'onPlay' ? 'the same target' : 'a random enemy';
    return 'the enemy';
  }
  // Curse and Status cards are acted by the FRONT hero (DESIGN 4.4): for them `self` reads "the front hero"
  let junkMode = false;
  const selfT = (t) => (junkMode && (t === 'self' || t === undefined) ? 'front' : t);
  const GAIN = (t, obj) => { t = selfT(t); return t === 'ally' ? `give your ally ${obj}` : t === 'both' ? `both heroes gain ${obj}` : t === 'front' ? `the front hero gains ${obj}` : t === 'back' ? `the back hero gains ${obj}` : `gain ${obj}`; };
  const LOSE = (t, obj) => { t = selfT(t); return t === 'ally' ? `your ally loses ${obj}` : t === 'both' ? `both heroes lose ${obj}` : t === 'front' ? `the front hero loses ${obj}` : t === 'back' ? `the back hero loses ${obj}` : `lose ${obj}`; };
  const HEAL = (t, obj) => { t = selfT(t); return t === 'ally' ? `heal your ally for ${obj}` : t === 'both' ? `heal both heroes for ${obj}` : t === 'front' ? `heal the front hero for ${obj}` : t === 'back' ? `heal the back hero for ${obj}` : `heal ${obj}`; };
  const HERO_FROM = (t) => { t = selfT(t); return t === 'ally' ? 'your ally' : t === 'both' ? 'both heroes' : t === 'front' ? 'the front hero' : t === 'back' ? 'the back hero' : 'you'; };
  const isEnemyTgt = (t) => ENEMY_TGTS.indexOf(t) >= 0;

  // ------------------------------------------------------------------------------------------------
  // Text: conditions
  // ------------------------------------------------------------------------------------------------
  function cmpPhrase(c, subject, verbHave, thing, o) {
    // subject "you", verbHave "have", thing "Bloom" (html), o {none:'no Bloom', unit}
    const n = (v) => NUM(v);
    if (c.lte !== undefined && c.gte === undefined) return c.lte === 0 ? `${subject} ${verbHave} no ${thing}` : `${subject} ${verbHave} at most ${n(c.lte)} ${thing}`;
    if (c.gte !== undefined && c.lte === undefined) return c.gte <= 1 && !o.strictN ? `${subject} ${verbHave} ${o.one || thing}` : `${subject} ${verbHave} at least ${n(c.gte)} ${thing}`;
    if (c.gte !== undefined && c.lte !== undefined) return `${subject} ${verbHave} ${n(c.gte)} to ${n(c.lte)} ${thing}`;
    return `${subject} ${verbHave} ${o.one || thing}`;
  }
  function condPhrases(c, S) {
    const out = [];
    const subj = (w) => (w === 'ally' ? 'your ally' : (w === 'target' || w === 'enemy') ? 'the target' : 'you');
    const have = (w) => (w === 'ally' || w === 'target' || w === 'enemy' ? 'has' : 'have');
    const be = (w) => (w === 'ally' || w === 'target' || w === 'enemy' ? 'is' : 'are');
    const pct = (v) => Math.round(v * 100);
    if (c.row) out.push(`you are ${S && S.swapped ? 'now ' : ''}in the ${KW(c.row === 'front' ? 'front' : 'back', c.row)} row`);
    if (c.status) { const s = c.status; out.push(cmpPhrase(s, subj(s.who), have(s.who), KS(s.s), {})); }
    if (c.hpPct) {
      const h = c.hpPct;
      if (h.lt !== undefined) out.push(`${subj(h.who)} ${be(h.who)} below ${NUM(pct(h.lt))}% HP`);
      if (h.gt !== undefined) out.push(`${subj(h.who)} ${be(h.who)} above ${NUM(pct(h.gt))}% HP`);
    }
    if (c.handEmpty) out.push('your hand is empty');
    if (c.cardsPlayed) {
      const p = c.cardsPlayed;
      if (p.lte === 0 && p.gte === undefined) out.push('you have not played a card this turn');
      else if (p.gte !== undefined && p.lte === undefined) out.push(p.gte <= 1 ? 'you have played a card this turn' : `you have played at least ${NUM(p.gte)} cards this turn`);
      else if (p.lte !== undefined && p.gte === undefined) out.push(`you have played at most ${NUM(p.lte)} ${p.lte === 1 ? 'card' : 'cards'} this turn`);
      else out.push(`you have played ${NUM(p.gte)} to ${NUM(p.lte)} cards this turn`);
    }
    if (c.attacksPlayed) {
      const p = c.attacksPlayed;
      if (p.lte === 0 && p.gte === undefined) out.push('you have not played an Attack this turn');
      else if (p.gte !== undefined && p.lte === undefined) out.push(p.gte <= 1 ? 'you have played an Attack this turn' : `you have played at least ${NUM(p.gte)} Attacks this turn`);
      else if (p.lte !== undefined && p.gte === undefined) out.push(`you have played at most ${NUM(p.lte)} ${p.lte === 1 ? 'Attack' : 'Attacks'} this turn`);
      else out.push(`you have played ${NUM(p.gte)} to ${NUM(p.lte)} Attacks this turn`);
    }
    if (c.turn) {
      const p = c.turn;
      if (p.gte !== undefined && p.lte !== undefined) out.push(`it is turn ${NUM(p.gte)} to ${NUM(p.lte)}`);
      else if (p.gte !== undefined) out.push(`it is turn ${NUM(p.gte)} or later`);
      else if (p.lte !== undefined) out.push(`it is turn ${NUM(p.lte)} or earlier`);
    }
    if (c.lastKill) out.push('this defeats an enemy');
    if (c.targetStatus) { const s = c.targetStatus; out.push(cmpPhrase(s, 'the target', 'has', KS(s.s), {})); }
    if (c.allyDown) out.push(`your ally is ${KW('down', 'down')}`);
    if (c.block) out.push(cmpPhrase(c.block, 'you', 'have', KW_BLOCK(), { strictN: false }));
    if (c.energy) {
      const p = c.energy;
      if (p.lte === 0 && p.gte === undefined) out.push('you have no Energy left');
      else if (p.gte !== undefined && p.lte === undefined) out.push(`you have at least ${NUM(p.gte)} Energy left`);
      else if (p.lte !== undefined && p.gte === undefined) out.push(`you have at most ${NUM(p.lte)} Energy left`);
      else out.push(`you have ${NUM(p.gte)} to ${NUM(p.lte)} Energy left`);
    }
    if (c.handSize) {
      const p = c.handSize;
      if (p.gte !== undefined && p.lte === undefined) out.push(`you hold at least ${NUM(p.gte)} ${p.gte === 1 ? 'card' : 'cards'}`);
      else if (p.lte !== undefined && p.gte === undefined) out.push(p.lte === 0 ? 'you hold no cards' : `you hold at most ${NUM(p.lte)} ${p.lte === 1 ? 'card' : 'cards'}`);
      else out.push(`you hold ${NUM(p.gte)} to ${NUM(p.lte)} cards`);
    }
    if (c.enemies) {
      const p = c.enemies;
      if (p.gte !== undefined && p.lte === undefined) out.push(p.gte <= 1 ? 'an enemy remains' : `${NUM(p.gte)} or more enemies remain`);
      else if (p.lte !== undefined && p.gte === undefined) out.push(p.lte === 1 ? 'only one enemy remains' : `${NUM(p.lte)} or fewer enemies remain`);
      else out.push(`${NUM(p.gte)} to ${NUM(p.lte)} enemies remain`);
    }
    return out;
  }

  // ------------------------------------------------------------------------------------------------
  // Text: hooks
  // ------------------------------------------------------------------------------------------------
  const TYPE_WORD = { attack: 'Attack', skill: 'Skill', power: 'Power', curse: 'Curse', status: 'Status' };
  function cardPhrase(f) {
    f = f || {};
    const types = list(f.type).map((t) => TYPE_WORD[t] || t);
    let noun = types.length ? types.join(' or ') : 'card';
    if (list(f.hero).length && list(f.hero)[0] !== 'any') noun = `${list(f.hero).map(HERO_NAME).join(' or ')} ${noun}`;
    let s = `${aAn(noun)} ${noun}`;
    const tail = [];
    if (f.cost) {
      const c = f.cost;
      if (c.gte !== undefined && c.lte !== undefined) tail.push(c.gte === c.lte ? `that costs ${NUM(c.gte)}` : `that costs ${NUM(c.gte)} to ${NUM(c.lte)}`);
      else if (c.lte === 0) tail.push(`that costs ${NUM(0)}`);
      else if (c.lte !== undefined) tail.push(`that costs ${NUM(c.lte)} or less`);
      else if (c.gte !== undefined) tail.push(`that costs ${NUM(c.gte)} or more`);
    }
    const withs = [];
    list(f.kw).forEach((k) => withs.push(KW(k[0].toUpperCase() + k.slice(1), k)));
    if (f.gems) withs.push(f.gems.gte > 1 ? `${NUM(f.gems.gte)} or more gems` : 'a gem');
    if (withs.length) tail.push(`with ${joinAnd(withs)}`);
    if (tail.length) s += ' ' + tail.join(' ');
    return s;
  }
  function tierPhrase(tier) {
    const t = list(tier).map((x) => ({ minion: 'a Minion', normal: 'a normal enemy', elite: 'an Elite', boss: 'a Boss' }[x] || x));
    return t.length ? t.join(' or ') : 'an enemy';
  }
  function fightPhrase(tier) {
    const t = list(tier).map((x) => ({ minion: 'minion', normal: 'normal', elite: 'elite', boss: 'boss' }[x] || x));
    return t.length ? `${aAn(t[0])} ${t.join(' or ')} fight` : 'a fight';
  }

  // the trigger clause of a hook, e.g. "whenever you play a Skill"; opts.once/every/limit change the wording.
  // In a card (S.owned) "you" is the hero who owns the card: a hook only counts that hero's own events unless its filter says
  // hero:'any', which reads "either hero" so a player never takes "whenever you play an Attack" to mean the ally's too.
  // A relic or any other party hook fires for either hero already, and keeps the plain "you".
  function triggerPhrase(h, S) {
    const on = h.on, f = h.filter || {};
    const owned = !!(S && S.owned);
    const any = owned && f.hero === 'any';
    let core = null;
    switch (on) {
      case 'onPlay': core = `${any ? 'either hero plays' : 'you play'} ${cardPhrase(f)}`; break;
      case 'onExhaust': core = `${cardPhrase(f)} is ${KW('Exhausted', 'exhaust')}`; break;
      case 'onKill': core = `${any ? 'either hero defeats' : 'you defeat'} ${tierPhrase(f.tier)}`; break;
      case 'onDamaged': core = any ? 'either hero is hit' : 'you are hit'; break;
      // the swap event names the hero who ends up in front, so an owned hook without hero:'any' only hears swaps that put its owner there
      case 'onSwap': core = any ? 'either hero swaps rows' : owned ? `you swap into the ${KW('front', 'front')} row` : 'you swap rows'; break;
      case 'onHeroDown': core = owned && !any ? 'you fall' : 'a hero falls'; break;
      case 'onShuffle': core = 'you reshuffle your draw pile'; break;
      case 'onPaint': core = 'you paint a hex'; break;
      case 'onFightWon': core = `you win ${fightPhrase(f.tier)}`; break;
      case 'onRest': core = 'you rest at a camp'; break;
      case 'onShopEnter': core = 'you enter a shop'; break;
      case 'onPickup': return 'when you take this';
      case 'onChapterStart': return h.every ? `every ${ordinal(h.every)} chapter start` : 'at the start of each chapter';
      case 'combatStart': return 'at the start of combat';
      case 'combatEnd': return 'at the end of combat';
      case 'turnStart': return h.every ? `at the start of every ${ordinal(h.every)} turn` : h.once ? 'next turn' : 'at the start of your turn';
      case 'turnEnd': return h.every ? `at the end of every ${ordinal(h.every)} turn` : h.once ? 'at the end of this turn' : 'at the end of your turn';
      // enemy hooks
      case 'onDeath': return 'when it dies';
      case 'onHurt': return 'when it is hurt';
      case 'onAllyDeath': return 'when another enemy dies';
      case 'onHeroPlay': return f.type ? `when a hero plays ${cardPhrase(f)}` : 'when a hero plays a card';
      default: return `when ${on}`;
    }
    if (h.every) return `every ${ordinal(h.every)} time ${core}`;
    if (h.once) return `the next time ${core}`;
    return `whenever ${core}`;
  }
  const RUN_HOOKS = ['onPickup', 'onChapterStart', 'onRest', 'onPaint', 'onFightWon', 'onShopEnter'];
  function limitPhrase(h) {
    const per = RUN_HOOKS.indexOf(h.on) >= 0 ? 'chapter' : 'turn';
    if (h.limit === undefined) return '';
    return h.limit === 1 ? `once per ${per}` : `up to ${h.limit} times per ${per}`;
  }
  const RUN_OPS = ['addCard', 'removeCard', 'upgradeCard', 'transformCard', 'duplicateCard', 'addRelic', 'addGem', 'addBrush', 'addCurse', 'flag', 'paint', 'cardReward', 'fight'];

  // ------------------------------------------------------------------------------------------------
  // Text: op fragments. A fragment is {h, k, ...}: h is lower case html without the final period; k is the merge kind.
  // ------------------------------------------------------------------------------------------------
  function refOf(S, op, key, dflt) {
    if (!S.ref.has(op)) return undefined;
    const b = S.ref.get(op);
    if (!b) return 0;
    return b[key] === undefined ? dflt : vKey(b[key]);
  }
  const noNeg = (r) => (r !== undefined && r < 0 ? undefined : r);
  // the printed (un-upgraded) V of the op aligned with this one: lets the "plus" and "for each" forms colour their base and multiplier
  function refVOf(S, op, key) {
    if (!S.ref.has(op)) return undefined;
    const b = S.ref.get(op);
    return b ? b[key] : undefined;
  }

  function consumeParts(op) {
    if (op.consume === undefined) return { pre: null, post: null, s: null };
    const s = isObj(op.consume) ? op.consume.s : op.consume;
    const up = isObj(op.consume) ? op.consume.upTo : undefined;
    const upTxt = up === undefined ? 'all' : isNum(up) ? `up to ${NUM(up)}` : 'some';
    if (s === 'block') return { pre: null, post: up === undefined ? `lose all your ${KW_BLOCK()}` : `lose up to ${isNum(up) ? NUM(up) : 'some'} ${KW_BLOCK()}`, s };
    return { pre: `spend ${upTxt} ${KS(s)}`, post: null, s };
  }

  function dmgFrags(op, S, timesV, more) {
    const cons = consumeParts(op);
    const spent = cons.s && isObj(op.n) && op.n.per === 'status' && op.n.s === cons.s;
    const n = op.n;
    const refN = noNeg(refOf(S, op, 'n', 0));
    const tgt = op.tgt || 'enemy';
    const sfx = enemySuffix(tgt, S);
    // how many times: "2 times", "X times", "for each Charge you have"
    let timesTxt = '';
    const hv = timesV !== undefined ? timesV : op.hits;
    if (hv !== undefined && !(isNum(hv) && hv === 1 && !op.hitsPlus)) {
      const plus = timesV !== undefined ? 0 : op.hitsPlus || 0;
      const spentHits = timesV === undefined && cons.s && isObj(hv) && hv.per === 'status' && hv.s === cons.s;
      timesTxt = ` ${timesPhrase(hv, { plus, ref: timesV !== undefined ? undefined : refOf(S, op, 'hits', 1), spent: spentHits })}`;
    } else if (op.hitsPlus) {
      timesTxt = ` ${timesPhrase(1, { plus: op.hitsPlus, ref: refOf(S, op, 'hits', 1) })}`;
    }
    let A, h;
    const out0 = {};
    if (more && isNum(n)) {
      A = `${amt(n, '', { plus: op.plus, ref: refN, live: S.live.dmg })} more damage`;
      // "more" always follows a strike on the same enemies, so the target is not said twice: "Back: deal 2 more damage."
      h = `deal ${A}${timesTxt}`;
    } else {
      // the "plus" and "for each" forms carry the target and the count right after "damage": "Deal 4 damage to all enemies, plus 2 for each Sumi spent."
      A = amt(n, 'damage', { plus: op.plus, ref: refN, refV: refVOf(S, op, 'n'), live: S.live.dmg, spent, mid: sfx + timesTxt, out: out0 });
      h = `deal ${A}${out0.mid ? '' : sfx + timesTxt}`;
    }
    if (op.pierce) h += `, ignoring ${KW_BLOCK()}`;
    const res = [];
    if (cons.pre) res.push({ h: cons.pre, k: 'consume' });
    const f = { h, k: `dmg|${tgt}` };
    // an area hit followed by a debuff on the same enemies shares the target: "Deal 5 damage and apply 1 Weak to all enemies."
    if (sfx && !out0.mid && !timesTxt && !op.pierce && !op.lifesteal && !cons.post && !(more && isNum(n))) f.dmgm = { lead: `deal ${A}`, sfx, key: `e|${tgt}` };
    res.push(f);
    if (op.lifesteal) res.push({ h: 'heal for the HP it removes', k: 'heal|self' });
    if (cons.post) res.push({ h: cons.post, k: 'consume' });
    return res;
  }

  function blockFrags(op, S, more) {
    const cons = consumeParts(op);
    const spent = cons.s && isObj(op.n) && op.n.per === 'status' && op.n.s === cons.s;
    const refN = noNeg(refOf(S, op, 'n', 0));
    const tgt = op.tgt || 'self';
    let A;
    if (more && isNum(op.n)) A = `${amt(op.n, '', { plus: op.plus, ref: refN, live: S.live.block })} more ${KW_BLOCK()}`;
    else A = amt(op.n, KW_BLOCK(), { plus: op.plus, ref: refN, refV: refVOf(S, op, 'n'), live: S.live.block, spent });
    const out = [];
    if (cons.pre) out.push({ h: cons.pre, k: 'consume' });
    const f = { h: GAIN(tgt, A), k: `block|${tgt}` };
    // a plain number of Block can share a "gain" sentence with plain statuses: "Gain 5 Block and 1 Taunt."
    if (isNum(op.n) && !cons.pre && !cons.post && !more) f.gain = { key: tgt, kinds: ['block'], items: [A], build: (items) => GAIN(tgt, joinAnd(items)) };
    out.push(f);
    if (cons.post) out.push({ h: cons.post, k: 'consume' });
    return out;
  }

  function healFrags(op, S, more) {
    const cons = consumeParts(op);
    const spent = cons.s && isObj(op.n) && op.n.per === 'status' && op.n.s === cons.s;
    const tgt = op.tgt || 'self';
    const refN = noNeg(refOf(S, op, 'n', 0));
    const A = more && isNum(op.n) ? `${amt(op.n, '', { plus: op.plus, ref: refN })} more HP` : amt(op.n, 'HP', { plus: op.plus, ref: refN, refV: refVOf(S, op, 'n'), spent });
    const out = [];
    if (cons.pre) out.push({ h: cons.pre, k: 'consume' });
    out.push({ h: HEAL(tgt, A), k: `heal|${tgt}` });
    if (cons.post) out.push({ h: cons.post, k: 'consume' });
    return out;
  }

  function hurtFrags(op, S) {
    const cons = consumeParts(op);
    const tgt = op.tgt || 'self';
    const A = amt(op.n, 'HP', { ref: noNeg(refOf(S, op, 'n', 0)) });
    const out = [];
    if (cons.pre) out.push({ h: cons.pre, k: 'consume' });
    out.push({ h: LOSE(tgt, A) + (op.lethal ? ' (this can be fatal)' : ''), k: `hurt|${tgt}` });
    if (cons.post) out.push({ h: cons.post, k: 'consume' });
    return out;
  }

  function statusFrags(op, S, prev) {
    const cons = consumeParts(op);
    const tgt = op.tgt || (D.isDebuff(op.s) ? 'enemy' : 'self');
    const enemy = isEnemyTgt(tgt);
    const n = op.n;
    const spent = cons.s && isObj(n) && n.per === 'status' && n.s === cons.s;
    const refN = noNeg(refOf(S, op, 'n', 0));
    const out = [];
    if (cons.pre) out.push({ h: cons.pre, k: 'consume' });
    const plainPos = isNum(n) && n > 0 && !cons.pre && !cons.post;
    if (plainPos) {
      const item = `${NUM(n, clsOf(n, n, refN))} ${KS(op.s)}`;
      if (S.temps && S.temps.get(op) && !enemy) {
        // "gain 2 Might this turn": the status plus the hook that takes it back (see tempPairs)
        out.push({ h: `${GAIN(tgt, item)} ${S.temps.get(op) === 'next' ? 'until your next turn' : 'until the end of this turn'}`, k: 'temp' });
        return out;
      }
      const key = `${enemy ? 'e' : 'h'}|${tgt}`;
      if (enemy && prev && prev.dmgm && prev.dmgm.key === key) {
        const dm = prev.dmgm;
        prev.items = [item]; prev.ss = [op.s]; prev.mk = key; prev.k = 'status'; prev.dmgm = null;
        prev.build = (items) => `${dm.lead} and apply ${joinAnd(items)}${dm.sfx}`;
        prev.h = prev.build(prev.items);
        return { merged: true };
      }
      if (enemy && prev && prev.mk === key) {
        prev.items.push(item);
        prev.ss.push(op.s);
        prev.h = prev.build(prev.items);
        return { merged: true };
      }
      const build = enemy ? (items) => `apply ${joinAnd(items)}${enemySuffix(tgt, S)}` : (items) => GAIN(tgt, joinAnd(items));
      const f = { h: build([item]), k: 'status', mk: key, items: [item], ss: [op.s], build };
      if (!enemy) f.gain = { key: tgt, kinds: ['s:' + op.s], items: [item], build };
      out.push(f);
      return out;
    }
    let h;
    const dbl = !cons.pre && !cons.post && isObj(n) && n.per === 'status' && n.s === op.s && (n.mul === undefined || n.mul === 1) && !n.base && n.upTo === undefined;
    if (dbl) {
      // "Double the target's Poison (adds at most 10)"
      const capTxt = n.cap !== undefined ? ` (adds at most ${NUM(n.cap)})` : '';
      const whoTxt = enemy || isTarget(n.who) ? "the target's" : n.who === 'ally' ? "your ally's" : 'your';
      h = `double ${whoTxt} ${KS(op.s)}${capTxt}`;
    } else if (isNum(n) && n < 0) {
      const item = `${NUM(-n)} ${KS(op.s)}`;
      h = enemy ? `remove ${item} from ${enemyObj(tgt, S)}` : LOSE(tgt, item);
    } else {
      const A = amt(n, KS(op.s), { ref: refN, refV: refVOf(S, op, 'n'), spent });
      h = enemy ? `apply ${A}${enemySuffix(tgt, S)}` : GAIN(tgt, A);
    }
    out.push({ h, k: 'statusx' });
    if (cons.post) out.push({ h: cons.post, k: 'consume' });
    return out;
  }

  function removeStatusFrag(op, S) {
    const s = op.s;
    const tgt = selfT(op.tgt || ((s === 'debuffs' || D.isDebuff(s)) ? 'self' : (s === 'buffs' || D.isBuff(s)) ? 'enemy' : 'self'));
    const enemy = isEnemyTgt(tgt);
    const from = enemy ? enemyObj(tgt, S) : HERO_FROM(tgt);
    if (s === 'debuffs' || s === 'buffs') return { h: !enemy && tgt === 'self' ? `remove all ${s}` : `remove all ${s} from ${from}`, k: 'remove' };
    const nTxt = op.n === undefined ? 'all' : amt(op.n, '', {});
    if (!enemy && tgt === 'self') return { h: `lose ${nTxt} ${KS(s)}`, k: 'remove' };
    return { h: `remove ${nTxt === 'all' ? '' : nTxt + ' '}${KS(s)} from ${from}`, k: 'remove' };
  }

  function pickFrag(op) {
    const f = op.filter || {};
    const tw = f.type ? TYPE_WORD[f.type] : null;
    const hw = f.hero ? HERO_NAME(f.hero) : null;
    const noun1 = `${hw ? hw + ' ' : ''}${tw || 'card'}`;
    const nounN = `${hw ? hw + ' ' : ''}${tw ? tw + 's' : 'cards'}`;
    const n = isNum(op.n) ? op.n : 1;
    let C;
    if (op.random) C = n === 1 ? `a random ${noun1}` : `${NUM(n)} random ${nounN}`;
    else if (op.optional) C = `up to ${NUM(n)} ${n === 1 ? noun1 : nounN}`;
    else C = n === 1 ? `${aAn(noun1)} ${noun1}` : `${NUM(n)} ${nounN}`;
    let src = '';
    if (op.from === 'draw') src = op.top ? (op.top === 1 ? ' from the top of your draw pile' : ` from the top ${NUM(op.top)} cards of your draw pile`) : ' from your draw pile';
    else if (op.from === 'discard') src = ' from your discard pile';
    else if (op.from === 'exhaust') src = ` from your ${KW_EXHAUST()} pile`;
    let h;
    switch (op.then) {
      case 'discard': h = `discard ${C}${src}`; break;
      case 'exhaust': h = `${KW_EXHAUST()} ${C}${src}`; break;
      case 'retain': h = `${KW('Retain', 'retain')} ${C}`; break;
      case 'upgrade': h = `upgrade ${C} ${op.from === 'hand' ? 'in your hand' : src.trim()}`.trim(); break;
      case 'copy': h = `copy ${C} in your hand`; break;
      case 'toHand': h = op.from === 'exhaust' ? `return ${C}${src} to your hand` : `put ${C}${src} into your hand`; break;
      case 'toDrawTop': h = `put ${C}${src} on top of your draw pile`; break;
      default: h = `choose ${C}${src}`;
    }
    return { h, k: 'pick' };
  }

  function addFrag(op, S) {
    const def = D.cards[op.card];
    const junk = def && (def.hero === 'curse' || def.hero === 'status');
    // a Curse or Status card has a plain word for a name ("Blot"), so it says what it is: "a Blot card", "2 Blot cards"
    const name = esc((def ? def.name : String(op.card)) + (op.up ? '+' : '')) + (junk ? ' card' : '');
    const to = op.to || (junk ? 'discard' : 'hand');
    const n = op.n === undefined ? 1 : op.n;
    const what = isNum(n) ? (n === 1 ? `${aAn(name)} ${name}` : `${NUM(n)} ${junk ? name + 's' : name + ' cards'}`) : `${amt(n, '', {})} ${junk ? name + 's' : name + ' cards'}`;
    let h;
    if (to === 'draw') h = op.top ? `put ${what} on top of your draw pile` : `shuffle ${what} into your draw pile`;
    else if (to === 'discard') h = `add ${what} to your discard pile`;
    else if (to === 'exhaust') h = `add ${what} to your ${KW_EXHAUST()} pile`;
    else h = `add ${what} to your hand`;
    return { h, k: 'add' };
  }

  function reviveFrag(op, S) {
    const A = op.pct !== undefined ? `${NUM(Math.round(op.pct * 100))}% HP` : `${amt(op.n, 'HP', {})}`;
    const who = S.hookOn === 'onHeroDown' ? (S.owned && !S.hookAny ? 'yourself' : 'that hero') : 'a fallen hero';
    return { h: `revive ${who} with ${A}`, k: 'revive' };
  }

  function joinFrags(frs) { return joinAnd(frs.map((f) => f.h)); }

  // "Gain 2 Might. ... At the end of this turn, lose 2 Might." is one idea: a status followed (in the same op list) by a `once`
  // turnEnd or turnStart hook that takes exactly that status back from the same target. It reads "Gain 2 Might this turn." or
  // "Gain 1 Dodge until your next turn.", and the hook op is not printed a second time.
  function tempPairs(ops) {
    const marks = new Map(), skip = new Set();
    const dflt = (o) => o.tgt || (D.isDebuff(o.s) ? 'enemy' : 'self');
    ops.forEach((op, i) => {
      if (!op || op.op !== 'status' || !isNum(op.n) || op.n <= 0 || isEnemyTgt(dflt(op))) return;
      for (let j = i + 1; j < ops.length; j++) {
        const h = ops[j];
        if (!h || h.op !== 'hook' || skip.has(h) || !h.once || (h.on !== 'turnEnd' && h.on !== 'turnStart') || h.filter || h.limit !== undefined || h.every) continue;
        const fx = list(h.fx);
        const u = fx[0];
        if (fx.length !== 1 || !u || u.op !== 'status' || u.s !== op.s || u.n !== -op.n || dflt(u) !== dflt(op) || u.consume !== undefined) continue;
        marks.set(op, h.on === 'turnEnd' ? 'turn' : 'next');
        skip.add(h);
        break;
      }
    });
    return { marks, skip };
  }

  function fragsOfList(ops, S) {
    const out = [];
    const arr = list(ops);
    const tp = tempPairs(arr);
    const saved = { temps: S.temps, swapped: S.swapped };
    S.temps = tp.marks;
    arr.forEach((op) => {
      if (!op || typeof op !== 'object' || tp.skip.has(op)) return;
      const r = opFrags(op, S, out[out.length - 1] || null);
      if (op.op === 'swap') S.swapped = true;
      if (!r || r.merged) return;
      r.forEach((f) => {
        const p = out[out.length - 1];
        // "gain" items of different kinds share one sentence: "Gain 5 Block and 1 Taunt."
        if (f.gain && p && p.gain && p.gain.key === f.gain.key && !f.gain.kinds.some((k) => p.gain.kinds.indexOf(k) >= 0)) {
          p.gain.items = p.gain.items.concat(f.gain.items);
          p.gain.kinds = p.gain.kinds.concat(f.gain.kinds);
          p.h = p.gain.build(p.gain.items);
          p.ss = (p.ss || []).concat(f.ss || []);
          p.k = f.k;
          if (f.mk) p.mk = f.mk;
        } else out.push(f);
      });
    });
    S.temps = saved.temps; S.swapped = saved.swapped;
    return out;
  }

  // ---- enemy ops (a move's fx, an enemy's start ops and hooks), read from the enemy's side: DESIGN 4.5 targets ----
  const E_HERO = { front: 'the front hero', back: 'the back hero', both: 'both heroes', random: 'a random hero', lowest: 'the weakest hero' };
  const E_SIDE = { allEnemies: 'all enemies', otherEnemy: 'another enemy', lowestEnemy: 'the enemy with the lowest HP' };
  const pluralName = (name, n) => (n > 1 && !/Kodama$/.test(name) ? name + 's' : name);
  const E_NAME = (id) => (D.enemies[id] ? D.enemies[id].name : String(id));

  function enemyFrags(op, S, prev) {
    switch (op.op) {
      case 'dmg': {
        const tgt = op.tgt || 'front';
        const etgt = E_HERO[tgt] || 'the front hero';
        const hv = op.hits;
        const timesTxt = hv !== undefined && !(isNum(hv) && hv === 1) ? ` ${timesPhrase(hv, {})}` : '';
        const out = {};
        const A = amt(op.n, 'damage', { mid: ` to ${etgt}${timesTxt}`, out });
        const head = `deal ${A}`;
        let h = out.mid ? head : `${head} to ${etgt}${timesTxt}`;
        if (op.pierce) h += `, ignoring ${KW_BLOCK()}`;
        const res = [];
        if (op.lifesteal) { h += ' and heal for the damage dealt'; }
        res.push({ h, k: 'edmg', etgt: out.mid || op.pierce || op.lifesteal ? null : etgt, lead: out.mid || timesTxt ? null : head, head: `${head}${timesTxt}` });
        return res;
      }
      case 'block': case 'heal': {
        const tgt = op.tgt || 'self';
        if (tgt === 'self') {
          const A = op.op === 'block' ? amt(op.n, KW_BLOCK(), {}) : amt(op.n, 'HP', {});
          const f = { h: op.op === 'block' ? `gain ${A}` : `heal ${A}`, k: 'eself' };
          if (op.op === 'block' && isNum(op.n)) f.gain = { key: 'self', kinds: ['block'], items: [A], build: (items) => `gain ${joinAnd(items)}` };
          return [f];
        }
        const who = E_SIDE[tgt] || 'an enemy';
        return [op.op === 'block'
          ? { h: `${who} ${tgt === 'allEnemies' ? 'gain' : 'gains'} ${amt(op.n, KW_BLOCK(), {})}`, k: 'eother' }
          : { h: `heal ${who} for ${amt(op.n, 'HP', {})}`, k: 'eother' }];
      }
      case 'status': {
        const tgt = op.tgt || (D.isDebuff(op.s) ? 'front' : 'self');
        const n = op.n;
        const item = isNum(n) ? `${NUM(Math.abs(n))} ${KS(op.s)}` : amt(n, KS(op.s), {});
        if (E_HERO[tgt]) {
          if (isNum(n) && n < 0) return [{ h: `remove ${item} from ${E_HERO[tgt]}`, k: 'eremove' }];
          const etgt = E_HERO[tgt];
          // "Deal 5 damage and apply 1 Vulnerable to the front hero." / "Apply 1 Weak and 1 Frail to both heroes."
          if (prev && prev.k === 'edmg' && prev.etgt === etgt && prev.lead) {
            prev.k = 'estatus'; prev.items = [item]; prev.ss = [op.s];
            prev.build = (items) => `${prev.lead} and apply ${joinAnd(items)} to ${etgt}`;
            prev.h = prev.build(prev.items);
            return { merged: true };
          }
          if (prev && prev.k === 'estatus' && prev.etgt === etgt) {
            prev.items.push(item); prev.ss.push(op.s); prev.h = prev.build(prev.items);
            return { merged: true };
          }
          const f = { h: `apply ${item} to ${etgt}`, k: 'estatus', etgt, items: [item], ss: [op.s] };
          f.build = (items) => `apply ${joinAnd(items)} to ${etgt}`;
          return [f];
        }
        if (tgt === 'self') {
          if (isNum(n) && n < 0) return [{ h: `lose ${item}`, k: 'eself' }];
          const f = { h: `gain ${item}`, k: 'eself', ss: [op.s] };
          if (isNum(n)) f.gain = { key: 'self', kinds: ['s:' + op.s], items: [item], build: (items) => `gain ${joinAnd(items)}` };
          return [f];
        }
        const who = E_SIDE[tgt] || 'an enemy';
        return [{ h: `${who} ${tgt === 'allEnemies' ? 'gain' : 'gains'} ${item}`, k: 'eother' }];
      }
      case 'removeStatus': {
        const s = op.s;
        const tgt = op.tgt || ((s === 'debuffs' || D.isDebuff(s)) ? 'self' : 'front');
        const word = s === 'buffs' || s === 'debuffs' ? `all ${s}` : `${op.n === undefined ? '' : amt(op.n, '', {}) + ' '}${KS(s)}`;
        if (tgt === 'self') return [{ h: s === 'buffs' || s === 'debuffs' ? `remove ${word} from itself` : `lose ${op.n === undefined ? 'all ' : ''}${op.n === undefined ? '' : amt(op.n, '', {}) + ' '}${KS(s)}`, k: 'eremove' }];
        const etgt = E_HERO[tgt] || E_SIDE[tgt] || 'the front hero';
        // consecutive removals from the same side share one sentence: "Remove Bloom, Sumi, Ward and Charge from both heroes."
        if (prev && prev.k === 'eremoveh' && prev.etgt === etgt) { prev.items.push(word); prev.h = `remove ${joinAnd(prev.items)} from ${etgt}`; return { merged: true }; }
        return [{ h: `remove ${word} from ${etgt}`, k: 'eremoveh', etgt, items: [word] }];
      }
      case 'add': return [addFrag(op, S)];
      case 'summon': {
        const n = op.n && op.n > 1 ? op.n : 1;
        const name = esc(E_NAME(op.enemy));
        return [{ h: n > 1 ? `summon ${NUM(n)} ${pluralName(name, n)}` : `summon ${aAn(name)} ${name}`, k: 'summon' }];
      }
      case 'swap': return [{ h: 'swap your rows', k: 'swap' }];
      case 'stealGold': return [{ h: `steal ${amt(op.n, 'gold', {})}`, k: 'steal' }];
      case 'flee': return [{ h: 'flee', k: 'flee' }];
      case 'cond': return condFrags(op, S, prev);
      default: return null;
    }
  }

  // one op -> array of fragments (or {merged:true} when it joined the previous fragment)
  function opFrags(op, S, prev) {
    if (S.enemy) { const e = enemyFrags(op, S, prev); if (e !== null) return e; }
    if ((S.run || op.pct !== undefined || op.who !== undefined) && (op.op === 'gold' || op.op === 'ink' || op.op === 'heal' || op.op === 'hurt' || op.op === 'maxHp')) return runFrags(op, S);
    switch (op.op) {
      case 'dmg': return dmgFrags(op, S);
      case 'block': return blockFrags(op, S);
      case 'heal': return healFrags(op, S);
      case 'hurt': return hurtFrags(op, S);
      case 'status': return statusFrags(op, S, prev);
      case 'removeStatus': return [removeStatusFrag(op, S)];
      case 'draw': {
        const cons = consumeParts(op);
        const spent = cons.s && isObj(op.n) && op.n.per === 'status' && op.n.s === cons.s;
        const out = [];
        if (cons.pre) out.push({ h: cons.pre, k: 'consume' });
        let h;
        if (isNum(op.n)) { const r = noNeg(refOf(S, op, 'n', 0)); h = `draw ${NUM(op.n, clsOf(op.n, op.n, r))} ${op.n === 1 ? 'card' : 'cards'}`; }
        else if (isObj(op.n) && op.n.per === 'picked' && !op.n.base && op.n.cap === undefined && op.n.upTo === undefined) { const m = op.n.mul === undefined ? 1 : op.n.mul; h = `draw ${NUM(m)} ${m === 1 ? 'card' : 'cards'} for each card chosen`; }
        else h = `draw ${amt(op.n, 'cards', { spent })}`;
        out.push({ h, k: 'draw' });
        if (cons.post) out.push({ h: cons.post, k: 'consume' });
        return out;
      }
      case 'energy': {
        const cons = consumeParts(op);
        const spent = cons.s && isObj(op.n) && op.n.per === 'status' && op.n.s === cons.s;
        const out = [];
        if (cons.pre) out.push({ h: cons.pre, k: 'consume' });
        let h;
        if (isNum(op.n) && op.n < 0) h = `lose ${NUM(-op.n)} Energy`;
        else h = `gain ${amt(op.n, 'Energy', { ref: noNeg(refOf(S, op, 'n', 0)), spent })}`;
        out.push({ h, k: 'energy' });
        if (cons.post) out.push({ h: cons.post, k: 'consume' });
        return out;
      }
      case 'pick': return [pickFrag(op)];
      case 'add': return [addFrag(op, S)];
      case 'swap': return [{ h: `${KW('Swap', 'swap')} rows`, k: 'swap' }];
      case 'gold': case 'ink': {
        if (op.pct !== undefined) return runFrags(op, S);
        const word = op.op === 'gold' ? 'gold' : KW('Ink', 'ink');
        if (isNum(op.n) && op.n < 0) return [{ h: `lose ${NUM(-op.n)} ${word}`, k: op.op }];
        const A = amt(op.n, word, {});
        const f = { h: `gain ${A}`, k: op.op };
        if (isNum(op.n)) f.gain = { key: 'self', kinds: [op.op], items: [A], build: (items) => `gain ${joinAnd(items)}` };
        return [f];
      }
      case 'maxHp': { const t = op.tgt || 'self'; const A = `${NUM(Math.abs(op.n))} max HP`; return [{ h: isNum(op.n) && op.n < 0 ? LOSE(t, A) : GAIN(t, A), k: 'maxhp' }]; }
      case 'revive': return [reviveFrag(op, S)];
      case 'hook': { const f = hookFrag(op, S); return f ? [f] : []; }
      case 'repeat': return repeatFrags(op, S);
      case 'cond': return condFrags(op, S, prev);
      case 'summon': return [{ h: `summon ${op.n && op.n > 1 ? NUM(op.n) + ' ' : aAn(D.enemies[op.enemy] ? D.enemies[op.enemy].name : op.enemy) + ' '}${esc(D.enemies[op.enemy] ? D.enemies[op.enemy].name : op.enemy)}`, k: 'summon' }];
      case 'stealGold': return [{ h: `steal ${amt(op.n, 'gold', {})}`, k: 'steal' }];
      case 'flee': return [{ h: 'flee', k: 'flee' }];
      default: return runFrags(op, S);
    }
  }

  function repeatFrags(op, S) {
    const inner = list(op.do);
    if (inner.length === 1 && inner[0].op === 'dmg' && inner[0].hits === undefined && inner[0].consume === undefined && !inner[0].lifesteal) return dmgFrags(inner[0], S, op.n);
    const t = timesPhrase(op.n, {});
    const frs = fragsOfList(inner, S);
    if (!frs.length) return [];
    return [{ h: /^for each/.test(t) ? `${t}: ${joinFrags(frs)}` : `repeat ${t}: ${joinFrags(frs)}`, k: 'repeat' }];
  }

  function hookFrag(op, S) {
    const S2 = Object.assign({}, S, { hookOn: op.on, hand: false, hookAny: !!(op.filter && op.filter.hero === 'any'), live: S.live.hook || {} });
    const frs = fragsOfList(op.fx, S2);
    if (!frs.length) return null;
    const lead = triggerPhrase(op, S2);
    const lim = limitPhrase(op);
    // DESIGN 5.1: a one-shot next-turn hook reads "Next turn: gain 2 Energy."
    let h = `${lead}${lead === 'next turn' ? ': ' : ', '}${joinFrags(frs)}`;
    if (lim) h = `${lim}, ${h}`;
    return { h, k: 'hook' };
  }

  function condFrags(op, S, prev) {
    const c = op.if || {};
    const keys = Object.keys(c);
    const thenOps = list(op.then), elseOps = list(op.else);
    const rowOnly = keys.length === 1 && !!c.row;
    // "If you have Sumi, gain 2 more" on a Hanae card can never fire (a hero only ever holds their own resource): leave it out
    if (S.heroId && keys.length === 1 && c.status && (c.status.who === undefined || c.status.who === 'self') && c.status.lte === undefined && ST[c.status.s] && ST[c.status.s].kind === 'resource' && ST[c.status.s].hero && ST[c.status.s].hero !== S.heroId) return elseOps.length ? fragsOfList(elseOps, S) : [];
    // "Front:" / "Back:" lead a sentence; after a swap in the same card they read "Now Front:" (the row you ended up in)
    const lead = (row) => `${S.swapped ? 'Now ' : ''}${ROWKW[row]()}: `;
    // a step: "if you are in the Back row, swap" is "Move to the Front row" (it never pushes you out of the front)
    if (rowOnly && !elseOps.length && thenOps.length === 1 && thenOps[0].op === 'swap') { const to = c.row === 'front' ? 'back' : 'front'; return [{ h: `move to the ${KW(to, to)} row`, k: 'swap' }]; }
    // "Front: deal 3 more damage." after a same-kind, same-target op
    if (!elseOps.length && thenOps.length === 1 && prev && ['dmg', 'block', 'heal'].indexOf(thenOps[0].op) >= 0) {
      const t = thenOps[0];
      const plain = isNum(t.n) && t.consume === undefined && t.hits === undefined && !t.lifesteal && !t.pierce && !t.hitsPlus;
      const kind = `${t.op}|${t.tgt || (t.op === 'dmg' ? 'enemy' : 'self')}`;
      if (plain && (prev.k === kind || (t.op === 'block' && prev.gain && prev.gain.kinds[prev.gain.kinds.length - 1] === 'block' && prev.gain.key === (t.tgt || 'self')))) {
        const inner = t.op === 'dmg' ? dmgFrags(t, S, undefined, true) : t.op === 'block' ? blockFrags(t, S, true) : healFrags(t, S, true);
        const ld = rowOnly ? lead(c.row) : `if ${condPhrases(c, S).join(' and ')}, `;
        return [{ h: ld + joinFrags(inner), k: kind }];
      }
    }
    // "Front: apply 2 more Burn." after a plain status of the same kind on the same target
    if (!elseOps.length && thenOps.length === 1 && thenOps[0].op === 'status' && prev && prev.k === 'status') {
      const t = thenOps[0];
      const tgt = t.tgt || (D.isDebuff(t.s) ? 'enemy' : 'self');
      const enemy = isEnemyTgt(tgt);
      const sameTgt = prev.mk === `${enemy ? 'e' : 'h'}|${tgt}` || (prev.gain && prev.gain.key === tgt && !enemy);
      if (isNum(t.n) && t.n > 0 && t.consume === undefined && sameTgt && prev.ss && prev.ss[prev.ss.length - 1] === t.s) {
        const item = `${NUM(t.n, clsOf(t.n, t.n, noNeg(refOf(S, t, 'n', 0))))} more ${KS(t.s)}`;
        const inner = enemy ? `apply ${item}${enemySuffix(tgt, S)}` : GAIN(tgt, item);
        const ld = rowOnly ? lead(c.row) : `if ${condPhrases(c, S).join(' and ')}, `;
        return [{ h: ld + inner, k: 'statusx' }];
      }
    }
    const thenH = joinFrags(fragsOfList(thenOps, S));
    const elseH = elseOps.length ? joinFrags(fragsOfList(elseOps, S)) : '';
    if (!thenH && !elseH) return [];
    if (!thenH) {
      // only the else branch does anything: "Back: ..." or "Unless you have Bloom, ..."
      if (rowOnly) return [{ h: `${lead(c.row === 'front' ? 'back' : 'front')}${elseH}`, k: 'cond' }];
      return [{ h: `unless ${condPhrases(c, S).join(' and ')}, ${elseH}`, k: 'cond' }];
    }
    if (rowOnly) {
      const other = c.row === 'front' ? 'back' : 'front';
      let h = `${lead(c.row)}${thenH}`;
      if (elseH) h += `. ${lead(other)}${elseH}`;
      return [{ h, k: 'cond' }];
    }
    let h = `if ${condPhrases(c, S).join(' and ')}, ${thenH}`;
    if (elseH) h += `. Otherwise, ${elseH}`;
    return [{ h, k: 'cond' }];
  }

  // run ops (events and run hooks). In run mode (S.run) the ops that share a name with combat ops get the run wording.
  const runWho = (w) => (w === undefined || w === 'both' ? 'both heroes' : w === 'front' ? 'the front hero' : w === 'lowest' ? 'the weakest hero' : w === 'random' ? 'a random hero' : HERO_NAME(w));
  const runPct = (p) => `${NUM(Math.round(Math.abs(p) * 100))}%`;
  const runCount = (n, one, many) => (n === undefined || n === 1 ? `a ${one}` : `${NUM(n)} ${many}`);
  const nameOf = (reg, id) => esc(D[reg][id] ? D[reg][id].name : String(id));
  function runFrags(op, S) {
    const cardsWord = (o) => (o.random ? runCount(o.n, 'random card', 'random cards') : runCount(o.n, 'card', 'cards'));
    switch (op.op) {
      case 'gold': return [{ h: op.pct !== undefined ? `${op.pct < 0 ? 'lose' : 'gain'} ${runPct(op.pct)} of your gold` : op.n < 0 ? `lose ${NUM(-op.n)} gold` : `gain ${NUM(op.n)} gold`, k: 'run' }];
      case 'ink': return [{ h: op.pct !== undefined ? `${op.pct < 0 ? 'lose' : 'gain'} ${runPct(op.pct)} of your max ${KW('Ink', 'ink')}` : op.n < 0 ? `lose ${NUM(-op.n)} ${KW('Ink', 'ink')}` : `gain ${NUM(op.n)} ${KW('Ink', 'ink')}`, k: 'run' }];
      case 'heal': return [{ h: `heal ${runWho(op.who)} for ${op.pct !== undefined ? runPct(op.pct) + ' of max HP' : NUM(op.n) + ' HP'}`, k: 'run' }];
      case 'hurt': return [{ h: `${runWho(op.who)} ${op.who === undefined || op.who === 'both' ? 'lose' : 'loses'} ${op.pct !== undefined ? runPct(op.pct) + ' of max HP' : NUM(op.n) + ' HP'}`, k: 'run' }];
      case 'maxHp': return [{ h: `${runWho(op.who)} ${op.who === undefined || op.who === 'both' ? (op.n < 0 ? 'lose' : 'gain') : (op.n < 0 ? 'loses' : 'gains')} ${NUM(Math.abs(op.n))} max HP`, k: 'run' }];
      case 'addCard':
        if (op.card) return [{ h: `add ${aAn(nameOf('cards', op.card))} ${nameOf('cards', op.card)}${op.up ? '+' : ''} to your deck`, k: 'run' }];
        return [{ h: `add ${op.n > 1 ? NUM(op.n) + ' random ' + (op.rarity ? op.rarity + ' ' : '') + 'cards' : 'a random ' + (op.rarity ? op.rarity + ' ' : '') + 'card'} to your deck`, k: 'run' }];
      case 'removeCard': return [{ h: `remove ${cardsWord(op)} from your deck`, k: 'run' }];
      case 'upgradeCard': return [{ h: `upgrade ${cardsWord(op)}`, k: 'run' }];
      case 'transformCard': return [{ h: `transform ${cardsWord(op)}`, k: 'run' }];
      case 'duplicateCard': return [{ h: `duplicate ${cardsWord(op)}`, k: 'run' }];
      case 'addRelic': return [{ h: op.id ? `gain ${nameOf('relics', op.id)}` : `gain a random ${op.rarity} Treasure`, k: 'run' }];
      case 'addGem': return [{ h: op.id ? `gain ${nameOf('gems', op.id)}` : `gain a random ${op.color ? op.color + ' ' : ''}gem${op.tier ? ' of tier ' + op.tier : ''}`, k: 'run' }];
      case 'addBrush': return [{ h: op.id === 'random' ? 'gain a random Brush' : `gain ${nameOf('brushes', op.id)}`, k: 'run' }];
      case 'addCurse': return [{ h: op.id ? `add ${nameOf('cards', op.id)} to your deck` : `add ${runCount(op.n, 'curse', 'curses')} to your deck`, k: 'run' }];
      case 'flag': return [];
      case 'paint': return [{ h: `paint ${NUM(op.n)} ${op.n === 1 ? 'hex' : 'hexes'} for free`, k: 'run' }];
      case 'cardReward': return [{ h: 'choose a card reward', k: 'run' }];
      case 'fight': return [{ h: 'a fight begins', k: 'run' }];
      default: return [{ h: esc(String(op.op)), k: 'unknown' }];
    }
  }

  function makeState(res, ctx, run) {
    return { ref: res ? buildRef(res) : new Map(), live: liveFns(ctx), hookOn: null, hand: false, run: !!run || !!(ctx && ctx.run), owned: !!res, enemy: false, temps: null, swapped: false, heroId: res && res.hero ? res.hero : null };
  }
  const renderOps = (ops, S) => fragsOfList(ops, S).map((f) => sentence(f.h));

  // ------------------------------------------------------------------------------------------------
  // Public text functions
  // ------------------------------------------------------------------------------------------------
  const LEAD_KW = ['innate', 'retain', 'ethereal', 'unplayable'];

  function handSentences(def, S) {
    const out = [];
    const h = def.hand || {};
    const S2 = Object.assign({}, S, { hand: true });
    const te = h.turnEnd && h.turnEnd.length ? joinFrags(fragsOfList(h.turnEnd, S2)) : '';
    const dr = h.drawn && h.drawn.length ? joinFrags(fragsOfList(h.drawn, S2)) : '';
    if (te) out.push(sentence(`if this is in your hand at the end of your turn, ${te}`));
    if (dr) out.push(sentence(`when drawn, ${dr}`));
    return out;
  }

  function cardSentences(res, ctx) {
    const S = makeState(res, ctx);
    const out = [];
    LEAD_KW.forEach((k) => { if (res.kw.indexOf(k) >= 0) out.push(sentence(KW(k[0].toUpperCase() + k.slice(1), k))); });
    renderOps(res.fx, S).forEach((s) => out.push(s));
    if (res.def && res.def.hand) handSentences(res.def, S).forEach((s) => out.push(s));
    (res.gemNotes || []).forEach((n) => {
      const g = D.gems[n.gem];
      out.push(sentence(`${ROWKW[n.cond]()}: ${gemModText(g.mod, true).replace(/^./, (c) => c.toLowerCase())}`));
    });
    if (res.kw.indexOf('exhaust') >= 0) out.push(sentence(KW_EXHAUST()));
    return out;
  }

  function cardHtml(x, ctx) {
    const res = asResolved(x, ctx && ctx.unit ? ctx : undefined);
    const prev = junkMode;
    junkMode = !!(res.def && (res.def.hero === 'curse' || res.def.hero === 'status'));
    try { return cardSentences(res, ctx).join(' '); } finally { junkMode = prev; }
  }
  function cardPlain(x, ctx) { return plainOf(cardHtml(x, ctx)); }

  // Enemy op lists are told apart from card op lists by identity: the move, start, phase and hook fx arrays of every registered enemy
  // are remembered (rebuilt when the roster changes), so `DATA.opsText(move.fx)` reads from the enemy's side with no extra argument.
  let enemyKnown = -1, enemyArrays = new WeakSet(), enemyHookObjs = new WeakSet();
  function enemyLists() {
    const defs = Object.values(D.enemies);
    if (enemyKnown !== defs.length) {
      enemyKnown = defs.length; enemyArrays = new WeakSet(); enemyHookObjs = new WeakSet();
      defs.forEach((e) => {
        if (Array.isArray(e.start)) enemyArrays.add(e.start);
        Object.values(e.moves || {}).forEach((m) => { if (Array.isArray(m.fx)) enemyArrays.add(m.fx); });
        (e.phases || []).forEach((p) => { if (Array.isArray(p.fx)) enemyArrays.add(p.fx); });
        (e.hooks || []).forEach((h) => { enemyHookObjs.add(h); if (Array.isArray(h.fx)) enemyArrays.add(h.fx); });
      });
    }
    return { arrays: enemyArrays, hooks: enemyHookObjs };
  }
  function enemyState(ctx, on) { const S = makeState(null, ctx); S.enemy = on; return S; }

  function opsText(ops, ctx) {
    const on = !!(ctx && ctx.enemy) || (Array.isArray(ops) && enemyLists().arrays.has(ops));
    return withEnemy(on, () => plainOf(renderOps(ops, enemyState(ctx, on)).join(' ')));
  }
  function hookText(h, ctx) {
    const on = !!(ctx && ctx.enemy) || enemyLists().hooks.has(h) || D.LISTS.enemyHooks.indexOf(h.on) >= 0;
    return withEnemy(on, () => {
      const S = enemyState(ctx, on);
      S.run = RUN_HOOKS.indexOf(h.on) >= 0 || !!(ctx && ctx.run);
      const f = hookFrag(Object.assign({ op: 'hook' }, h), S);
      return f ? plainOf(sentence(f.h)) : '';
    });
  }
  // one enemy move as the bestiary prints it: "Deal 5 damage and apply 1 Vulnerable to the front hero."
  function moveText(m) { return m && Array.isArray(m.fx) ? opsText(m.fx, { enemy: true }) : ''; }

  // ---- gems ----
  function gemModText(m, skipCond) {
    const parts = [];
    const S = makeState(null, null);
    const strip = (h) => plainOf(h);
    if (m.dmg) parts.push(`+${m.dmg} damage`);
    if (m.block) parts.push(`+${m.block} Block`);
    if (m.heal) parts.push(`+${m.heal} healing`);
    if (m.hits) parts.push(`+${m.hits} ${m.hits === 1 ? 'hit' : 'hits'}`);
    if (m.cost) parts.push(`costs ${Math.abs(m.cost)} less`);
    if (m.draw) parts.push(`draw ${m.draw} ${m.draw === 1 ? 'card' : 'cards'}`);
    if (m.energy) parts.push(`gain ${m.energy} Energy`);
    if (m.status) parts.push(strip(joinFrags(fragsOfList([Object.assign({ op: 'status' }, m.status)], S))));
    if (m.poison) parts.push(`apply ${m.poison} Poison`);
    if (m.fx) parts.push(strip(joinFrags(fragsOfList(m.fx, S))));
    list(m.kw).forEach((k) => parts.push(`gains ${k[0].toUpperCase() + k.slice(1)}`));
    list(m.kwRemove).forEach((k) => parts.push(`loses ${k[0].toUpperCase() + k.slice(1)}`));
    let s = parts.join(', ');
    if (m.cond && !skipCond) s = `${m.cond === 'front' ? 'Front' : 'Back'} row: ${s}`;
    return s.replace(/^./, (c) => c.toUpperCase());
  }
  function gemText(x) {
    const g = typeof x === 'string' ? D.gems[x] : x;
    if (!g) return '';
    if (typeof g.text === 'string' && g.text) return g.text;
    return g.mod ? gemModText(g.mod, false) : '';
  }

  function relicText(x) {
    const r = typeof x === 'string' ? D.relics[x] : x;
    return r && r.text ? r.text : '';
  }

  function statusText(id, n) {
    const s = ST[id];
    if (!s) return String(id);
    if (n === undefined || n === null) return `${s.name}: ${s.text}`;
    let t = s.text.replace(/\bN\b/g, String(n));
    if (s.stack === 'dur' && id !== 'stun') t += ` Lasts ${n === 1 ? '1 more round' : n + ' more rounds'}.`;
    return `${s.name} ${n}: ${t}`;
  }

  // ---- intents ----
  // C.intent says who gets a buff, Block, heal or removal (to, blockTo, healTo). Older intent objects (and a Block for another enemy that the intent could
  // not size) reported help for OTHER enemies as help for itself, so the sentence also looks the move up (by id and name) and, when every enemy move
  // of that name agrees, says who really gets the effect.
  const SIDE_WORD = { allEnemies: 'all enemies', otherEnemy: 'another enemy', lowestEnemy: 'the enemy with the lowest HP' };
  function moveSides(it) {
    if (!it || !it.move) return null;
    let found = null, clash = false;
    Object.values(D.enemies).forEach((e) => {
      const m = e.moves && e.moves[it.move];
      if (!m || m.name !== it.name) return;
      const info = { block: null, heal: null, blockN: null, healN: null, status: {} };
      D.walkOps(m.fx || [], (o) => {
        if ((o.op === 'block' || o.op === 'heal') && SIDE_WORD[o.tgt]) { info[o.op] = o.tgt; info[o.op + 'N'] = isNum(o.n) ? o.n : null; }
        if (o.op === 'status' && SIDE_WORD[o.tgt]) info.status[o.s] = o.tgt;
      });
      const key = JSON.stringify(info);
      if (found && found.key !== key) clash = true;
      found = { key, info };
    });
    return found && !clash ? found.info : null;
  }
  const pluralOf = (name, n) => (n > 1 && !/Kodama$/.test(name) ? name + 's' : name);

  function intentText(it) {
    if (!it) return '';
    if (it.stunned) return it.text && it.text !== '' ? it.text : 'Stunned';
    const heroWord = (kind, tgt, taunted) => {
      const names = Array.isArray(tgt) ? tgt.map(HERO_NAME) : [];
      if (taunted && names.length) return names.join(' and ');
      if (kind === 'front') return 'the front hero';
      if (kind === 'back') return 'the back hero';
      if (kind === 'both') return 'both heroes';
      if (kind === 'random' || tgt === 'random') return 'a random hero';
      if (kind === 'lowest') return 'the weakest hero';
      if (names.length === 2) return 'both heroes';
      if (names.length === 1) return names[0];
      return 'the front hero';
    };
    const DEST = { front: 'the front hero', back: 'the back hero', both: 'both heroes', random: 'a random hero', lowest: 'the weakest hero' };
    const sides = moveSides(it);
    // C.intent now says who gets a Block, heal or removal (blockTo, healTo, to): trust it, and fall back to the move lookup for older intent objects
    const blockSide = SIDE_WORD[it.blockTo] ? it.blockTo : it.blockTo === 'self' ? null : sides && sides.block;
    const healSide = SIDE_WORD[it.healTo] ? it.healTo : it.healTo === 'self' ? null : sides && sides.heal;
    const clauses = [];
    let dmgWord = null;
    if (it.dmg !== null && it.dmg !== undefined) {
      dmgWord = heroWord(it.tgtKind, it.tgt, it.taunted);
      clauses.push(`Deals ${it.dmg}${it.hits > 1 ? ` x${it.hits}` : ''} to ${dmgWord}`);
    }
    // what the enemy gives itself: "Gains 12 Block and 6 Thorns"
    const own = [];
    if (it.block && !blockSide) own.push(`${it.block} Block`);
    const others = [];   // "Gives all enemies 1 Ritual"
    if (it.block && blockSide) others.push({ who: SIDE_WORD[blockSide], what: `${it.block} Block` });
    const byDest = [];   // [dest, [items]] in first-seen order
    list(it.statuses).forEach((st) => {
      const item = `${st.n} ${stName(st.s)}`;
      if (st.to === 'self') {
        if (sides && sides.status[st.s]) others.push({ who: SIDE_WORD[sides.status[st.s]], what: item });
        else own.push(item);
      } else if (SIDE_WORD[st.to]) others.push({ who: SIDE_WORD[st.to], what: item });
      else {
        let g = byDest.find((x) => x[0] === (DEST[st.to] || DEST.front));
        if (!g) { g = [DEST[st.to] || DEST.front, []]; byDest.push(g); }
        g[1].push(item);
      }
    });
    if (own.length) clauses.push(`gains ${joinAnd(own)}`);
    byDest.forEach(([dest, items]) => clauses.push(`applies ${joinAnd(items)}${dest === dmgWord ? '' : ` to ${dest}`}`));
    if (!it.block && sides && sides.block && sides.blockN) others.push({ who: SIDE_WORD[sides.block], what: `${sides.blockN} Block` });
    others.forEach((o) => clauses.push(`gives ${o.who} ${o.what}`));
    if (it.heal) clauses.push(healSide ? `heals ${SIDE_WORD[healSide]} for ${it.heal}` : `heals ${it.heal}`);
    // removals: "removes Bloom, Sumi, Ward and Charge from both heroes", "loses its Thorns"
    const rem = [];
    list(it.removes).forEach((r) => {
      const word = r.s === 'buffs' || r.s === 'debuffs' ? `all ${r.s}` : stName(r.s);
      if (r.to === 'self') clauses.push(r.s === 'buffs' || r.s === 'debuffs' ? `removes ${word} from itself` : `loses its ${word}`);
      else if (SIDE_WORD[r.to]) clauses.push(`removes ${word} from ${SIDE_WORD[r.to]}`);
      else { const dest = DEST[r.to] || DEST.front; let g = rem.find((x) => x[0] === dest); if (!g) { g = [dest, []]; rem.push(g); } g[1].push(word); }
    });
    rem.forEach(([dest, items]) => clauses.push(`removes ${joinAnd(items)}${dest === dmgWord ? '' : ` from ${dest}`}`));
    list(it.adds).forEach((a) => {
      const c = D.cards[a.card];
      const nm = (c ? c.name : a.card) + (c && (c.hero === 'curse' || c.hero === 'status') ? ' card' : '');
      clauses.push(`adds ${a.n > 1 ? `${a.n} ${nm}s` : `${aAn(nm)} ${nm}`} to your ${a.to === 'draw' ? 'draw' : 'discard'} pile`);
    });
    list(it.summons).forEach((sm) => { const e = D.enemies[sm.enemy]; const nm = e ? e.name : sm.enemy; clauses.push(`summons ${sm.n > 1 ? `${sm.n} ${pluralOf(nm, sm.n)}` : `${aAn(nm)} ${nm}`}`); });
    if (it.steals) clauses.push(`steals ${it.steals} gold`);
    if (it.swap) clauses.push('swaps your rows');
    if (it.flee) clauses.push('flees');
    if (!clauses.length) return it.name || (it.kind === 'none' ? '' : it.kind || '');
    const first = clauses[0][0].toUpperCase() + clauses[0].slice(1);
    return clauses.length === 1 ? first : joinAnd([first].concat(clauses.slice(1)));
  }

  // ---- rows ----
  function rowText(heroId, row) {
    const h = D.heroes[heroId];
    const label = row === 'front' ? 'Front' : 'Back';
    const r = h && h.rows && h.rows[row];
    if (!r || !Object.keys(r).some((k) => r[k])) return `${label}: no bonus`;
    const parts = [];
    if (r.dmgAdd) parts.push(`${r.dmgAdd > 0 ? '+' : ''}${r.dmgAdd} damage on attacks`);
    if (r.blockAdd) parts.push(`${r.blockAdd > 0 ? '+' : ''}${r.blockAdd} Block on cards`);
    if (r.startBlock) parts.push(`start each turn with ${r.startBlock} Block`);
    if (r.regen) parts.push(`Regen ${r.regen}`);
    if (r.thorns) parts.push(`Thorns ${r.thorns}`);
    if (r.drawAdd) parts.push(`draw ${r.drawAdd} extra ${r.drawAdd === 1 ? 'card' : 'cards'} each turn`);
    return `${label}: ${parts.join(', ')}`;
  }

  Object.assign(D, { resolveCard, cardHtml, cardPlain, opsText, hookText, moveText, gemText, relicText, statusText, intentText, rowText, targetMode, cardOps });
})();
