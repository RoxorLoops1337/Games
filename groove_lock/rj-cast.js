/* RJ cast bundle: the approved RoxorLoops & Jasmin chibi kit from Hocus Vocus (util.js, data.js, art.js, tools/hocus_vocus/rj_art kit.js, roxor.js, jasmin.js, crew.js). Globals: U, DATA, ART, RJ. Usage: RJ.draw(ctx, 'roxor'|'jasmin'|'roxor_monster'|'jasmin_unicorn'|'rawclaw'|'andy'|'jordan', {x, y, s, pose:'idle'|'sing'|'attack'|'hurt'|'cheer', t, flip, expr}); RJ.bust(ctx, id, w, h, o). See the header of the kit section for the full API. */
// Hocus Vocus: shared utilities. Loaded first; every other module may use U.
// Pure helpers only: no game state. DOM helpers touch `document` lazily.
const U = (() => {
  // mulberry32: small, fast, identical everywhere. The closure state is a single
  // uint32, exposed by .seed(), so a stream can be saved and resumed: U.rng(r.seed()).
  // Seed 0 maps to a fixed odd constant so U.rng(0) and U.rng(1) are different streams.
  function rng(seed) {
    let a = (seed >>> 0) || 0x9e3779b9;
    const next = () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));      // inclusive both ends
    next.range = (lo, hi) => lo + next() * (hi - lo);
    next.pick = (arr) => arr[Math.floor(next() * arr.length)];
    next.chance = (p) => next() < p;
    next.shuffle = (arr) => {
      const b = arr.slice();
      for (let i = b.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const t = b[i]; b[i] = b[j]; b[j] = t;
      }
      return b;
    };
    // weighted pick over [[item, weight], ...] or over items with a weight fn
    next.weighted = (entries, wfn) => {
      let total = 0;
      const ws = entries.map((e) => { const w = wfn ? wfn(e) : e[1]; total += Math.max(0, w); return Math.max(0, w); });
      if (total <= 0) return null;
      let r = next() * total;
      for (let i = 0; i < entries.length; i++) { r -= ws[i]; if (r < 0) return wfn ? entries[i] : entries[i][0]; }
      const last = entries[entries.length - 1];
      return wfn ? last : last[0];
    };
    next.sample = (arr, n) => next.shuffle(arr).slice(0, n);
    next.seed = () => a >>> 0;
    return next;
  }

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const inv = (a, b, v) => (a === b ? 0 : (v - a) / (b - a));
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const wrap = (v, n) => ((v % n) + n) % n;
  const ease = {
    linear: (t) => t,
    inQuad: (t) => t * t,
    outQuad: (t) => 1 - (1 - t) * (1 - t),
    inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inCubic: (t) => t * t * t,
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outQuart: (t) => 1 - Math.pow(1 - t, 4),
    outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    outBack: (t) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    inBack: (t) => { const c = 1.70158; return (c + 1) * t * t * t - c * t * t; },
    outElastic: (t) => (t === 0 || t === 1) ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1,
    outBounce: (t) => {
      const n = 7.5625, d = 2.75;
      if (t < 1 / d) return n * t * t;
      if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
      if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
      return n * (t -= 2.625 / d) * t + 0.984375;
    },
  };

  let uidN = 1;
  const uid = () => uidN++;                           // small ints: card instance uids, event ids
  const resetUid = (n) => { uidN = n || 1; };
  const uidPeek = () => uidN;

  // FNV-1a string hash, and a combiner so seeds can be derived: U.hash(seed, 'ch2', 'map').
  const hashStr = (s) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  const hash = (...parts) => hashStr(parts.map(String).join('|'));

  // YYYYMMDD integer for a Date the caller passes in (logic never reads the clock itself: GAME does).
  const dateKey = (d) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();

  const deepCopy = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
  const sum = (arr, f) => arr.reduce((s, x) => s + (f ? f(x) : x), 0);
  const range = (n) => Array.from({ length: n }, (_, i) => i);
  const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
  const fmt = (n) => (Math.round(n * 10) / 10).toString();
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;
  const roman = (n) => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] || String(n);
  const commas = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const mmss = (sec) => { sec = Math.max(0, Math.floor(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); };

  // ---- colour helpers (hex strings in, hex or rgba strings out) ----
  const color = {
    rgb(hex) {
      let h = String(hex).replace('#', '');
      if (h.length === 3) h = h.split('').map((c) => c + c).join('');
      const n = parseInt(h, 16) || 0;
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    },
    hex(r, g, b) {
      const c = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
      return '#' + c(r) + c(g) + c(b);
    },
    rgba(hex, a) { const [r, g, b] = color.rgb(hex); return `rgba(${r},${g},${b},${a})`; },
    mix(h1, h2, t) {
      const a = color.rgb(h1), b = color.rgb(h2);
      return color.hex(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t));
    },
    lighten(hex, t) { return color.mix(hex, '#ffffff', t); },
    darken(hex, t) { return color.mix(hex, '#000000', t); },
    // hue-shifted shadow: darker and pulled toward indigo, the house cel-shading recipe
    shadow(hex, t) { return color.mix(color.darken(hex, (t == null ? 0.35 : t)), '#2a1a6a', 0.28); },
    hsl(h, s, l) {
      h = wrap(h, 360) / 360; s = clamp(s, 0, 1); l = clamp(l, 0, 1);
      const f = (p, q, t) => { t = wrap(t, 1); return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
      if (s === 0) { const v = Math.round(l * 255); return color.hex(v, v, v); }
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
      return color.hex(f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255);
    },
  };

  // ---- seeded value noise (1D / 2D), smooth, deterministic ----
  const noise = (() => {
    const h2 = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    const n2 = (x, y, seed) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = smooth(x - xi), yf = smooth(y - yi), s = seed | 0;
      return lerp(lerp(h2(xi, yi, s), h2(xi + 1, yi, s), xf), lerp(h2(xi, yi + 1, s), h2(xi + 1, yi + 1, s), xf), yf);
    };
    const n1 = (x, seed) => n2(x, 0.5, seed);
    const fbm = (x, y, seed, oct) => { let a = 0.5, f = 1, t = 0; for (let i = 0; i < (oct || 3); i++) { t += a * n2(x * f, y * f, (seed | 0) + i * 31); a *= 0.5; f *= 2; } return t; };
    return { n1, n2, fbm };
  })();

  // ---- tiny event bus ----
  function bus() {
    const m = {};
    return {
      on(t, fn) { (m[t] || (m[t] = [])).push(fn); return () => this.off(t, fn); },
      off(t, fn) { if (m[t]) m[t] = m[t].filter((f) => f !== fn); },
      emit(t, d) { (m[t] || []).slice().forEach((f) => f(d)); (m['*'] || []).slice().forEach((f) => f(t, d)); },
    };
  }

  // ---- DOM helper (browser only, safe to define headless) ----
  // U.el('div', {class:'x', style:{left:'4px'}, dataset:{a:1}, onclick:fn, text:'hi'}, child, 'text')
  function el(tag, props, ...kids) {
    const e = document.createElement(tag);
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k === 'html') e.innerHTML = v;
        else if (k === 'style') { if (typeof v === 'string') e.style.cssText = v; else Object.assign(e.style, v); }
        else if (k === 'dataset') Object.assign(e.dataset, v);
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const c of kids.flat()) if (c != null && c !== false) e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    return e;
  }

  // Escape user-facing text for innerHTML
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  return { rng, clamp, lerp, inv, smooth, wrap, ease, uid, resetUid, uidPeek, hashStr, hash, dateKey, deepCopy, sum, range, dist, fmt, cap, plural, roman, commas, mmss, color, noise, bus, el, esc };
})();

// Hocus Vocus data core: registries, closed vocabularies, statuses, keywords,
// economy, heroes, Spells (`brushes`), tiles, the fixed roster, quotas, and the validator.
//
// This file is the machine-readable half of the contract (DESIGN.md is the human
// half, CONTENT_SPEC.md says how much and how strong). Content files
// (data_cards_*.js, data_enemies_*.js, ...) are IIFEs that register into the
// registries below with DATA.add(kind, defs). Nothing here touches the DOM, the
// clock or the banned random call. No em or en dashes.
//
// PUBLIC API
//   Registries   DATA.cards gems relics enemies events achievements trials tips lore
//                DATA.encounters {1|2|3: {normal:[group], elite:[group], boss:'id'}}
//                DATA.heroes brushes tiles statuses keywords ECONOMY SETTINGS LISTS
//                DATA.LINKS (frozen: handle website youtube facebook tiktok instagram support game; empty URL = no button, HV_STORY 5.2)
//                DATA.ROSTER {1|2|3: [{id,name,title?,tier,size,role,chapter}]}, DATA.rosterById
//                DATA.FIXED (ids other modules depend on), DATA.QUOTA, DATA.GUIDE
//                DATA.COLOUR_NAME {colour id: display word} (red reads pink, any reads rainbow)
//   Writing      DATA.add(kind, defs)              defs is an OBJECT KEYED BY ID (an array throws), except
//                                                  kind 'tips' which takes a string or an array of strings
//                DATA.addEncounters(ch, {normal, elite, boss})
//   Lookups      hero(id) card(id) cardsBy({hero,rarity,type}) enemyIds(ch, tier) groupById(id)
//                isStatus(id) isDebuff(id) isBuff(id) isUnlocked(kind, id, unlocked)
//                rewardPool(heroId, rarity, unlocked) relicPool(rarity, unlocked, heroIds)
//                gemPool({tier,color}, unlocked) eligibleGroups(ch, 'normal'|'elite', diff)
//                walkOps(ops, fn)                  visits every op, through cond/repeat/hook nesting
//   Mods         foldMods([deltaObj...]) -> final flat mods     trialDeltas(level) -> summed deltas
//                modsFor(relicIds, trialLevelOrDeltas) -> final flat mods (what RUN.mods(R) returns: modsFor(R.relics, R.mods))
//                rowFor(heroId, row, relicIds) -> merged row bonuses (hero row plus relic `rows`)
//   Misc         tileCount(type, nonBlock)   cleanSetting(key, value)   ratio helpers for tests
//   Checking     validate(only?, opt?) -> {errors, warnings, counts}
//                  opt.strict  also check every cross-file reference and that fixed content exists
//                  opt.hero    limit the card check to one hero id (or 'shared' for curse/status cards)
//                  opt.chapter limit the enemy check to one Act
//                audit(kind?, opt?) -> [string]   quota and guideline breaks ('audit ...' hard, 'guide ...' soft)
//
// RUN OPS (events and run hooks). Unknown fields are validator errors. `who` (heal hurt maxHp) is
// 'both' (default) | 'front' | 'lowest' | 'random' | a hero id of the party.
//   gold {n | pct}            n may be negative (a cost, floors at 0); pct is a fraction of current gold, floored
//   ink {n | pct}             Vox: result clamped to 0..inkMax; pct is a fraction of inkMax
//   heal {n | pct, who?}      pct is a fraction of that hero's maxHp; scaled by mods.healMul
//   hurt {n | pct, who?}      never kills: leaves at least 1 HP
//   maxHp {n, who?}           raises max and current HP by n; negative n lowers max, never below 1
//   addCard {card | pool, rarity?, n?=1, up?}   pool 'party' or a hero id: random unlocked non-token card
//   removeCard upgradeCard transformCard duplicateCard {n?=1, random?, filter?:{type,hero}}
//                             default: the player picks in the deck overlay (a `pending` entry); random:true uses the RNG.
//                             transformCard yields a random card of the same hero and rarity
//   addRelic {id | rarity}    rarity draws an unowned, unlocked relic     addGem {id | color?, tier?}
//   addBrush {id}             a Spell id or 'random'                      addCurse {id?, n?=1} a curse_* id, omitted = random
//   fight {enc | enemies:[ids], tier?='normal'|'elite', rewards?=true, win?:[run ops]}   LAST op of its outcome
//   flag {k, v?=1}            R.flags[k] = v            paint {n}   paints n hexes free along the cheapest chain to the boss
//   cardReward {rarity?, hero?, n?=3}   a skippable card pick like a combat reward
// Event choice `req` keys: gold hpPct hpBelow relic flag hero chapter. Event `when` keys: flag relic hero.
const DATA = (() => {
  // ------------------------------------------------------------------
  // Closed vocabularies. Content may only use ids from these lists.
  // ------------------------------------------------------------------
  const LISTS = {
    heroIds: ['hanae', 'kuro', 'suzu', 'raiga'],
    cardTypes: ['attack', 'skill', 'power', 'curse', 'status'],
    rarities: ['starter', 'common', 'uncommon', 'rare', 'token'],   // token: generated in combat, never a reward
    cardKw: ['exhaust', 'retain', 'innate', 'ethereal', 'unplayable'],
    slotColors: ['red', 'blue', 'green', 'gold', 'any'],
    gemColors: ['red', 'blue', 'green', 'gold'],
    gemCuts: ['round', 'oval', 'square', 'drop', 'star'],
    relicRarities: ['common', 'uncommon', 'rare', 'boss', 'shop'],
    chapters: [1, 2, 3],
    tiers: ['minion', 'normal', 'elite', 'boss'],
    sizes: ['s', 'm', 'l', 'xl'],
    enemyTags: ['spirit', 'beast', 'folk', 'undead', 'construct', 'insect', 'avian', 'aquatic', 'void'],
    elements: ['slash', 'fire', 'ice', 'lightning', 'ink', 'poison', 'holy'],

    // ops usable in each context (DESIGN 4.4)
    cardOps: ['dmg', 'block', 'heal', 'status', 'removeStatus', 'draw', 'energy', 'pick', 'add', 'swap', 'hurt', 'cond', 'repeat', 'gold', 'ink', 'maxHp', 'revive', 'hook'],
    hookOps: ['dmg', 'block', 'heal', 'status', 'removeStatus', 'draw', 'energy', 'add', 'hurt', 'cond', 'gold', 'ink', 'maxHp', 'revive'],
    enemyOps: ['dmg', 'block', 'heal', 'status', 'removeStatus', 'add', 'summon', 'swap', 'cond', 'stealGold', 'flee'],
    runOps: ['gold', 'ink', 'heal', 'hurt', 'maxHp', 'addCard', 'removeCard', 'upgradeCard', 'transformCard', 'duplicateCard', 'addRelic', 'addGem', 'addBrush', 'addCurse', 'fight', 'flag', 'paint', 'cardReward'],

    // target vocabularies
    cardTgt: ['enemy', 'all', 'random', 'lowest', 'others', 'self', 'ally', 'both', 'front', 'back'],
    enemyCardTgt: ['enemy', 'all', 'random', 'lowest', 'others'],         // card and hook ops aimed at enemies
    heroTgt: ['self', 'ally', 'both', 'front', 'back'],                   // card and hook ops aimed at heroes
    enemyHeroTgt: ['front', 'back', 'both', 'random', 'lowest'],          // enemy ops aimed at heroes
    enemySelfTgt: ['self', 'allEnemies', 'otherEnemy', 'lowestEnemy'],    // enemy ops aimed at enemies

    // value expression: number, or {base, per, mul, s, who, cap, min, upTo}
    per: ['X', 'handSize', 'drawPile', 'discardPile', 'exhaustPile', 'cardsPlayed', 'attacksPlayed', 'skillsPlayed',
      'energy', 'block', 'missingHp', 'hp', 'status', 'debuffs', 'enemies', 'kills', 'turn', 'gems', 'front',
      'damageTaken', 'hitsTaken', 'targetBlock', 'picked'],
    perEnemy: ['turn', 'enemies', 'status', 'hp', 'missingHp', 'block', 'debuffs', 'handSize', 'drawPile', 'discardPile'],
    perWho: ['self', 'ally', 'target', 'enemy'],
    perWhoEnemy: ['self', 'target'],
    perWhoPer: ['status', 'block', 'hp', 'missingHp', 'debuffs'],         // the only counters that take `who`
    // conditions for the `cond` op and enemy AI rules
    cond: ['row', 'status', 'hpPct', 'handEmpty', 'cardsPlayed', 'attacksPlayed', 'turn', 'lastKill', 'targetStatus',
      'allyDown', 'block', 'energy', 'handSize', 'enemies'],
    condEnemy: ['status', 'hpPct', 'block', 'turn', 'enemies'],
    aiCond: ['hpLt', 'hpGt', 'turnGte', 'turnEvery', 'alone', 'minions', 'heroStatus', 'heroDown', 'allyHpLt', 'heroHpLt'],
    intents: ['attack', 'multi', 'heavy', 'defend', 'buff', 'debuff', 'summon', 'heal', 'special', 'flee', 'none'],

    // hooks
    combatHooks: ['combatStart', 'combatEnd', 'turnStart', 'turnEnd', 'onPlay', 'onDamaged', 'onKill', 'onSwap', 'onHeroDown', 'onShuffle', 'onExhaust'],
    runHooks: ['onPickup', 'onChapterStart', 'onRest', 'onPaint', 'onFightWon', 'onShopEnter'],
    enemyHooks: ['onDeath', 'onHurt', 'onAllyDeath', 'onHeroPlay'],
    hookFilter: ['type', 'hero', 'cost', 'kw', 'tier', 'gems'],
    cardPickFrom: ['hand', 'draw', 'discard', 'exhaust'],
    cardPickThen: ['discard', 'exhaust', 'retain', 'upgrade', 'toHand', 'toDrawTop', 'copy'],
    pickPairs: { hand: ['discard', 'exhaust', 'retain', 'upgrade', 'copy'], draw: ['toHand', 'discard', 'exhaust', 'toDrawTop'], discard: ['toHand', 'toDrawTop', 'exhaust', 'upgrade'], exhaust: ['toHand', 'toDrawTop'] },
    addTo: ['hand', 'draw', 'discard', 'exhaust'],                        // card and hook `add`
    addToEnemy: ['draw', 'discard'],                                      // enemy `add`

    // Mods (DESIGN 4.7). Every key is an ADDITIVE DELTA. 'int' keys add whole numbers to a base,
    // 'frac' keys are fractions (0.25 = x1.25, -0.25 = x0.75) folded as max(0.1, 1 + sum).
    mods: ['energy', 'hand', 'startBlock', 'inkMax', 'startInk', 'wellInk', 'cardChoices', 'freeSwaps', 'campActions', 'rareBoost', 'goldMul', 'priceMul', 'healMul'],
    modKind: { energy: 'int', hand: 'int', startBlock: 'int', inkMax: 'int', startInk: 'int', wellInk: 'int', cardChoices: 'int', freeSwaps: 'int', campActions: 'int', rareBoost: 'int', goldMul: 'frac', priceMul: 'frac', healMul: 'frac' },
    trialMods: ['enemyHp', 'eliteHp', 'bossHp', 'enemyDmg', 'goldMul', 'priceMul', 'healMul', 'reviveFrac', 'startInk', 'startGold', 'wellInk', 'cardChoices', 'curses'],
    trialModKind: { enemyHp: 'frac', eliteHp: 'frac', bossHp: 'frac', enemyDmg: 'frac', goldMul: 'frac', priceMul: 'frac', healMul: 'frac', reviveFrac: 'frac', startInk: 'int', startGold: 'int', wellInk: 'int', cardChoices: 'int', curses: 'int' },
    rowFields: ['dmgAdd', 'blockAdd', 'startBlock', 'regen', 'thorns', 'drawAdd'],
    gemModKeys: ['dmg', 'block', 'heal', 'hits', 'cost', 'draw', 'energy', 'poison', 'status', 'fx', 'kw', 'kwRemove', 'cond'],

    // Stat counters tracked per run in R.stats and per profile in META (definitions: DESIGN 4.10).
    // statMax keys merge with max(), every other key adds. Achievements read these.
    statKeys: ['runs', 'wins', 'deaths', 'kills', 'elites', 'bossKills', 'boss1Kills', 'boss2Kills', 'boss3Kills',
      'cardsPlayed', 'attacksPlayed', 'damageDealt', 'damageTaken', 'blockGained', 'maxHit', 'maxTurnDamage', 'turns',
      'hexesPainted', 'brushesUsed', 'wellsDrunk', 'chestsOpened', 'shopsVisited', 'goldEarned', 'goldSpent', 'purchases',
      'campRests', 'upgrades', 'gemsSocketed', 'relicsFound', 'eventsSeen', 'curseCards', 'swaps', 'heroDowns', 'revives',
      'flawlessBosses', 'maxDeck', 'smallDeckWins', 'trialBest', 'dailyRuns', 'winsHanae', 'winsKuro', 'winsSuzu', 'winsRaiga',
      'poisonKills', 'burnKills', 'thornKills', 'multiHitTurns', 'zeroCostTurns', 'mercy'],
    statMax: ['maxHit', 'maxTurnDamage', 'maxDeck', 'trialBest'],

    // events
    reqKeys: ['gold', 'hpPct', 'hpBelow', 'relic', 'flag', 'hero', 'chapter'],
    whenKeys: ['flag', 'relic', 'hero'],
    runWho: ['both', 'front', 'lowest', 'random', 'hanae', 'kuro', 'suzu', 'raiga'],

    // map
    tiles: ['start', 'empty', 'block', 'enemy', 'elite', 'boss', 'chest', 'shop', 'camp', 'event', 'well', 'brush', 'gemcache', 'forge'],
    landmarks: ['boss', 'shop', 'camp', 'forge', 'elite', 'chest'],       // visible as dim silhouettes in the fog
    brushKinds: ['line', 'fan', 'blob', 'ring', 'dot'],

    // combat events COMBAT emits (payloads: DESIGN 5.2) and the UI bus (DESIGN 5.8)
    combatEvents: ['combat_start', 'turn_start', 'turn_end', 'draw', 'shuffle', 'discard', 'exhaust', 'add_card', 'card_move',
      'card_upgrade', 'retain', 'energy', 'play', 'hit', 'dodge', 'thorns', 'block', 'block_lost', 'heal', 'hurt', 'status',
      'immune', 'swap', 'intent', 'enemy_act', 'skip', 'summon', 'enemy_phase', 'death', 'flee', 'hero_down', 'hero_revive',
      'pick_needed', 'relic', 'gold', 'ink', 'max_hp', 'end'],
    busEvents: ['screen', 'overlay', 'combat:turn', 'combat:select', 'combat:play', 'combat:endturn', 'combat:swap', 'combat:pick',
      'combat:end', 'map:paint', 'map:brush', 'map:walk'],
    tutAnchors: ['hand', 'energy', 'endturn', 'swap', 'intent', 'enemy', 'ink', 'hex', 'brushes', 'deck', 'relics'],

    // screens and overlays (closed; DESIGN 5.11)
    screens: ['title', 'heroSelect', 'library', 'settings', 'howto', 'story', 'map', 'combat', 'reward', 'shop', 'event', 'camp', 'forge', 'chest',
      'gemcache', 'chapterClear', 'gameOver', 'victory'],
    overlays: ['deck', 'pause', 'settings', 'relics', 'legend', 'cardPick', 'confirm', 'modal'],
    libraryTabs: ['unlocks', 'achievements', 'story', 'bestiary', 'history', 'follow'],   // follow (the sixth Tour Bus tab, key 6) is appended LAST (HV_STORY 5.3)

    // presentation vocab (art and audio agents implement exactly these)
    scenes: ['title', 'ch1', 'ch2', 'ch3', 'boss1', 'boss2', 'boss3', 'camp', 'shop', 'event', 'treasure', 'victory', 'defeat', 'paper'],
    palettes: ['rose', 'crimson', 'amber', 'gold', 'jade', 'teal', 'azure', 'indigo', 'violet', 'ink', 'moon', 'ash'],
    poses: ['idle', 'attack', 'cast', 'hurt', 'block', 'down', 'cheer', 'walk'],
    enemyPoses: ['idle', 'attack', 'hurt', 'block', 'buff', 'die', 'telegraph'],
    expressions: ['neutral', 'smile', 'angry', 'hurt', 'determined'],
    motifs: ['slash', 'cross_slash', 'thrust', 'crescent', 'iai', 'petals', 'bloom', 'petal_storm', 'wind', 'shield', 'barrier',
      'talisman', 'lotus', 'moon', 'sun', 'star', 'lightning', 'thunder_fist', 'chain_lightning', 'fire', 'flame_orb', 'ice',
      'ink_splash', 'ink_wave', 'brush_stroke', 'calligraphy', 'scroll', 'eye', 'mask', 'fan', 'bell', 'lantern', 'koi',
      'dragon', 'tiger', 'crane', 'fox', 'web', 'thorns', 'poison_bloom', 'skull', 'heal_light', 'spirit_orb', 'torii',
      'mirror', 'sword_rain', 'meteor', 'wave', 'tornado', 'quake', 'fist', 'kick', 'arrow', 'coin', 'key', 'book', 'quill',
      'void', 'sigil'],
    relicIcons: ['lantern', 'mask', 'fan', 'bell', 'key', 'scroll', 'coin', 'jar', 'geta', 'kasa', 'incense', 'mirror', 'comb',
      'dice', 'drum', 'flute', 'brush', 'inkstone', 'seal', 'umbrella', 'charm', 'riceball', 'teacup', 'koi', 'feather', 'crown',
      'hourglass', 'compass', 'candle', 'ribbon', 'sword', 'katana_guard', 'bow', 'beads', 'gourd', 'lotus', 'moon', 'sun', 'star',
      'dragon', 'tiger', 'crane', 'fox', 'skull', 'eye', 'heart', 'tooth', 'shell', 'bamboo', 'plum', 'maple', 'shrine', 'bridge',
      'petal', 'flame', 'snowflake', 'bolt', 'ink_drop'],
    // ART.fx.NAME(ctx, o, t): exactly these 24 (DESIGN 5.6)
    fx: ['slash', 'cross', 'thrust', 'burst', 'ring', 'inkSplash', 'petals', 'lightning', 'chain', 'flame', 'frost', 'poison', 'shield',
      'heal', 'buff', 'debuff', 'sparkle', 'speedLines', 'impactFrame', 'sfxText', 'vignette', 'chromatic', 'brushDrag', 'numberPop'],
    iconKinds: ['status', 'relic', 'gem', 'tile', 'intent', 'stat', 'brush', 'type', 'row', 'motif'],
    statIcons: ['gold', 'ink', 'hp', 'energy', 'brush', 'inkstone', 'block'],
    mapKinds: ['fog', 'known', 'ground', 'block', 'painted', 'edge', 'path', 'hover', 'target'],
    sizeHeight: { s: 110, m: 170, l: 250, xl: 340 },                      // nominal enemy height at s=1 (px)
    cardSizes: { mini: [72, 100], deck: [168, 235], hand: [190, 266], reward: [240, 336], big: [300, 420] },   // UI.card sizes, stage px, all 5:7
    sfx: ['ui_click', 'ui_hover', 'ui_back', 'ui_error', 'ui_open', 'ui_close', 'ui_toggle',
      'card_draw', 'card_hover', 'card_pick', 'card_play_attack', 'card_play_skill', 'card_play_power', 'card_discard', 'card_exhaust', 'shuffle',
      'swap', 'energy_gain', 'turn_start', 'turn_end', 'enemy_turn',
      'hit_light', 'hit_heavy', 'hit_crit', 'hit_multi', 'slash', 'thud', 'zap', 'flame', 'ice', 'poison_tick', 'thorn', 'dodge',
      'block_gain', 'block_hit', 'block_break', 'heal', 'buff', 'debuff', 'stun',
      'enemy_die', 'hero_down', 'hero_revive', 'boss_die', 'boss_intro', 'phase_change',
      'paint', 'ink_splash', 'brush_pick', 'brush_use', 'step', 'reveal_landmark', 'ink_gain', 'well',
      'gold', 'buy', 'chest_open', 'relic_get', 'gem_socket', 'gem_get', 'forge_hit', 'upgrade', 'camp_fire', 'rest', 'event_open', 'choice',
      'page_turn', 'level_up', 'victory', 'defeat', 'achievement', 'unlock', 'save'],
    music: ['title', 'hero_select', 'map1', 'map2', 'map3', 'combat1', 'combat2', 'combat3', 'elite', 'boss1', 'boss2', 'boss3', 'final',
      'shop', 'camp', 'event', 'reward', 'victory', 'defeat'],
  };

  // ------------------------------------------------------------------
  // The duo's links (HV_STORY 5.2, bible 7.2). It lives here because DATA loads first, so every screen and ui.js can read it.
  // The owners fill in the URLs; an empty string hides that button. Opened only on a tap, in a new tab; never fetched.
  // When a URL is filled in, its line needs the pragma, for example:
  //   website: 'https://example.org/',  // hygiene-allow(network): owner link, opened only on a tap, never fetched
  // The keys are exactly handle website youtube facebook tiktok instagram support game (the hygiene suite pins them).
  // ------------------------------------------------------------------
  const LINKS = Object.freeze({
    handle: '@roxorloopsandjasmin',
    website: '',
    youtube: '',
    facebook: '',
    tiktok: '',
    instagram: '',
    support: '',
    game: '',   // the public game address used by Share; empty means the current page address without query or hash
  });

  // ------------------------------------------------------------------
  // Statuses. Semantics are implemented by COMBAT (DESIGN 4.2); text is what the UI shows.
  // stack: 'int' = intensity (numbers add), 'dur' = duration in rounds (numbers add).
  // resource statuses are inert: cards, passives and relics read and spend them.
  // ------------------------------------------------------------------
  const statuses = {
    might:      { id: 'might', name: 'Volume', kind: 'buff', stack: 'int', text: 'Attacks deal +N damage per hit.' },
    bulwark:    { id: 'bulwark', name: 'Soundproof', kind: 'buff', stack: 'int', text: 'Gain +N extra Block whenever you gain Block from a card.' },
    regen:      { id: 'regen', name: 'Warm Tea', kind: 'buff', stack: 'int', text: 'At the start of its turn, heal N, then Warm Tea falls by 1.' },
    thorns:     { id: 'thorns', name: 'Feedback', kind: 'buff', stack: 'int', text: 'Whenever it is hit by an attack, the attacker takes N damage.' },
    dodge:      { id: 'dodge', name: 'Shimmy', kind: 'buff', stack: 'int', text: 'Shimmies out of the next N attack hits completely.' },
    taunt:      { id: 'taunt', name: 'Spotlight', kind: 'buff', stack: 'dur', text: 'Enemy attacks that would strike the backing hero, or a random or lowest hero, hit this hero instead.' },
    ritual:     { id: 'ritual', name: 'Crescendo', kind: 'buff', stack: 'int', text: 'At the start of its turn, gain N Volume.' },
    plating:    { id: 'plating', name: 'Sequins', kind: 'buff', stack: 'int', text: 'At the start of its turn, gain N Block.' },
    bloom:      { id: 'bloom', name: 'Bloom', kind: 'resource', stack: 'int', hero: 'hanae', text: 'Jasmin\'s blossoms. Built by her sung attacks, spent by her finishers.' },
    sumi:       { id: 'sumi', name: 'Groove', kind: 'resource', stack: 'int', hero: 'kuro', text: 'RoxorLoops\'s groove. Built layer by layer with his skills, dropped in his big beats.' },
    ward:       { id: 'ward', name: 'Reverb', kind: 'resource', stack: 'int', hero: 'suzu', text: 'RawClaw\'s reverb. It builds every turn, and he spends it to wrap the band in sound.' },
    charge:     { id: 'charge', name: 'Rumble', kind: 'resource', stack: 'int', hero: 'raiga', text: 'Andy\'s low end. Built by taking hits and striking, released as thunder from below.' },
    vulnerable: { id: 'vulnerable', name: 'Exposed', kind: 'debuff', stack: 'dur', text: 'Takes 50% more attack damage.' },
    weak:       { id: 'weak', name: 'Muffled', kind: 'debuff', stack: 'dur', text: 'Deals 25% less attack damage.' },
    frail:      { id: 'frail', name: 'Wobbly', kind: 'debuff', stack: 'dur', text: 'Gains 25% less Block from cards.' },
    poison:     { id: 'poison', name: 'Earworm', kind: 'debuff', stack: 'int', text: 'At the start of its turn, lose N HP (ignores Block), then Earworm falls by 1.' },
    burn:       { id: 'burn', name: 'Sizzle', kind: 'debuff', stack: 'int', text: 'At the end of the round, take N damage (ignores Block), then Sizzle halves.' },
    stun:       { id: 'stun', name: 'Starstruck', kind: 'debuff', stack: 'dur', text: 'Skips its next action. A starstruck hero cannot play cards on their next turn.' },
    bind:       { id: 'bind', name: 'Tangled', kind: 'debuff', stack: 'dur', text: 'While either hero is Tangled, neither hero can swap spots.' },
    mark:       { id: 'mark', name: 'Tag', kind: 'debuff', stack: 'int', text: 'The next N attack hits against it deal +3 damage each (one stack per hit).' },
  };

  // Glossary shown in tooltips. Keys are the words the UI highlights in card text.
  const keywords = {
    block: { name: 'Block', text: 'Absorbs damage this turn. Wears off at the start of the owner\'s next turn.' },
    exhaust: { name: 'Fade', text: 'Fades out of the fight after it is played. It returns next combat.' },
    retain: { name: 'Hold', text: 'Stays in your hand at the end of the turn.' },
    innate: { name: 'Opener', text: 'Always in your opening hand.' },
    ethereal: { name: 'One Take', text: 'Fades if it is still in your hand at the end of the turn.' },
    unplayable: { name: 'Unplayable', text: 'Cannot be played.' },
    front: { name: 'Lead', text: 'The lead hero takes most enemy attacks. A card line starting Lead: only works while its hero stands here.' },
    back: { name: 'Backing', text: 'The backing hero is safe from most enemy attacks. A card line starting Backing: only works while its hero stands here.' },
    swap: { name: 'Swap', text: 'Trade spots. One swap per turn is free, more cost 1 Breath.' },
    ink: { name: 'Vox', text: 'Spend Vox on the map to unmute a hex and reveal it.' },
    brush: { name: 'Spell', text: 'A one-use Spell that unmutes a shape of hexes for free.' },
    gem: { name: 'Gem', text: 'Socket gems into card slots. A slot only accepts its own colour, rainbow slots accept any.' },
    slot: { name: 'Gem slot', text: 'Colour-matched socket. Gems change how the card plays.' },
    prism: { name: 'Rainbow slot', text: 'A rainbow slot accepts a gem of any colour.' },
    xcost: { name: 'X cost', text: 'Spends all your remaining Breath. The card reads X as the Breath spent.' },
    down: { name: 'Voiceless', text: 'A hero at 0 HP loses their voice: their cards clog your hand and they cannot be targeted. If both heroes lose their voice, the tour ends.' },
  };

  // ------------------------------------------------------------------
  // Economy: every tunable number in one place. RUN, MAP and COMBAT read these.
  // ------------------------------------------------------------------
  const ECONOMY = {
    energy: 3, handSize: 5, maxHand: 10, freeSwaps: 1, swapCost: 1,
    startGold: 60, startInk: 10, inkMax: 14, paintCost: 1,
    wellInk: 4, campInk: 4,
    killInk: { minion: 0, normal: 1, elite: 2, boss: 0 },
    gold: { normal: [14, 22], elite: [30, 44], boss: [70, 90], chest: [45, 75] },
    cardChoices: 3,
    // rarity weights (percent) for card rewards. rare weight = base.rare + min(rareOffset, rareOffsetCap) + mods.rareBoost,
    // moved from common. rareOffset rises by 1 after each normal or elite reward that offered no rare, resets when a rare is taken.
    rarity: {
      normal: { common: 62, uncommon: 33, rare: 5 },
      elite: { common: 45, uncommon: 40, rare: 15 },
      boss: { common: 0, uncommon: 0, rare: 100 },
      shop: { common: 55, uncommon: 35, rare: 10 },
    },
    rareOffsetCap: 40,
    relicWeights: { elite: { common: 50, uncommon: 40, rare: 10 }, chest: { common: 45, uncommon: 40, rare: 15 }, shop: { common: 40, uncommon: 40, rare: 20 } },
    price: { card: { common: 50, uncommon: 80, rare: 150 }, relic: { common: 140, uncommon: 190, rare: 260, shop: 160 }, gem: { 1: 60, 2: 110, 3: 180 }, remove: 75, removeStep: 25, brush: 45, saleFrac: 0.5 },
    shop: { cards: 5, gems: 2, relics: 3, brushes: 1 },
    camp: { restPct: 0.35 },
    chapterEnd: { healPct: 0.30, maxHp: 8 },
    reviveFrac: 0.25,                 // downed heroes revive at this fraction of max HP when a fight is won
    // Map generation. Layout: pointy-top odd-r offset, column = q + floor(r / 2). Start sits in column startCol and the
    // boss in column bossCol, so MAP.solve(M).minInk (paints from the edge of the start ring to the boss, boss hex
    // included) has the floor bossCol - startCol - startRing = 16. solve.min/max are what the map tests assert.
    map: { cols: 21, rows: 13, hexSize: 46, blockFrac: 0.12, startRing: 2, startCol: 1, bossCol: 19, solve: { min: 16, max: 22 }, wells: { count: 3, within: 3 } },
    // dist = target fraction of non-block hexes; the final count is clamp(round(fraction * nonBlock), countMin, countMax).
    dist: { enemy: 0.22, elite: 0.022, chest: 0.03, shop: 0.02, camp: 0.025, event: 0.09, well: 0.05, brush: 0.025, gemcache: 0.02, forge: 0.015 },
    countMin: { elite: 3, chest: 3, shop: 2, camp: 3, event: 8, well: 6, brush: 2, gemcache: 2, forge: 2 },
    countMax: { elite: 7, chest: 10, shop: 6, camp: 8, event: 26, well: 16, brush: 8, gemcache: 6, forge: 6 },
    // The Tour Bus (`library`: Cheers prices) and the Cheers payout per run (`inkstones`; META.recordRun, DESIGN 4.10).
    library: { card: { uncommon: 60, rare: 120 }, relic: { common: 40, uncommon: 70, rare: 110, boss: 110, shop: 90 }, gem: { 2: 80, 3: 140 } },
    inkstones: { perChapter: 4, win: 15, perTrial: 3, scoreDiv: 60, dailyMul: 0.5, abandonMul: 0.5 },
    // RUN.score(R) = max(0, chapter*chaptersCleared + boss*bossKills + elite*elites + floor(gold/goldDiv) + maxHp*sum(maxHp)
    //   + upgraded*upgradedCards + gemSlot*filledGemSlots + curse*curseCards - floor(turns/turnDiv))   (curse is negative)
    score: { chapter: 100, boss: 60, elite: 15, goldDiv: 10, maxHp: 2, upgraded: 2, gemSlot: 3, curse: -5, turnDiv: 2 },
  };

  // Settings domains and defaults (META stores them, UI.applySettings reads them, DESIGN 5.5).
  const SETTINGS = {
    musicVol: { def: 0.7, min: 0, max: 1 },
    sfxVol: { def: 0.8, min: 0, max: 1 },
    shake: { def: 1, min: 0, max: 1 },
    reduceMotion: { def: null, values: [null, true, false] },       // null = follow prefers-reduced-motion
    textScale: { def: 1, values: [1, 1.15, 1.3] },
    fastAnim: { def: 0, values: [0, 1, 2] },                         // 0 normal, 1 = x1.6, 2 = x2.5
    damageNumbers: { def: true, values: [true, false] },
    colorblind: { def: false, values: [false, true] },
    quality: { def: 'auto', values: ['auto', 'high', 'low'] },
    hints: { def: true, values: [true, false] },
  };

  // ------------------------------------------------------------------
  // Spells (`brushes`): one-use map tools. MAP.brushCells implements the geometry (DESIGN 4.8).
  // ------------------------------------------------------------------
  const brushes = {
    stroke: { id: 'stroke', name: 'Boots and Cats', kind: 'line', len: 3, text: 'Unmute 3 hexes in a straight line, starting next to any live hex.' },
    wave:   { id: 'wave', name: 'Vocal Run', kind: 'line', len: 5, text: 'Unmute 5 hexes in a straight line, starting next to any live hex.' },
    fan:    { id: 'fan', name: 'Air Horn', kind: 'fan', text: 'Unmute a wedge of 3 hexes next to a live hex.' },
    splash: { id: 'splash', name: 'Abracadabass', kind: 'blob', text: 'Unmute a hex next to the live ground and the 6 hexes around it.' },
    halo:   { id: 'halo', name: 'Surround Sound', kind: 'ring', text: 'Unmute all 6 hexes around any live hex.' },
    blot:   { id: 'blot', name: 'Hocus Focus', kind: 'dot', text: 'Unmute any one hex within 4 of the party.' },
  };

  // Map tile presentation names (icons come from ART.icon 'tile').
  const tiles = {
    start: { name: 'Soundcheck', text: 'Where the tour begins.' },
    empty: { name: 'Path', text: 'Open ground.' },
    block: { name: 'Blur', text: 'A patch the Gloss smoothed away. Nothing can cross it.' },
    enemy: { name: 'Face-Off', text: 'A creature of the Gloss blocks the way.' },
    elite: { name: 'Rival', text: 'A rival act guarding a Charm.' },
    boss: { name: 'Headliner', text: 'The headliner of this act.' },
    chest: { name: 'Gift Box', text: 'A gift from a fan. Charms, gold or gems.' },
    shop: { name: 'Merch Stall', text: 'Jordan sells cards, Charms, gems and a Spell.' },
    camp: { name: 'Green Room', text: 'Rest, rehearse or warm up.' },
    event: { name: 'Detour', text: 'Something unexpected is happening.' },
    well: { name: 'Tea Stall', text: 'Sip a warm ginger tea to refill your Vox.' },
    brush: { name: 'Busker', text: 'A street busker teaches you a one-use Spell.' },
    gemcache: { name: 'Sparkle Booth', text: 'Choose a gem.' },
    forge: { name: 'Studio', text: 'Rehearse one card, or set gems.' },
  };

  // ------------------------------------------------------------------
  // Heroes. Rows: the bonus a hero gets while standing in that row.
  // passives use the hook DSL (same shape as relic hooks) and are OWNED by the hero:
  // they fire only for that hero's own events. Starter card ids are a promise: the
  // hero's card file MUST define each of them.
  // ------------------------------------------------------------------
  const heroes = {
    hanae: {
      id: 'hanae', name: 'Jasmin', title: 'The Blossom Voice', prefer: 'front', res: 'bloom',
      color: '#ff7eb6', accent: '#fff4f8', dark: '#b0245c', maxHp: 84,
      blurb: 'A soft, smooth singer whose vocal runs land like falling petals. She never shouts, and every note she sings blooms a little brighter.',
      rows: { front: { dmgAdd: 2 }, back: { blockAdd: 1 } },
      passives: [{ id: 'blade_flow', name: 'Every Note Blooms', on: 'onPlay', filter: { type: 'attack' }, limit: 1, fx: [{ op: 'status', s: 'bloom', n: 1, tgt: 'self' }] }],
      starter: ['hanae_slash', 'hanae_slash', 'hanae_parry', 'hanae_parry', 'hanae_petal_step'],
      unlock: null,
    },
    kuro: {
      id: 'kuro', name: 'RoxorLoops', title: 'The Beatbox Wizard', prefer: 'back', res: 'sumi',
      color: '#3fcf6a', accent: '#c6ff3d', dark: '#0f3a1e', maxHp: 68,
      blurb: 'A beatboxer who plays a whole band with one mouth. He keeps the groove from the back, and his beats get stuck in every enemy\'s head.',
      rows: { back: { dmgAdd: 2 }, front: { blockAdd: 0 } },
      passives: [{ id: 'steady_hand', name: 'In the Pocket', on: 'onPlay', filter: { type: 'skill' }, limit: 1, fx: [{ op: 'status', s: 'sumi', n: 1, tgt: 'self' }] }],
      starter: ['kuro_ink_bolt', 'kuro_ink_bolt', 'kuro_ink_ward', 'kuro_ink_ward', 'kuro_first_stroke'],
      unlock: null,
    },
    suzu: {
      id: 'suzu', name: 'RawClaw', title: 'The Sound Alchemist', prefer: 'back', res: 'ward',
      color: '#a77bff', accent: '#e9ddff', dark: '#3b2470', maxHp: 68,
      blurb: 'The duo\'s producer, a good friend and a beatboxer too. A little reverb, a little delay, a filter here and there, and the whole fight sounds better.',
      rows: { front: { blockAdd: 1, thorns: 2 }, back: { regen: 2 } },
      passives: [{ id: 'moonlit_rite', name: 'Always Rolling', on: 'turnStart', fx: [{ op: 'status', s: 'ward', n: 1, tgt: 'self' }] }],
      starter: ['suzu_ofuda', 'suzu_ofuda', 'suzu_barrier', 'suzu_barrier', 'suzu_moon_prayer'],
      unlock: { ach: 'ch1_clear' },
    },
    raiga: {
      id: 'raiga', name: 'Andy', title: 'The Thunder Bass', prefer: 'front', res: 'charge',
      color: '#ff9a2e', accent: '#ffe45e', dark: '#5a2a0a', maxHp: 88,
      blurb: 'A bass player who sometimes joins the duo, and whose low end you feel before you hear it. Every hit he takes comes back as a bass line, louder.',
      rows: { front: { thorns: 2, startBlock: 3 }, back: { dmgAdd: 1 } },
      passives: [{ id: 'storm_born', name: 'Bass Face', on: 'onDamaged', limit: 2, fx: [{ op: 'status', s: 'charge', n: 1, tgt: 'self' }] }],
      starter: ['raiga_jab', 'raiga_jab', 'raiga_brace', 'raiga_brace', 'raiga_static_fist'],
      unlock: { ach: 'ch2_clear' },
    },
  };

  // ------------------------------------------------------------------
  // The fixed roster (CONTENT_SPEC 4 is the human copy). Ids, tiers, sizes and Acts are LAW:
  // data_enemies_N.js defines exactly its Act's ids and art_enemies_N.js draws exactly them.
  // Entry: [id, name, size, role]. Bosses also carry a title.
  // ------------------------------------------------------------------
  const ROSTER_SRC = {
    1: {
      normal: [
        ['kappa', 'Fussy Foghorn', 'm', 'Proud harbour foghorn. A honk that leaves the lead Exposed, a bump, then a guard; teaches Exposed and Block.'],
        ['tanuki_bandit', 'Coin Crab', 'm', 'Coin crab. Grabs gold from your hat, thumps, then scuttles off with it; win it over first to get the gold back.'],
        ['kodama', 'Tuning Forkling', 's', 'Tiny tuning fork. Rings at both heroes lightly and calls a Kazoo Imp to its side.'],
        ['karakasa', 'Squeezebox', 'm', 'Hopping accordion. Two quick polka hops, then squeezes shut for Block; its wheeze leaves a hero Wobbly.'],
        ['hitodama', 'Hot Chilli', 's', 'Hopping hot chilli. Hard to hit at first, Sizzles the lead and tips spicy junk cards into your deck.'],
        ['oni_cub', 'Jitterbug', 'm', 'Small bug of pre-show nerves that gains Volume every turn. Win it over early or it only gets louder.'],
        ['crow_tengu', 'Pitch-Perfect Gull', 'm', 'Pitch-perfect gull. Dives on the backing hero, pecks in flurries, and swaps your heroes\' spots.'],
        ['bamboo_sprite', 'Pea Pod', 's', 'Pod of three singing peas that arrive in packs. Three tiny shots at random heroes every turn.'],
        ['mushroom_folk', 'Jingle Machine', 'm', 'Jingle-singing vending machine. Earworms the lead and grows Feedback in bubble wrap.'],
        ['bamboo_boar', 'Runaway Melon', 'l', 'Rolling prize melon. Gains Sequins, winds up (telegraph), then one heavy downhill roll.'],
      ],
      elite: [
        ['oni_brute', 'One-Hit Jukebox', 'l', 'Washed-up jukebox. Heavy hits and Muffled, and it sulks into a rage below half HP.'],
        ['tengu_duelist', 'Dance-Off Heron', 'l', 'Tap-dancing heron. Lunges at the backing hero, gains Shimmy, and answers hits with a quick step.'],
        ['moss_guardian', 'Old Bandstand', 'l', 'Walking harbour bandstand. Sequins and Feedback, slow stomps, calls Kazoo Imps from its rafters.'],
      ],
      minion: [
        ['ember_wisp', 'Chilli Flake', 's', 'Tiny chilli flake. Sizzles a hero once, then fizzles out.'],
        ['leaf_imp', 'Kazoo Imp', 's', 'Fast little kazoo called by tuning forks and bandstands. One weak poke.'],
        ['paper_kodama', 'Mic Squeal', 's', 'Shrieking little mic creature. Clogs your deck with junk cards.'],
      ],
      boss: ['boss_kuzunoha', 'Kraki', 'xl', 'Karaoke kraken with eight stolen mics. Mic slams and mic squeals, then every voice at once.', 'The Karaoke Kraken'],
    },
    2: {
      normal: [
        ['chochin', 'Flamebait', 'm', 'Flaming matchstick. Sizzles the lead, gives every enemy Crescendo, then a flame war on both heroes.'],
        ['karakuri_puppet', 'Clickbait Goblin', 'm', 'Wind-up clickbait goblin with a fixed combo; its third trick leaves the lead Starstruck.'],
        ['nopperabo', 'Filter Fairy', 'm', 'Faceless filter fairy. Leaves the lead Muffled and Wobbly, then pokes harder while they stick.'],
        ['drowned_samurai', 'Unskippable Ad', 'l', 'Walking advert. Steady jabs and Sequins from its frame; holds still, then a big final offer.'],
        ['koi_spirit', 'Hug Emoji', 'm', 'Huggy emoji. Heals its allies and splashes both heroes with hearts.'],
        ['tsukumogami', 'Notification Imp', 'm', 'Red-dot imp. Hits and shuffles junk cards into your draw pile, then a big pile of pings.'],
        ['silk_weaver', 'Algo Rhythm', 'm', 'Clicking algorithm on cable legs. Tangles a hero and calls a Botling.'],
        ['nure_onna', 'Autoplay Snake', 'l', 'Endless-feed snake. Bites the backing hero with Earworm and coils the lead hard.'],
        ['rokurokubi', 'Selfie Stick', 'm', 'Telescoping selfie stick that reaches past the lead to hit the backing hero twice.'],
        ['ittan_momen', 'Phone Charger', 'm', 'Loose charging cable. Wraps a hero Tangled and gains Block and Shimmy.'],
      ],
      elite: [
        ['drowned_general', 'Comment Troll', 'l', 'Grumbling comment cloud. Crescendo, calls Grumble Clouds, one heavy ratio below half HP.'],
        ['puppet_master', 'Trendsetter', 'l', 'Pulls the strings of every trend. Calls Copycat Cutouts, mends them, and leaves the lead Starstruck.'],
        ['umibozu', 'Doomscroll Moth', 'l', 'Giant sleepy moth. Slams both heroes harder every turn, Muffled and Wobbly on both, and a Starstruck glare.'],
      ],
      minion: [
        ['spiderling', 'Botling', 's', 'Tiny spider-shaped bot that likes everything. Earworms with a quick nip.'],
        ['paper_puppet', 'Copycat Cutout', 's', 'Flimsy cut-out dancer on strings. One weak strike, gone in a hit.'],
        ['lantern_wisp', 'Grumble Cloud', 's', 'Small grumbling cloud. Sizzles a hero and backs up its neighbours with Block.'],
      ],
      boss: ['boss_jorogumo', 'Scrollspinner', 'xl', 'Glam spider who spins the endless feed. Tangles heroes and hatches botlings, then drops her filter.', 'Queen of the Feed'],
    },
    3: {
      normal: [
        ['storm_drone', 'Tuner Drone', 'm', 'Hovering pitch drone. Rapid jabs in threes and a correction on both heroes.'],
        ['komainu_guardian', 'VIP Bouncer', 'l', 'Brass rope-post bouncer. Sequins and Feedback, then a crushing bounce.'],
        ['redaction_knight', 'Clapperboard Knight', 'm', 'Clapperboard knight. Hits hard and adds junk cards with every retake.'],
        ['void_scribe', 'Chrome Siren', 'm', 'Chrome siren. Strips your buffs and adds junk cards.'],
        ['blank_soldier', 'Synchro Dancer', 'm', 'Mannequin dancer in perfect step. Steady hits that grow in a crowd, weak alone.'],
        ['sky_serpent', 'Streamer Dragon', 'l', 'Coiling streamer dragon. Multi-hit confetti blasts at the backing hero.'],
        ['eraser_wraith', 'Airbrush Wraith', 'm', 'Smooths away your Block and your hero resource stacks.'],
        ['thunder_crow', 'Ring Light Sentinel', 'm', 'Flying ring light. Dives to leave the lead Starstruck and flashes the backing hero.'],
        ['paper_golem', 'Sequin Golem', 'l', 'Sequinned costume giant. Slow, heavy hits and Sequins.'],
        ['margin_imp', 'Glitch Gremlin', 'm', 'Tuning-box gremlin. Calls Pitch Glitches and adds junk cards that cost you Breath.'],
      ],
      elite: [
        ['censor_golem', 'Big Mute Button', 'l', 'Giant mute button. Junk cards, Sequins, and one huge press.'],
        ['storm_whelp', 'Applause Sign', 'l', 'Lit-up applause sign. Roaring applause on both heroes, slow claps, calls Confetti Poppers.'],
        ['black_bar_inquisitor', 'Mannequin Judge', 'l', 'Talent-show mannequin judge. Starstruck, Tangled, and a finisher against a low hero.'],
      ],
      minion: [
        ['blank_page', 'Lip-Sync Clone', 's', 'Lip-syncing clone. Gains Block, then leaves a hero Wobbly.'],
        ['spark_mote', 'Confetti Popper', 's', 'Tiny party popper. One bang and it bursts.'],
        ['typo_sprite', 'Pitch Glitch', 's', 'Glitchy pixel sprite. Adds a junk card that costs you Breath.'],
      ],
      boss: ['boss_editor', 'Flawless', 'xl', 'Perfect pop idol who never sang a real note. Becomes the Filter, then the Gloss itself.', 'Star of the Perfect Stage'],
    },
  };

  const ROSTER = { 1: [], 2: [], 3: [] };
  const rosterById = {};
  [1, 2, 3].forEach((ch) => {
    const src = ROSTER_SRC[ch];
    ['normal', 'elite', 'minion'].forEach((tier) => src[tier].forEach((r) => {
      ROSTER[ch].push({ id: r[0], name: r[1], tier, size: r[2], role: r[3], chapter: ch });
    }));
    const b = src.boss;
    ROSTER[ch].push({ id: b[0], name: b[1], tier: 'boss', size: b[2], role: b[3], title: b[4], chapter: ch });
    ROSTER[ch].forEach((r) => { rosterById[r.id] = r; });
  });

  // Ids other modules and authors depend on (CONTENT_SPEC 2). Strict validation checks they exist.
  const FIXED = {
    bosses: { 1: 'boss_kuzunoha', 2: 'boss_jorogumo', 3: 'boss_editor' },
    curses: ['curse_regret', 'curse_smudge', 'curse_doubt', 'curse_burden', 'curse_hex', 'curse_decay'],
    statusCards: ['status_blot', 'status_tangle', 'status_scorch', 'status_redacted', 'status_static', 'status_wilt'],
    relics: { brass_lantern: 'common', fox_mask: 'uncommon', silver_bell: 'uncommon', jade_key: 'rare' },
    achievements: ['ch1_clear', 'ch2_clear', 'ch3_clear'],
    lore: ['intro', 'ch1_intro', 'ch2_intro', 'ch3_intro', 'ch1_clear', 'ch2_clear', 'victory', 'defeat',
      'hero_hanae', 'hero_kuro', 'hero_suzu', 'hero_raiga', 'barks_hanae', 'barks_kuro', 'barks_suzu', 'barks_raiga'],
    barkKeys: ['start', 'hurt', 'kill', 'down', 'win', 'swap'],
  };

  // How much content (CONTENT_SPEC 3 to 6). DATA.audit checks these.
  const QUOTA = {
    cards: { starter: 3, common: 14, uncommon: 12, rare: 8, powers: 4, lockedUncommon: 4, lockedRare: 4, slots: { red: 10, blue: 10, green: 8, gold: 8 } },
    enemies: { normal: 10, elite: 3, minion: 3, boss: 1, normalGroups: 12, eliteGroups: 3, bossPhases: { 1: 1, 2: 1, 3: 2 } },
    relics: { common: 22, uncommon: 22, rare: 12, boss: 6, shop: 4, perHero: 3, lockedFrac: 0.3, textMax: 90, flavorMax: 80 },
    gems: { perColor: 6, tiers: [1, 1, 2, 2, 3, 3] },
    events: { perChapter: 10, any: 10, onceFrac: 0.6 },
    achievements: 32, trials: 10, tips: 30,
  };

  // Enemy numbers at Trial 0 (CONTENT_SPEC 4 table; the data test asserts the markdown table equals this).
  // hp: [min,max] per tier. hit: per-hit range for the tier's ordinary attacks. heavy: telegraphed hit.
  // round: boss per-round total [normal phase max, last phase max]. budget: a group's summed average
  // per-round damage before Block (minions never count).
  const GUIDE = {
    hp: { 1: { minion: [6, 14], normal: [16, 38], elite: [55, 85], boss: [170, 200] }, 2: { minion: [10, 22], normal: [28, 58], elite: [85, 125], boss: [240, 280] }, 3: { minion: [14, 30], normal: [42, 80], elite: [120, 165], boss: [420, 480] } },
    hit: { 1: { minion: [2, 5], normal: [4, 9], elite: [8, 14], boss: [9, 13] }, 2: { minion: [3, 7], normal: [7, 14], elite: [12, 18], boss: [12, 16] }, 3: { minion: [4, 9], normal: [10, 18], elite: [15, 22], boss: [15, 22] } },
    heavy: { 1: { normal: [12, 14], boss: [16, 20] }, 2: { normal: [16, 20], boss: [20, 26] }, 3: { normal: [22, 26], boss: [26, 34] } },
    round: { 1: [24, 30], 2: [30, 36], 3: [40, 46] },
    budget: { 1: { normal: [8, 16], elite: [14, 22] }, 2: { normal: [14, 26], elite: [22, 32] }, 3: { normal: [20, 34], elite: [30, 42] } },
  };

  // ------------------------------------------------------------------
  // Registries filled by content files. DATA.add throws on a duplicate id so two
  // agents can never silently shadow each other.
  // ------------------------------------------------------------------
  const REG = ['cards', 'gems', 'relics', 'enemies', 'events', 'achievements', 'trials', 'tips', 'lore'];
  const D = { LISTS, LINKS, statuses, keywords, ECONOMY, SETTINGS, brushes, tiles, heroes, ROSTER, rosterById, FIXED, QUOTA, GUIDE, encounters: { 1: { normal: [], elite: [] }, 2: { normal: [], elite: [] }, 3: { normal: [], elite: [] } } };
  REG.forEach((k) => { D[k] = k === 'tips' ? [] : {}; });
  // Display names of the gem and slot colour ids (the ids stay; every screen that prints a colour reads this).
  D.COLOUR_NAME = { red: 'pink', blue: 'blue', green: 'green', gold: 'gold', any: 'rainbow' };

  D.add = (kind, defs) => {
    if (!D[kind] || REG.indexOf(kind) < 0) throw new Error('DATA.add: unknown registry ' + kind);
    if (kind === 'tips') { (Array.isArray(defs) ? defs : [defs]).forEach((t) => D.tips.push(t)); return; }
    if (!defs || typeof defs !== 'object' || Array.isArray(defs)) throw new Error(`DATA.add(${kind}): defs must be an object keyed by id, {my_id: {...}} (an array is only legal for tips)`);
    Object.keys(defs).forEach((id) => {
      if (D[kind][id]) throw new Error(`DATA.add: duplicate ${kind} id "${id}"`);
      const d = defs[id];
      if (d && typeof d === 'object' && !d.id) d.id = id;
      if (d && d.id !== id) throw new Error(`DATA.add: ${kind} key "${id}" != def id "${d.id}"`);
      D[kind][id] = d;
    });
  };

  // Encounter pools: DATA.addEncounters(chapter, {normal:[{id, enemies:[ids], w, min}], elite:[...], boss:'id'})
  // min = lowest tile.diff (0..1) the group may appear at; w = weight. Group ids are 'ch<N>_...' and globally unique.
  D.addEncounters = (chapter, pools) => {
    const e = D.encounters[chapter];
    if (!e) throw new Error('DATA.addEncounters: bad chapter ' + chapter);
    ['normal', 'elite'].forEach((k) => {
      (pools[k] || []).forEach((g) => {
        if (D.groupById(g.id)) throw new Error(`DATA.addEncounters: duplicate group id "${g.id}"`);
        e[k].push(g);
      });
    });
    if (pools.boss) { if (e.boss) throw new Error('DATA.addEncounters: boss already set for chapter ' + chapter); e.boss = pools.boss; }
  };

  // ---- lookups ----
  const asList = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
  D.hero = (id) => heroes[id] || null;
  D.card = (id) => D.cards[id] || null;
  D.cardsBy = (f) => Object.values(D.cards).filter((c) => (!f.hero || c.hero === f.hero) && (!f.rarity || c.rarity === f.rarity) && (!f.type || c.type === f.type));
  D.enemyIds = (chapter, tier) => Object.values(D.enemies).filter((e) => (!chapter || e.chapter === chapter) && (!tier || e.tier === tier)).map((e) => e.id);
  D.groupById = (id) => { for (const ch of [1, 2, 3]) { const p = D.encounters[ch]; const g = p.normal.concat(p.elite).find((x) => x && x.id === id); if (g) return g; } return null; };
  D.eligibleGroups = (chapter, kind, diff) => (D.encounters[chapter][kind] || []).filter((g) => g.min <= diff);
  D.isStatus = (id) => !!statuses[id];
  D.isDebuff = (id) => !!statuses[id] && statuses[id].kind === 'debuff';
  D.isBuff = (id) => !!statuses[id] && statuses[id].kind === 'buff';
  // unlocked = {card:[ids], relic:[ids], gem:[ids]} (the locked defs the player owns); undefined means "everything".
  D.isUnlocked = (kind, id, unlocked) => {
    const reg = { card: D.cards, relic: D.relics, gem: D.gems }[kind];   // heroes and trials are META's business: no registry here means nothing to lock
    const def = reg && reg[id];
    if (!def || !def.locked || !unlocked) return true;
    return (unlocked[kind] || []).indexOf(id) >= 0;
  };
  // Reward pool for one hero at one rarity (starters and tokens never reward)
  D.rewardPool = (heroId, rarity, unlocked) => (rarity === 'starter' || rarity === 'token' ? [] : D.cardsBy({ hero: heroId, rarity }).filter((c) => D.isUnlocked('card', c.id, unlocked)));
  D.relicPool = (rarity, unlocked, heroIds) => Object.values(D.relics).filter((r) => r.rarity === rarity && D.isUnlocked('relic', r.id, unlocked) && (!r.hero || !heroIds || heroIds.indexOf(r.hero) >= 0));
  D.gemPool = (f, unlocked) => Object.values(D.gems).filter((g) => (!f || !f.tier || g.tier === f.tier) && (!f || !f.color || g.color === f.color) && D.isUnlocked('gem', g.id, unlocked));
  // Visit every op in a list, through cond (then/else), repeat (do) and hook (fx) nesting.
  D.walkOps = (ops, fn, depth) => {
    depth = depth || 0;
    if (!Array.isArray(ops) || depth > 8) return;
    ops.forEach((o) => {
      if (!o || typeof o !== 'object') return;
      fn(o);
      D.walkOps(o.then, fn, depth + 1); D.walkOps(o.else, fn, depth + 1); D.walkOps(o.do, fn, depth + 1);
      if (o.op === 'hook') D.walkOps(o.fx, fn, depth + 1);
    });
  };

  // ---- mods (DESIGN 4.7) ----
  // count keys: [base, min, max]. frac keys fold to max(0.1, 1 + sum). reviveFrac is a delta on ECONOMY.reviveFrac.
  const COUNT_BASE = {
    energy: [ECONOMY.energy, 1, 10], hand: [ECONOMY.handSize, 1, ECONOMY.maxHand], startBlock: [0, 0, 99], inkMax: [ECONOMY.inkMax, 6, 20],
    startInk: [ECONOMY.startInk, 1, 20], wellInk: [ECONOMY.wellInk, 1, 12], cardChoices: [ECONOMY.cardChoices, 1, 6], freeSwaps: [ECONOMY.freeSwaps, 0, 5],
    campActions: [1, 1, 3], rareBoost: [0, 0, 50], startGold: [ECONOMY.startGold, 0, 999], curses: [0, 0, 10],
  };
  const FRAC_KEYS = ['goldMul', 'priceMul', 'healMul', 'enemyHp', 'eliteHp', 'bossHp', 'enemyDmg'];
  D.foldMods = (list) => {
    const sum = {};
    (list || []).forEach((m) => { if (m) Object.keys(m).forEach((k) => { if (typeof m[k] === 'number') sum[k] = (sum[k] || 0) + m[k]; }); });
    const out = {};
    Object.keys(COUNT_BASE).forEach((k) => { const c = COUNT_BASE[k]; out[k] = Math.min(c[2], Math.max(c[1], c[0] + Math.round(sum[k] || 0))); });
    out.startInk = Math.min(out.startInk, out.inkMax);
    FRAC_KEYS.forEach((k) => { out[k] = Math.max(0.1, 1 + (sum[k] || 0)); });
    out.reviveFrac = Math.min(1, Math.max(0.05, ECONOMY.reviveFrac + (sum.reviveFrac || 0)));
    return out;
  };
  // Trial N's deltas are the sum of trial levels 1..N (each level's mods are its own increment).
  D.trialDeltas = (level) => {
    const sum = {};
    Object.values(D.trials).filter((t) => t.level <= level).forEach((t) => Object.keys(t.mods || {}).forEach((k) => { sum[k] = (sum[k] || 0) + t.mods[k]; }));
    return sum;
  };
  // trial: a level number, or the deltas object a run stored at newRun (R.mods), so a saved run does not drift if trial data is retuned
  D.modsFor = (relicIds, trial) => D.foldMods((relicIds || []).map((id) => D.relics[id] && D.relics[id].mods).concat([trial && typeof trial === 'object' ? trial : D.trialDeltas(trial || 0)]));
  D.rowFor = (heroId, row, relicIds) => {
    const out = {};
    const add = (r) => { if (r) Object.keys(r).forEach((k) => { out[k] = (out[k] || 0) + r[k]; }); };
    add(heroes[heroId] && heroes[heroId].rows[row]);
    (relicIds || []).forEach((id) => add(D.relics[id] && D.relics[id].rows && D.relics[id].rows[row]));
    return out;
  };

  // final tile count for one tile type on a map with `nonBlock` non-void hexes
  D.tileCount = (type, nonBlock) => {
    const lo = ECONOMY.countMin[type] || 0, hi = ECONOMY.countMax[type] === undefined ? Infinity : ECONOMY.countMax[type];
    return Math.min(hi, Math.max(lo, Math.round(ECONOMY.dist[type] * nonBlock)));
  };
  // clamp a stored setting to its domain, or fall back to the default
  D.cleanSetting = (key, v) => {
    const s = SETTINGS[key];
    if (!s) return undefined;
    if (s.values) return s.values.indexOf(v) >= 0 ? v : s.def;
    return typeof v === 'number' && Number.isFinite(v) ? Math.min(s.max, Math.max(s.min, v)) : s.def;
  };

  // ------------------------------------------------------------------
  // Validator. Structural: shapes, closed lists, per-op field schemas, op and target
  // vocabularies per context. It never simulates. Returns {errors:[], warnings:[], counts:{}}.
  // Lenient by default: references to content that other files may not have written yet
  // (enemy ids, card ids, relic ids, fixed ids) are NOT checked. opt.strict checks them all.
  // ------------------------------------------------------------------
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const isInt = (v) => Number.isInteger(v);
  const isStr = (v) => typeof v === 'string' && v.length > 0;
  const isBool = (v) => typeof v === 'boolean';
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const isArr = Array.isArray;
  const vals = (reg) => Object.keys(reg).map((k) => reg[k]).filter(isObj);   // registry entries that are objects (junk entries get their own error)
  const A = (v) => (Array.isArray(v) ? v : []);      // junk-proof accessors: a validator must never throw on bad content
  const O = (v) => (isObj(v) ? v : {});
  const isArr2 = (a) => Array.isArray(a) && a.length === 2 && isNum(a[0]) && isNum(a[1]);
  const has = (list, v) => LISTS[list].indexOf(v) >= 0;
  const ID_RE = /^[a-z][a-z0-9_]*$/;
  const DASH = new RegExp('[' + String.fromCharCode(0x2014, 0x2013) + ']');
  const V_KEYS = ['base', 'per', 'mul', 's', 'who', 'cap', 'min', 'upTo'];

  // op field schemas per context kind (card | hook | enemy). 'hand' ops validate as hook, gem fx as card.
  const OPSPEC = {
    dmg: { card: ['n', 'hits', 'tgt', 'pierce', 'lifesteal', 'consume', 'el'], hook: ['n', 'hits', 'tgt', 'pierce', 'lifesteal', 'consume', 'el'], enemy: ['n', 'hits', 'tgt', 'pierce', 'lifesteal', 'el'] },
    block: { card: ['n', 'tgt', 'consume'], hook: ['n', 'tgt', 'consume'], enemy: ['n', 'tgt'] },
    heal: { card: ['n', 'tgt', 'consume'], hook: ['n', 'tgt', 'consume'], enemy: ['n', 'tgt'] },
    hurt: { card: ['n', 'tgt', 'lethal', 'consume'], hook: ['n', 'tgt', 'lethal', 'consume'] },
    status: { card: ['s', 'n', 'tgt', 'consume'], hook: ['s', 'n', 'tgt', 'consume'], enemy: ['s', 'n', 'tgt'] },
    removeStatus: { card: ['s', 'n', 'tgt'], hook: ['s', 'n', 'tgt'], enemy: ['s', 'n', 'tgt'] },
    draw: { card: ['n', 'consume'], hook: ['n', 'consume'] },
    energy: { card: ['n', 'consume'], hook: ['n', 'consume'] },
    gold: { card: ['n'], hook: ['n'] },
    ink: { card: ['n'], hook: ['n'] },
    maxHp: { card: ['n', 'tgt'], hook: ['n', 'tgt'] },
    revive: { card: ['n', 'pct'], hook: ['n', 'pct'] },
    pick: { card: ['from', 'n', 'then', 'top', 'filter', 'random', 'optional'] },
    add: { card: ['card', 'n', 'to', 'up'], hook: ['card', 'n', 'to', 'up'], enemy: ['card', 'n', 'to', 'top'] },
    swap: { card: [], enemy: [] },
    cond: { card: ['if', 'then', 'else'], hook: ['if', 'then', 'else'], enemy: ['if', 'then', 'else'] },
    repeat: { card: ['n', 'do'] },
    hook: { card: ['on', 'fx', 'filter', 'limit', 'once', 'every'] },
    summon: { enemy: ['enemy', 'n'] },
    stealGold: { enemy: ['n'] },
    flee: { enemy: [] },
  };
  // which target lists each op may use, per context kind
  const TGT = {
    dmg: { card: 'enemyCardTgt', hook: 'enemyCardTgt', enemy: 'enemyHeroTgt' },
    block: { card: 'heroTgt', hook: 'heroTgt', enemy: 'enemySelfTgt' },
    heal: { card: 'heroTgt', hook: 'heroTgt', enemy: 'enemySelfTgt' },
    hurt: { card: 'heroTgt', hook: 'heroTgt' },
    maxHp: { card: 'heroTgt', hook: 'heroTgt' },
    status: { card: ['heroTgt', 'enemyCardTgt'], hook: ['heroTgt', 'enemyCardTgt'], enemy: ['enemyHeroTgt', 'enemySelfTgt'] },
    removeStatus: { card: ['heroTgt', 'enemyCardTgt'], hook: ['heroTgt', 'enemyCardTgt'], enemy: ['enemyHeroTgt', 'enemySelfTgt'] },
  };
  // an intent icon must be honest about what the move does
  const INTENT_NEEDS = { attack: ['dmg'], multi: ['dmg'], heavy: ['dmg'], defend: ['block'], heal: ['heal'], summon: ['summon'], flee: ['flee'], buff: ['status', 'removeStatus'], debuff: ['status', 'removeStatus', 'add', 'swap', 'stealGold'] };
  const ATTACKISH = ['attack', 'multi', 'heavy', 'special'];
  const RUN_FIELDS = {
    gold: ['n', 'pct'], ink: ['n', 'pct'], heal: ['n', 'pct', 'who'], hurt: ['n', 'pct', 'who'], maxHp: ['n', 'who'],
    addCard: ['card', 'pool', 'rarity', 'n', 'up'], removeCard: ['n', 'random', 'filter'], upgradeCard: ['n', 'random', 'filter'],
    transformCard: ['n', 'random', 'filter'], duplicateCard: ['n', 'random', 'filter'], addRelic: ['id', 'rarity'], addGem: ['id', 'color', 'tier'],
    addBrush: ['id'], addCurse: ['id', 'n'], fight: ['enc', 'enemies', 'tier', 'rewards', 'win'], flag: ['k', 'v'], paint: ['n'], cardReward: ['rarity', 'hero', 'n'],
  };

  D.validate = (only, opt) => {
    opt = opt || {};
    const strict = !!opt.strict;
    const errors = [], warnings = [];
    const err = (where, msg) => errors.push(`${where}: ${msg}`);
    const warn = (where, msg) => warnings.push(`${where}: ${msg}`);
    const want = (k) => !only || only === k || (Array.isArray(only) && only.indexOf(k) >= 0);
    const KINDS = ['heroes', 'cards', 'gems', 'relics', 'enemies', 'events', 'achievements', 'trials', 'tips', 'lore'];
    if (only !== undefined) (Array.isArray(only) ? only : [only]).forEach((k) => { if (KINDS.indexOf(k) < 0) err('validate', `unknown registry "${k}" (one of ${KINDS.join(', ')})`); });
    ['cards', 'gems', 'relics', 'enemies', 'events', 'achievements', 'trials', 'lore'].forEach((k) => {
      if (want(k)) Object.keys(D[k]).forEach((id) => { if (!isObj(D[k][id])) err(k + ' ' + id, 'must be an object'); });
    });
    const noDash = (w, o) => { if (DASH.test(JSON.stringify(o))) err(w, 'contains an em or en dash'); };
    // top-level fields a def may carry: a typo'd or invented field is an error, not silently ignored
    const FIELDS = {
      card: ['id', 'name', 'hero', 'type', 'rarity', 'cost', 'fx', 'up', 'kw', 'slots', 'art', 'flavor', 'hand', 'locked'],
      gem: ['id', 'name', 'color', 'tier', 'mod', 'art', 'text', 'locked'],
      relic: ['id', 'name', 'rarity', 'text', 'mods', 'rows', 'hooks', 'art', 'hero', 'locked', 'flavor'],
      enemy: ['id', 'name', 'title', 'chapter', 'tier', 'size', 'hp', 'moves', 'ai', 'start', 'phases', 'hooks', 'immune', 'art', 'lore', 'tags'],
      event: ['id', 'title', 'text', 'art', 'once', 'chapters', 'when', 'w', 'choices'],
      choice: ['label', 'req', 'cost', 'out'],
      achievement: ['id', 'name', 'text', 'stat', 'reward'],
      trial: ['id', 'level', 'name', 'text', 'mods'],
    };
    const fields = (w, o, kind) => Object.keys(o).forEach((k) => { if (FIELDS[kind].indexOf(k) < 0) err(w, `unknown field "${k}" on a ${kind}`); });
    // object of numeric comparators: keys outside `keys` are errors, keys in `skip` are checked by the caller
    const cmp = (w, o, path, keys, ints, skip) => {
      if (!isObj(o)) return err(w, `${path} must be an object`);
      Object.keys(o).forEach((k) => {
        if (keys.indexOf(k) < 0) err(w, `${path}: unknown key "${k}"`);
        else if (A(skip).indexOf(k) < 0 && (!isNum(o[k]) || (ints && !isInt(o[k])))) err(w, `${path}.${k} must be a ${ints ? 'whole ' : ''}number`);
      });
    };

    // ---- value expressions ----
    // env: {ctx:'card'|'hook'|'hand'|'gem'|'enemy', cost}
    const vVal = (w, v, path, env) => {
      if (isNum(v)) return;
      if (!isObj(v)) return err(w, `${path}: value must be a number or {base,per,mul,...}`);
      Object.keys(v).forEach((k) => { if (V_KEYS.indexOf(k) < 0) err(w, `${path}: unknown value key "${k}"`); });
      ['base', 'mul', 'cap', 'min', 'upTo'].forEach((k) => { if (v[k] !== undefined && !isNum(v[k])) err(w, `${path}.${k} must be a number`); });
      if (v.min !== undefined && v.cap !== undefined && isNum(v.min) && isNum(v.cap) && v.min > v.cap) err(w, `${path}: min above cap`);
      if (v.per === undefined) {
        if (v.base === undefined) err(w, `${path}: value object needs base or per`);
        ['mul', 's', 'who', 'upTo'].forEach((k) => { if (v[k] !== undefined) err(w, `${path}.${k} needs per`); });
        return;
      }
      const enemy = env.ctx === 'enemy';
      if (!has(enemy ? 'perEnemy' : 'per', v.per)) err(w, `${path}: per "${v.per}" is not legal in ${env.ctx} context`);
      if (v.per === 'X' && env.ctx === 'card' && env.cost !== 'X') err(w, `${path}: per X needs a card with cost 'X'`);
      if (v.per === 'X' && env.ctx !== 'card') err(w, `${path}: per X is only legal on a card with cost 'X'`);
      if (v.per === 'status') { if (!D.isStatus(v.s)) err(w, `${path}: per status needs a known s`); } else if (v.s !== undefined) err(w, `${path}: s only applies to per status`);
      if (v.who !== undefined) {
        if (!has(enemy ? 'perWhoEnemy' : 'perWho', v.who)) err(w, `${path}: who "${v.who}" is not legal in ${env.ctx} context`);
        if (!has('perWhoPer', v.per)) err(w, `${path}: who only applies to status, block, hp, missingHp and debuffs`);
      }
    };

    // ---- conditions. kind: 'card' (also hooks) | 'enemy' | 'ai' ----
    const vCond = (w, c, path, kind) => {
      if (!isObj(c)) return err(w, `${path}: condition must be an object`);
      const list = kind === 'ai' ? 'aiCond' : kind === 'enemy' ? 'condEnemy' : 'cond';
      const whoList = kind === 'enemy' ? 'perWhoEnemy' : 'perWho';
      Object.keys(c).forEach((k) => { if (!has(list, k)) err(w, `${path}: unknown condition "${k}" for ${kind}`); });
      if (Object.keys(c).length === 0) err(w, `${path}: empty condition`);
      if (kind === 'ai') {
        ['hpLt', 'hpGt', 'allyHpLt', 'heroHpLt'].forEach((k) => { if (c[k] !== undefined && !(isNum(c[k]) && c[k] > 0 && c[k] <= 1)) err(w, `${path}.${k} must be a fraction in (0,1]`); });
        if (c.turnGte !== undefined && !(isInt(c.turnGte) && c.turnGte >= 1)) err(w, `${path}.turnGte must be an integer >= 1`);
        if (c.turnEvery !== undefined && !(Array.isArray(c.turnEvery) && c.turnEvery.length === 2 && isInt(c.turnEvery[0]) && c.turnEvery[0] >= 2 && isInt(c.turnEvery[1]) && c.turnEvery[1] >= 0 && c.turnEvery[1] < c.turnEvery[0])) err(w, `${path}.turnEvery must be [period >= 2, offset < period]`);
        ['alone', 'heroDown'].forEach((k) => { if (c[k] !== undefined && c[k] !== true) err(w, `${path}.${k} must be true`); });
        if (c.minions !== undefined) cmp(w, c.minions, path + '.minions', ['lt'], true);
        if (c.heroStatus !== undefined) { if (!isObj(c.heroStatus) || !D.isStatus(c.heroStatus.s)) err(w, `${path}.heroStatus.s must be a known status`); else cmp(w, c.heroStatus, path + '.heroStatus', ['s', 'gte'], true, ['s']); }
        return;
      }
      if (c.row !== undefined && ['front', 'back'].indexOf(c.row) < 0) err(w, `${path}.row must be front or back`);
      ['handEmpty', 'lastKill', 'allyDown'].forEach((k) => { if (c[k] !== undefined && c[k] !== true) err(w, `${path}.${k} must be true`); });
      ['cardsPlayed', 'attacksPlayed', 'turn', 'block', 'energy', 'handSize', 'enemies'].forEach((k) => { if (c[k] !== undefined) cmp(w, c[k], `${path}.${k}`, ['gte', 'lte'], false); });
      if (c.status !== undefined) {
        if (!isObj(c.status) || !D.isStatus(c.status.s)) err(w, `${path}.status.s must be a known status`);
        else { cmp(w, c.status, path + '.status', ['s', 'who', 'gte', 'lte'], false, ['s', 'who']); if (c.status.who !== undefined && !has(whoList, c.status.who)) err(w, `${path}.status.who "${c.status.who}" not legal for ${kind}`); }
      }
      if (c.hpPct !== undefined) {
        if (!isObj(c.hpPct)) err(w, `${path}.hpPct must be an object`);
        else { cmp(w, c.hpPct, path + '.hpPct', ['who', 'lt', 'gt'], false, ['who']); if (c.hpPct.who !== undefined && !has(whoList, c.hpPct.who)) err(w, `${path}.hpPct.who "${c.hpPct.who}" not legal for ${kind}`); if (c.hpPct.lt === undefined && c.hpPct.gt === undefined) err(w, `${path}.hpPct needs lt or gt`); }
      }
      if (c.targetStatus !== undefined) {
        if (!isObj(c.targetStatus) || !D.isStatus(c.targetStatus.s)) err(w, `${path}.targetStatus.s must be a known status`);
        else cmp(w, c.targetStatus, path + '.targetStatus', ['s', 'gte', 'lte'], false, ['s']);
      }
    };

    // ---- hook meta: on, filter, limit, once, every ----
    const vFilter = (w, f, path, on, enemyHook) => {
      if (!isObj(f)) return err(w, `${path} must be an object`);
      const ON = { type: ['onPlay', 'onExhaust', 'onHeroPlay'], cost: ['onPlay', 'onExhaust'], kw: ['onPlay', 'onExhaust'], gems: ['onPlay', 'onExhaust'], tier: ['onKill', 'onFightWon'] };
      Object.keys(f).forEach((k) => {
        if (!has('hookFilter', k)) return err(w, `${path}: unknown key "${k}"`);
        if (enemyHook && k !== 'type') return err(w, `${path}: enemy hooks only filter on type`);
        if (ON[k] && ON[k].indexOf(on) < 0) err(w, `${path}.${k} is meaningless on ${on} (legal on ${ON[k].join(', ')})`);
        const vals = asList(f[k]);
        if (k === 'type') vals.forEach((x) => { if (!has('cardTypes', x)) err(w, `${path}.type "${x}"`); });
        if (k === 'hero') vals.forEach((x) => { if (x !== 'any' && !has('heroIds', x)) err(w, `${path}.hero "${x}"`); });
        if (k === 'kw') vals.forEach((x) => { if (!has('cardKw', x)) err(w, `${path}.kw "${x}"`); });
        if (k === 'tier') vals.forEach((x) => { if (!has('tiers', x)) err(w, `${path}.tier "${x}"`); });
        if (k === 'cost') cmp(w, f.cost, path + '.cost', ['gte', 'lte'], true);
        if (k === 'gems') cmp(w, f.gems, path + '.gems', ['gte'], true);
      });
    };
    const vHookMeta = (w, h, p, onList, enemyHook) => {
      if (!isStr(h.on) || !has(onList, h.on)) err(w, `${p}: hook.on "${h.on}" must be one of LISTS.${onList}`);
      if (h.filter !== undefined) vFilter(w, h.filter, p + '.filter', h.on, enemyHook);
      if (h.limit !== undefined && !(isInt(h.limit) && h.limit >= 1)) err(w, `${p}.limit must be an integer >= 1`);
      if (h.once !== undefined && !isBool(h.once)) err(w, `${p}.once must be a boolean`);
      if (h.every !== undefined && !(isInt(h.every) && h.every >= 2)) err(w, `${p}.every must be an integer >= 2`);
      if (h.once && h.every !== undefined) err(w, `${p}: once and every cannot combine`);
      if (enemyHook && h.every !== undefined) err(w, `${p}: enemy hooks have no every`);
    };

    // ---- ops. ctx: card | hook | hand | gem | enemy ----
    const vOps = (w, ops, ctx, path, env, depth) => {
      env = env || {}; depth = depth || 0;
      if (!Array.isArray(ops)) return err(w, `${path}: fx must be an array`);
      if (depth > 6) return err(w, `${path}: ops nested too deep`);
      const kind = ctx === 'hand' ? 'hook' : ctx === 'gem' ? 'card' : ctx;
      const allowed = kind === 'card' ? LISTS.cardOps : kind === 'hook' ? LISTS.hookOps : LISTS.enemyOps;
      const venv = { ctx: ctx === 'gem' ? 'gem' : ctx, cost: env.cost };
      if (ctx === 'gem') venv.ctx = 'card';
      const sub = (list, p2) => vOps(w, list, ctx, p2, env, depth + 1);
      ops.forEach((o, i) => {
        const p = `${path}[${i}]`;
        if (!isObj(o) || !isStr(o.op)) return err(w, `${p}: op object with "op" required`);
        if (allowed.indexOf(o.op) < 0) return err(w, `${p}: op "${o.op}" not allowed in ${ctx} context`);
        const spec = OPSPEC[o.op] && OPSPEC[o.op][kind];
        if (!spec) return err(w, `${p}: op "${o.op}" has no schema for ${kind}`);
        Object.keys(o).forEach((k) => { if (k !== 'op' && spec.indexOf(k) < 0) err(w, `${p}: unknown field "${k}" on ${o.op}`); });
        if (o.tgt !== undefined) {
          const lists = asList(TGT[o.op] && TGT[o.op][kind]);
          if (!lists.some((l) => has(l, o.tgt))) err(w, `${p}: tgt "${o.tgt}" not legal for ${o.op} in ${ctx} context`);
        }
        const val = (k) => vVal(w, o[k], `${p}.${k}`, venv);
        if (o.consume !== undefined) {
          const cs = isObj(o.consume) ? o.consume.s : o.consume;
          if (cs !== 'block' && !D.isStatus(cs)) err(w, `${p}.consume must be a status id, 'block' or {s, upTo}`);
          if (isObj(o.consume)) { Object.keys(o.consume).forEach((k) => { if (['s', 'upTo'].indexOf(k) < 0) err(w, `${p}.consume: unknown key "${k}"`); }); if (o.consume.upTo !== undefined) vVal(w, o.consume.upTo, `${p}.consume.upTo`, venv); }
        }
        switch (o.op) {
          case 'dmg':
            val('n'); if (o.hits !== undefined) val('hits');
            if (o.el !== undefined && !has('elements', o.el)) err(w, `${p}.el "${o.el}" not in LISTS.elements`);
            ['pierce', 'lifesteal'].forEach((k) => { if (o[k] !== undefined && !isBool(o[k])) err(w, `${p}.${k} must be a boolean`); });
            break;
          case 'block': case 'heal': case 'draw': case 'energy': case 'gold': case 'ink': case 'maxHp': case 'hurt': case 'stealGold': val('n'); if (o.op === 'hurt' && o.lethal !== undefined && !isBool(o.lethal)) err(w, `${p}.lethal must be a boolean`); break;
          case 'status':
            if (!D.isStatus(o.s)) err(w, `${p}: unknown status "${o.s}"`);
            val('n');
            if (ctx === 'hand' && D.isDebuff(o.s) && o.tgt === undefined) err(w, `${p}: a debuff in a hand op needs an explicit tgt`);
            break;
          case 'removeStatus':
            if (['debuffs', 'buffs'].indexOf(o.s) < 0 && !D.isStatus(o.s)) err(w, `${p}: removeStatus s must be a status id, 'debuffs' or 'buffs'`);
            if (o.n !== undefined) val('n');
            break;
          case 'revive':
            if ((o.n === undefined) === (o.pct === undefined)) err(w, `${p}: revive needs exactly one of n or pct`);
            if (o.n !== undefined) val('n');
            if (o.pct !== undefined && !(isNum(o.pct) && o.pct > 0 && o.pct <= 1)) err(w, `${p}.pct must be a fraction in (0,1]`);
            break;
          case 'pick':
            if (!has('cardPickFrom', o.from)) err(w, `${p}: bad pick.from "${o.from}"`);
            if (!has('cardPickThen', o.then)) err(w, `${p}: bad pick.then "${o.then}"`);
            else if (has('cardPickFrom', o.from) && LISTS.pickPairs[o.from].indexOf(o.then) < 0) err(w, `${p}: pick from ${o.from} cannot then ${o.then} (legal: ${LISTS.pickPairs[o.from].join(', ')})`);
            val('n');
            if (o.top !== undefined) { if (!(isInt(o.top) && o.top >= 1)) err(w, `${p}.top must be an integer >= 1`); if (o.from !== 'draw') err(w, `${p}.top only applies to from 'draw'`); }
            if (o.filter !== undefined) { if (!isObj(o.filter)) err(w, `${p}.filter must be an object`); else { Object.keys(o.filter).forEach((k) => { if (['type', 'hero'].indexOf(k) < 0) err(w, `${p}.filter: unknown key "${k}"`); }); if (o.filter.type !== undefined && !has('cardTypes', o.filter.type)) err(w, `${p}.filter.type`); if (o.filter.hero !== undefined && !has('heroIds', o.filter.hero)) err(w, `${p}.filter.hero`); } }
            ['random', 'optional'].forEach((k) => { if (o[k] !== undefined && !isBool(o[k])) err(w, `${p}.${k} must be a boolean`); });
            break;
          case 'add':
            if (!isStr(o.card)) err(w, `${p}: add needs a card id`);
            if (o.to !== undefined && !has(kind === 'enemy' ? 'addToEnemy' : 'addTo', o.to)) err(w, `${p}: bad add.to "${o.to}" in ${ctx} context`);
            if (o.n !== undefined) val('n');
            if (o.up !== undefined && !isBool(o.up)) err(w, `${p}.up must be a boolean`);
            if (o.top !== undefined && (!isBool(o.top) || o.to !== 'draw')) err(w, `${p}.top must be true and needs to:'draw'`);
            break;
          case 'summon': if (!isStr(o.enemy)) err(w, `${p}: summon needs an enemy id`); if (o.n !== undefined && !(isInt(o.n) && o.n >= 1 && o.n <= 4)) err(w, `${p}.n must be an integer 1..4`); break;
          case 'cond':
            vCond(w, o.if, p + '.if', kind === 'enemy' ? 'enemy' : 'card');
            if (!Array.isArray(o.then) || !o.then.length) err(w, `${p}.then must be a non-empty array`); else sub(o.then, p + '.then');
            if (o.else !== undefined) { if (!Array.isArray(o.else) || !o.else.length) err(w, `${p}.else must be a non-empty array`); else sub(o.else, p + '.else'); }
            break;
          case 'repeat':
            val('n');
            if (!Array.isArray(o.do) || !o.do.length) err(w, `${p}.do must be a non-empty array`); else sub(o.do, p + '.do');
            break;
          case 'hook':
            vHookMeta(w, o, p, 'combatHooks', false);
            if (!Array.isArray(o.fx) || !o.fx.length) err(w, `${p}.fx must be a non-empty array`); else vOps(w, o.fx, 'hook', p + '.fx', env, depth + 1);
            break;
          default: break;
        }
      });
    };

    // ---- run ops (events, run hooks). ctx: event | hook | win ----
    const vRun = (w, ops, ctx, path) => {
      if (!Array.isArray(ops)) return err(w, `${path}: run fx must be an array`);
      ops.forEach((o, i) => {
        const p = `${path}[${i}]`;
        if (!isObj(o) || !has('runOps', o.op)) return err(w, `${p}: unknown run op "${o && o.op}"`);
        Object.keys(o).forEach((k) => { if (k !== 'op' && RUN_FIELDS[o.op].indexOf(k) < 0) err(w, `${p}: unknown field "${k}" for ${o.op}`); });
        const pctOk = (v) => isNum(v) && v > 0 && v <= 1;
        const npct = (neg) => {
          if ((o.n === undefined) === (o.pct === undefined)) return err(w, `${p}: ${o.op} needs exactly one of n or pct`);
          if (o.n !== undefined && !(isInt(o.n) && (neg || o.n > 0))) err(w, `${p}.n must be a${neg ? ' whole' : ' positive whole'} number`);
          if (o.pct !== undefined && !(neg ? isNum(o.pct) && o.pct >= -1 && o.pct <= 1 && o.pct !== 0 : pctOk(o.pct))) err(w, `${p}.pct must be a fraction`);
        };
        if (o.who !== undefined && !has('runWho', o.who)) err(w, `${p}: bad who "${o.who}"`);
        switch (o.op) {
          case 'gold': case 'ink': npct(true); break;
          case 'heal': case 'hurt': npct(false); break;
          case 'maxHp': if (!isInt(o.n) || o.n === 0) err(w, `${p}: maxHp needs a non-zero whole n`); break;
          case 'addCard':
            if ((o.card === undefined) === (o.pool === undefined)) err(w, `${p}: addCard needs exactly one of card or pool`);
            if (o.card !== undefined && !isStr(o.card)) err(w, `${p}.card`);
            if (o.pool !== undefined && o.pool !== 'party' && !has('heroIds', o.pool)) err(w, `${p}: bad pool "${o.pool}"`);
            if (o.rarity !== undefined && ['common', 'uncommon', 'rare'].indexOf(o.rarity) < 0) err(w, `${p}: bad rarity "${o.rarity}"`);
            if (o.card !== undefined && o.rarity !== undefined) err(w, `${p}: rarity only applies with pool`);
            if (o.n !== undefined && !(isInt(o.n) && o.n >= 1 && o.n <= 5)) err(w, `${p}.n must be 1..5`);
            if (o.up !== undefined && !isBool(o.up)) err(w, `${p}.up must be a boolean`);
            break;
          case 'removeCard': case 'upgradeCard': case 'transformCard': case 'duplicateCard':
            if (o.n !== undefined && !(isInt(o.n) && o.n >= 1 && o.n <= 5)) err(w, `${p}.n must be 1..5`);
            if (o.random !== undefined && !isBool(o.random)) err(w, `${p}.random must be a boolean`);
            if (o.filter !== undefined) { if (!isObj(o.filter)) err(w, `${p}.filter must be an object`); else { Object.keys(o.filter).forEach((k) => { if (['type', 'hero'].indexOf(k) < 0) err(w, `${p}.filter: unknown key "${k}"`); }); if (o.filter.type !== undefined && !has('cardTypes', o.filter.type)) err(w, `${p}.filter.type`); if (o.filter.hero !== undefined && !has('heroIds', o.filter.hero)) err(w, `${p}.filter.hero`); } }
            break;
          case 'addRelic':
            if ((o.id === undefined) === (o.rarity === undefined)) err(w, `${p}: addRelic needs exactly one of id or rarity`);
            if (o.id !== undefined && !isStr(o.id)) err(w, `${p}.id`);
            if (o.rarity !== undefined && !has('relicRarities', o.rarity)) err(w, `${p}: bad rarity "${o.rarity}"`);
            break;
          case 'addGem':
            if (o.id !== undefined && (o.color !== undefined || o.tier !== undefined)) err(w, `${p}: addGem takes an id or color/tier, not both`);
            if (o.id !== undefined && !isStr(o.id)) err(w, `${p}.id`);
            if (o.color !== undefined && !has('gemColors', o.color)) err(w, `${p}: bad color "${o.color}"`);
            if (o.tier !== undefined && [1, 2, 3].indexOf(o.tier) < 0) err(w, `${p}: bad tier`);
            break;
          case 'addBrush': if (!isStr(o.id)) err(w, `${p}: addBrush needs an id or 'random'`); else if (o.id !== 'random' && !brushes[o.id]) err(w, `${p}: unknown brush "${o.id}"`); break;
          case 'addCurse':
            if (o.id !== undefined && !(isStr(o.id) && /^curse_/.test(o.id))) err(w, `${p}: addCurse id must be a curse_* id`);
            if (o.n !== undefined && !(isInt(o.n) && o.n >= 1 && o.n <= 5)) err(w, `${p}.n must be 1..5`);
            break;
          case 'fight':
            if (ctx !== 'event') err(w, `${p}: fight is only legal in an event outcome`);
            else if (i !== ops.length - 1) err(w, `${p}: fight must be the last op of its outcome`);
            if ((o.enc === undefined) === (o.enemies === undefined)) err(w, `${p}: fight needs exactly one of enc or enemies`);
            if (o.enc !== undefined && !isStr(o.enc)) err(w, `${p}.enc`);
            if (o.enemies !== undefined && !(Array.isArray(o.enemies) && o.enemies.length >= 1 && o.enemies.length <= 4 && o.enemies.every(isStr))) err(w, `${p}.enemies must list 1..4 enemy ids`);
            if (o.tier !== undefined && ['normal', 'elite'].indexOf(o.tier) < 0) err(w, `${p}: fight tier must be normal or elite`);
            if (o.rewards !== undefined && !isBool(o.rewards)) err(w, `${p}.rewards must be a boolean`);
            if (o.win !== undefined) vRun(w, o.win, 'win', p + '.win');
            break;
          case 'flag': if (!isStr(o.k)) err(w, `${p}: flag needs k`); if (o.v !== undefined && !isNum(o.v)) err(w, `${p}.v must be a number`); break;
          case 'paint': if (!(isInt(o.n) && o.n >= 1 && o.n <= 12)) err(w, `${p}: paint needs n 1..12`); break;
          case 'cardReward':
            if (o.rarity !== undefined && ['common', 'uncommon', 'rare'].indexOf(o.rarity) < 0) err(w, `${p}: bad rarity`);
            if (o.hero !== undefined && o.hero !== 'party' && !has('heroIds', o.hero)) err(w, `${p}: bad hero`);
            if (o.n !== undefined && !(isInt(o.n) && o.n >= 1 && o.n <= 5)) err(w, `${p}.n must be 1..5`);
            break;
          default: break;
        }
      });
    };

    // ---- hook lists: relic hooks, hero passives, enemy hooks ----
    const vHooks = (w, list, path, kind) => {
      if (!Array.isArray(list)) return err(w, `${path} must be an array`);
      list.forEach((h, i) => {
        const p = `${path}[${i}]`;
        if (!isObj(h) || !isStr(h.on)) return err(w, `${p}: hook needs "on"`);
        Object.keys(h).forEach((k) => { if (['id', 'name', 'on', 'filter', 'limit', 'once', 'every', 'fx'].indexOf(k) < 0) err(w, `${p}: unknown field "${k}"`); });
        if (kind === 'enemy') { vHookMeta(w, h, p, 'enemyHooks', true); vOps(w, h.fx, 'enemy', p + '.fx'); return; }
        const run = has('runHooks', h.on);
        if (!run && !has('combatHooks', h.on)) return err(w, `${p}: unknown hook "${h.on}"`);
        if (kind === 'passive' && run) err(w, `${p}: a hero passive must use a combat hook`);
        vHookMeta(w, h, p, run ? 'runHooks' : 'combatHooks', false);
        if (run) vRun(w, h.fx, 'hook', p + '.fx'); else vOps(w, h.fx, 'hook', p + '.fx');
      });
    };
    const vMods = (w, mods, list, kindList, path) => {
      if (!isObj(mods)) return err(w, `${path} must be an object`);
      if (!Object.keys(mods).length) err(w, `${path} is empty`);
      Object.keys(mods).forEach((k) => {
        if (LISTS[list].indexOf(k) < 0) return err(w, `${path}: unknown mod "${k}"`);
        if (!isNum(mods[k]) || mods[k] === 0) return err(w, `${path}.${k} must be a non-zero number`);
        const kind = LISTS[kindList][k];
        if (kind === 'int' && !isInt(mods[k])) err(w, `${path}.${k} is a count and must be a whole number`);
        if (kind === 'frac' && (mods[k] < -0.9 || mods[k] > 2)) err(w, `${path}.${k} is a fraction and must be within -0.9..2`);
      });
    };

    // ---- heroes ----
    if (want('heroes')) {
      LISTS.heroIds.forEach((id) => {
        const h = heroes[id]; const w = 'hero ' + id;
        if (!h) return err(w, 'missing');
        if (!isNum(h.maxHp) || h.maxHp < 30) err(w, 'maxHp');
        if (!statuses[h.res] || statuses[h.res].kind !== 'resource') err(w, 'res must be a resource status');
        Object.keys(h.rows).forEach((r) => { if (['front', 'back'].indexOf(r) < 0) err(w, `rows.${r}`); Object.keys(h.rows[r]).forEach((f) => { if (!has('rowFields', f)) err(w, `rows.${r}.${f} unknown`); }); });
        vHooks(w, h.passives, 'passives', 'passive');
        if (!Array.isArray(h.starter) || h.starter.length !== 5) err(w, 'starter must list exactly 5 card ids');
      });
    }

    // ---- cards ----
    if (want('cards')) {
      const shared = (c) => c.hero === 'curse' || c.hero === 'status';
      const inScope = (c) => !opt.hero || c.hero === opt.hero || (opt.hero === 'shared' && shared(c));
      vals(D.cards).filter(inScope).forEach((c) => {
        const w = 'card ' + c.id;
        const playable = c.type !== 'curse' && c.type !== 'status' && c.rarity !== 'token';
        fields(w, c, 'card');
        if (!ID_RE.test(c.id)) err(w, 'id must be snake_case');
        if (!isStr(c.name)) err(w, 'name');
        if (!has('cardTypes', c.type)) err(w, 'type');
        if (!has('rarities', c.rarity)) err(w, 'rarity');
        if (c.hero !== 'curse' && c.hero !== 'status' && !has('heroIds', c.hero)) err(w, `hero "${c.hero}" (use a hero id, or curse or status)`);
        else if (c.rarity === 'token' && !shared(c)) { if (c.id.indexOf(c.hero + '_tok_') !== 0) err(w, `token ids look like ${c.hero}_tok_<name>`); } else if (c.id.indexOf(c.hero + '_') !== 0) err(w, `id must start with "${c.hero}_"`);
        if (c.hero === 'curse' && (c.type !== 'curse' || c.rarity !== 'token')) err(w, 'curse cards are type curse and rarity token');
        if (c.hero === 'status' && (c.type !== 'status' || c.rarity !== 'token')) err(w, 'status cards are type status and rarity token');
        if (c.type === 'curse' && A(c.kw).indexOf('unplayable') < 0) err(w, 'curses are unplayable');
        if (c.cost !== undefined && !(c.cost === 'X' || (isInt(c.cost) && c.cost >= 0 && c.cost <= 5))) err(w, 'cost must be 0..5 or "X"');
        if (c.cost === undefined && playable) err(w, 'cost is required');
        if (c.text !== undefined) err(w, 'card text is generated from fx: remove `text`');
        const env = { cost: c.cost };
        vOps(w, isArr(c.fx) || c.fx === undefined ? A(c.fx) : c.fx, 'card', 'fx', env);
        if (playable && !A(c.fx).length) err(w, 'a playable card needs fx');
        if (c.up !== undefined) {
          if (!isObj(c.up)) err(w, 'up must be an object');
          else {
            Object.keys(c.up).forEach((k) => { if (['fx', 'cost', 'kw'].indexOf(k) < 0) err(w, `up.${k} unknown (up may change fx, cost, kw)`); });
            const upEnv = { cost: c.up.cost !== undefined ? c.up.cost : c.cost };
            if (c.up.fx) vOps(w, c.up.fx, 'card', 'up.fx', upEnv);
            if (c.up.cost !== undefined && !(c.up.cost === 'X' || (isInt(c.up.cost) && c.up.cost >= 0 && c.up.cost <= 5))) err(w, 'up.cost must be 0..5 or "X"');
            if (c.up.kw !== undefined) { if (!Array.isArray(c.up.kw)) err(w, 'up.kw must be an array (it REPLACES kw)'); else c.up.kw.forEach((k) => { if (!has('cardKw', k)) err(w, `unknown keyword "${k}" in up.kw`); }); }
            if (playable && !c.up.fx && c.up.cost === undefined && c.up.kw === undefined) err(w, 'up must change fx, cost or kw');
            if (c.cost === 'X' && c.up.cost !== undefined && c.up.cost !== 'X' && !c.up.fx) err(w, 'up.cost turns an X card into a fixed cost: up.fx is required (per X is illegal there)');
          }
        } else if (playable) err(w, 'missing up (every playable non-token card needs an upgrade)');
        A(c.kw).forEach((k) => { if (!has('cardKw', k)) err(w, `unknown keyword "${k}"`); });
        A(c.slots).forEach((s) => { if (!has('slotColors', s)) err(w, `bad slot colour "${s}"`); });
        if (A(c.slots).length > 3) err(w, 'at most 3 slots');
        if (!isObj(c.art) || !has('motifs', c.art.m)) err(w, `art.m "${c.art && c.art.m}" not in LISTS.motifs`);
        else {
          if (c.rarity !== 'token' && !c.art.c) err(w, 'art.c is required (the unique art pair rule needs it)');
          if (c.art.c && !has('palettes', c.art.c)) err(w, `art.c "${c.art.c}" not in LISTS.palettes`);
          if (c.art.hero !== undefined && !isBool(c.art.hero)) err(w, 'art.hero must be a boolean');
        }
        if (c.hand !== undefined) {
          if (!isObj(c.hand)) err(w, 'hand must be an object');
          else Object.keys(c.hand).forEach((k) => { if (['turnEnd', 'drawn'].indexOf(k) < 0) err(w, `hand.${k} unknown`); else vOps(w, c.hand[k], 'hand', 'hand.' + k); });
        }
        if (c.locked !== undefined && !isBool(c.locked)) err(w, 'locked must be a boolean');
        if (c.locked && (c.rarity === 'starter' || c.rarity === 'common')) err(w, 'starters and commons are never locked');
        if (c.flavor !== undefined && !isStr(c.flavor)) err(w, 'flavor must be a string');
        const flat = [];
        D.walkOps(c.fx, (o) => flat.push(o));
        if (c.type === 'attack' && !flat.some((o) => o.op === 'dmg')) warn(w, 'attack card has no dmg op');
        if (c.type === 'power' && !flat.some((o) => o.op === 'hook' || o.op === 'status')) warn(w, 'power has no hook or status op');
        A(c.slots).forEach((s) => {
          if (s === 'red' && !flat.some((o) => o.op === 'dmg')) warn(w, 'red slot but no dmg op');
          if (s === 'blue' && !flat.some((o) => ['block', 'heal', 'status'].indexOf(o.op) >= 0)) warn(w, 'blue slot but no block, heal or status op');
        });
        noDash(w, c);
      });
      // a hero owner checks their own starters; the integration wave (strict) checks everyone's
      LISTS.heroIds.forEach((id) => {
        if (!strict && opt.hero !== id) return;
        new Set(heroes[id].starter).forEach((cid) => { if (!D.cards[cid]) err('hero ' + id, `starter card "${cid}" is not defined`); });
      });
      if (strict) {
        FIXED.curses.forEach((id) => { const c = D.cards[id]; if (!c) err('fixed', `curse card "${id}" is not defined`); else if (c.hero !== 'curse') err('card ' + id, 'must have hero curse'); });
        FIXED.statusCards.forEach((id) => { const c = D.cards[id]; if (!c) err('fixed', `status card "${id}" is not defined`); else if (c.hero !== 'status') err('card ' + id, 'must have hero status'); });
      }
    }

    // ---- gems ----
    if (want('gems')) {
      vals(D.gems).forEach((g) => {
        const w = 'gem ' + g.id;
        fields(w, g, 'gem');
        if (!ID_RE.test(g.id)) err(w, 'id must be snake_case');
        if (!isStr(g.name)) err(w, 'name');
        if (!has('gemColors', g.color)) err(w, 'color');
        if ([1, 2, 3].indexOf(g.tier) < 0) err(w, 'tier must be 1..3');
        if (!isObj(g.art) || !has('gemCuts', g.art.cut)) err(w, 'art.cut');
        if (g.text !== undefined && !isStr(g.text)) err(w, 'text must be a string when given (it is generated by default)');
        if (g.locked !== undefined && !isBool(g.locked)) err(w, 'locked must be a boolean');
        if (!isObj(g.mod) || !Object.keys(g.mod).length) return err(w, 'mod must be a non-empty object');
        const m = g.mod;
        Object.keys(m).forEach((k) => { if (!has('gemModKeys', k)) err(w, `mod.${k} unknown`); });
        ['dmg', 'block', 'heal', 'hits', 'draw', 'energy', 'poison'].forEach((k) => { if (m[k] !== undefined && !(isInt(m[k]) && m[k] > 0)) err(w, `mod.${k} must be a positive whole number`); });
        if (m.cost !== undefined && !(isInt(m.cost) && m.cost < 0 && g.tier === 3)) err(w, 'mod.cost must be a negative whole number and tier 3 only');
        if (m.status !== undefined) {
          if (!isObj(m.status) || !D.isStatus(m.status.s)) err(w, 'mod.status.s unknown status');
          else {
            Object.keys(m.status).forEach((k) => { if (['s', 'n', 'tgt'].indexOf(k) < 0) err(w, `mod.status.${k} unknown`); });
            if (!isInt(m.status.n) || m.status.n === 0) err(w, 'mod.status.n must be a non-zero whole number');
            if (m.status.tgt !== undefined && !['heroTgt', 'enemyCardTgt'].some((l) => has(l, m.status.tgt))) err(w, 'mod.status.tgt');
          }
        }
        if (m.fx !== undefined) vOps(w, m.fx, 'gem', 'mod.fx');
        ['kw', 'kwRemove'].forEach((k) => { if (m[k] !== undefined) { if (!Array.isArray(m[k])) err(w, `mod.${k} must be an array`); else m[k].forEach((x) => { if (!has('cardKw', x)) err(w, `mod.${k} unknown keyword "${x}"`); }); } });
        if (m.cond !== undefined && ['front', 'back'].indexOf(m.cond) < 0) err(w, 'mod.cond must be front or back');
        noDash(w, g);
      });
    }

    // ---- relics ----
    if (want('relics')) {
      vals(D.relics).forEach((r) => {
        const w = 'relic ' + r.id;
        fields(w, r, 'relic');
        if (!ID_RE.test(r.id)) err(w, 'id must be snake_case');
        if (!isStr(r.name)) err(w, 'name');
        if (!isStr(r.text)) err(w, 'text'); else if (r.text.length > QUOTA.relics.textMax) err(w, `text over ${QUOTA.relics.textMax} characters`);
        // optional flavour line (display only): printable ASCII, at most flavorMax characters, ends with . ! or ?
        if (r.flavor !== undefined) {
          if (!isStr(r.flavor)) err(w, 'flavor must be a non-empty string');
          else {
            if (r.flavor.length > QUOTA.relics.flavorMax) err(w, `flavor over ${QUOTA.relics.flavorMax} characters`);
            if (!/^[\x20-\x7e]+$/.test(r.flavor)) err(w, 'flavor must be printable ASCII');
            if (!/[.!?]$/.test(r.flavor)) err(w, 'flavor must end with . ! or ?');
          }
        }
        if (!has('relicRarities', r.rarity)) err(w, 'rarity');
        if (!isObj(r.art) || !has('relicIcons', r.art.m)) err(w, `art.m "${r.art && r.art.m}" not in LISTS.relicIcons`);
        else if (r.art.c && !has('palettes', r.art.c)) err(w, 'art.c not in LISTS.palettes');
        if (r.mods !== undefined) vMods(w, r.mods, 'mods', 'modKind', 'mods');
        if (r.hooks !== undefined) vHooks(w, r.hooks, 'hooks', 'relic');
        if (r.rows !== undefined) {
          if (!isObj(r.rows)) err(w, 'rows must be an object');
          else Object.keys(r.rows).forEach((row) => { if (['front', 'back'].indexOf(row) < 0) err(w, `rows.${row}`); else cmp(w, r.rows[row], `rows.${row}`, LISTS.rowFields, true); });
        }
        if (r.hero !== undefined && !has('heroIds', r.hero)) err(w, 'hero');
        if (r.locked !== undefined && !isBool(r.locked)) err(w, 'locked must be a boolean');
        if (!r.mods && !r.hooks && !r.rows) err(w, 'needs mods, hooks or rows');
        noDash(w, r);
      });
      if (strict) Object.keys(FIXED.relics).forEach((id) => { const r = D.relics[id]; if (!r) err('fixed', `relic "${id}" is not defined`); else if (r.rarity !== FIXED.relics[id]) err('relic ' + id, `must be rarity ${FIXED.relics[id]}`); });
    }

    // ---- enemies and encounters ----
    if (want('enemies')) {
      const chOk = (ch) => !opt.chapter || ch === opt.chapter;
      const ckAi = (w, e, ai, where) => {
        if (!isObj(ai)) return err(w, `${where} must be an object`);
        Object.keys(ai).forEach((k) => { if (['open', 'seq', 'weighted', 'noRepeat', 'rules'].indexOf(k) < 0) err(w, `${where}: unknown key "${k}"`); });
        if (Array.isArray(ai.seq) === Array.isArray(ai.weighted)) err(w, `${where} needs exactly one of seq or weighted`);
        if (Array.isArray(ai.seq) && !ai.seq.length) err(w, `${where}.seq is empty`);
        if (Array.isArray(ai.weighted)) {
          if (!ai.weighted.length) err(w, `${where}.weighted is empty`);
          ai.weighted.forEach((x, i) => { if (!Array.isArray(x) || x.length !== 2 || !isNum(x[1]) || x[1] <= 0) err(w, `${where}.weighted[${i}] must be [move, weight > 0]`); });
        }
        if (ai.noRepeat !== undefined && !(isInt(ai.noRepeat) && ai.noRepeat >= 1)) err(w, `${where}.noRepeat must be an integer >= 1`);
        if (ai.noRepeat !== undefined && !ai.weighted) err(w, `${where}.noRepeat only applies to weighted`);
        if (ai.open !== undefined && !Array.isArray(ai.open)) err(w, `${where}.open must be an array`);
        if (ai.rules !== undefined && !Array.isArray(ai.rules)) err(w, `${where}.rules must be an array`);
        const refs = [].concat(A(ai.open), A(ai.seq), A(ai.weighted).map((x) => x && x[0]), A(ai.rules).map((r) => r && r.do));
        refs.forEach((m) => { if (!isStr(m) || !e.moves[m]) err(w, `${where} references unknown move "${m}"`); });
        A(ai.rules).forEach((r, i) => {
          if (!isObj(r)) return err(w, `${where}.rules[${i}] must be an object`);
          Object.keys(r).forEach((k) => { if (['if', 'do', 'once'].indexOf(k) < 0) err(w, `${where}.rules[${i}]: unknown key "${k}"`); });
          vCond(w, r.if, `${where}.rules[${i}].if`, 'ai');
          if (r.once !== undefined && !isBool(r.once)) err(w, `${where}.rules[${i}].once must be a boolean`);
        });
      };
      vals(D.enemies).filter((e) => chOk(e.chapter)).forEach((e) => {
        const w = 'enemy ' + e.id;
        const r = rosterById[e.id];
        fields(w, e, 'enemy');
        if (!ID_RE.test(e.id)) err(w, 'id must be snake_case');
        if (!r) err(w, 'id is not in the fixed roster (CONTENT_SPEC 4)');
        else {
          if (e.chapter !== r.chapter) err(w, `chapter must be ${r.chapter}`);
          if (e.tier !== r.tier) err(w, `tier must be ${r.tier}`);
          if (e.size !== r.size) err(w, `size must be ${r.size}`);
          if (e.name !== r.name) warn(w, `name should be "${r.name}"`);
        }
        if (!isStr(e.name)) err(w, 'name');
        if (e.title !== undefined && !isStr(e.title)) err(w, 'title must be a string');
        if (e.tier === 'boss' && !isStr(e.title)) warn(w, 'a boss should have a title');
        if (!has('chapters', e.chapter)) err(w, 'chapter');
        if (!has('tiers', e.tier)) err(w, 'tier');
        if (!has('sizes', e.size)) err(w, 'size');
        if (!Array.isArray(e.hp) || e.hp.length !== 2 || !isInt(e.hp[0]) || !isInt(e.hp[1]) || e.hp[0] < 1 || e.hp[1] < e.hp[0]) err(w, 'hp must be [min,max] whole numbers');
        if (!isObj(e.moves) || !Object.keys(e.moves).length) return err(w, 'moves');
        Object.keys(e.moves).forEach((mid) => {
          const m = e.moves[mid]; const mw = `${w} move ${mid}`;
          if (!ID_RE.test(mid)) err(mw, 'move id must be snake_case');
          if (!isObj(m)) return err(mw, 'move must be an object');
          Object.keys(m).forEach((k) => { if (['name', 'kind', 'fx', 'say'].indexOf(k) < 0) err(mw, `unknown field "${k}"`); });
          if (!isStr(m.name)) err(mw, 'name');
          if (!has('intents', m.kind)) return err(mw, `kind "${m.kind}"`);
          if (m.say !== undefined && !isStr(m.say)) err(mw, 'say must be a string');
          vOps(mw, isArr(m.fx) || m.fx === undefined ? A(m.fx) : m.fx, 'enemy', 'fx');
          const flat = [];
          D.walkOps(m.fx, (o) => flat.push(o.op));
          if (INTENT_NEEDS[m.kind] && !INTENT_NEEDS[m.kind].some((op) => flat.indexOf(op) >= 0)) err(mw, `kind "${m.kind}" needs a ${INTENT_NEEDS[m.kind].join(' or ')} op (the intent icon must be honest)`);
          if (m.kind === 'none' && flat.length) err(mw, 'kind "none" has no fx');
          if (flat.indexOf('dmg') >= 0 && ATTACKISH.indexOf(m.kind) < 0) warn(mw, 'a move that deals damage should use kind attack, multi or heavy');
        });
        ckAi(w, e, e.ai, 'ai');
        if (e.phases !== undefined) {
          if (!Array.isArray(e.phases)) err(w, 'phases must be an array');
          else e.phases.forEach((p, i) => {
            if (!isObj(p)) return err(w, `phases[${i}] must be an object`);
            Object.keys(p).forEach((k) => { if (['at', 'say', 'fx', 'ai'].indexOf(k) < 0) err(w, `phases[${i}]: unknown key "${k}"`); });
            if (!isNum(p.at) || p.at <= 0 || p.at >= 1) err(w, `phases[${i}].at must be in (0,1)`);
            if (i > 0 && isNum(p.at) && isNum(O(e.phases[i - 1]).at) && p.at >= e.phases[i - 1].at) err(w, 'phases must be sorted by descending at');
            if (p.say !== undefined && !isStr(p.say)) err(w, `phases[${i}].say`);
            if (p.fx !== undefined) vOps(w, p.fx, 'enemy', `phases[${i}].fx`);
            if (p.ai !== undefined) ckAi(w, e, p.ai, `phases[${i}].ai`);
          });
        }
        if (e.start !== undefined) vOps(w, e.start, 'enemy', 'start');
        if (e.hooks !== undefined) vHooks(w, e.hooks, 'hooks', 'enemy');
        if (e.immune !== undefined) { if (!Array.isArray(e.immune)) err(w, 'immune must be an array'); else e.immune.forEach((s) => { if (!D.isStatus(s)) err(w, `immune: unknown status "${s}"`); }); }
        if (!isObj(e.art) || !isStr(e.art.id)) err(w, 'art.id'); else if (e.art.id !== e.id) err(w, 'art.id must equal the enemy id');
        if (!isStr(e.lore)) err(w, 'lore is required (1 to 2 sentences for the bestiary)'); else if (e.lore.length > 260) err(w, 'lore over 260 characters');
        if (!Array.isArray(e.tags) || !e.tags.length) err(w, 'tags needs at least one of LISTS.enemyTags');
        else e.tags.forEach((t) => { if (!has('enemyTags', t)) err(w, `tag "${t}" not in LISTS.enemyTags`); });
        noDash(w, e);
      });
      [1, 2, 3].filter(chOk).forEach((ch) => {
        const p = D.encounters[ch];
        const lim = ch === 1 ? 3 : 4;
        [['normal', p.normal], ['elite', p.elite]].forEach(([kind, groups]) => groups.forEach((g) => {
          if (!isObj(g)) return err('encounter ch' + ch, 'a group must be an object');
          const w = `encounter ch${ch} ${g.id}`;
          if (!isStr(g.id) || g.id.indexOf('ch' + ch + '_') !== 0) err(w, `group id must start with "ch${ch}_"`);
          if (!isNum(g.w) || g.w <= 0) err(w, 'w must be > 0');
          if (!isNum(g.min) || g.min < 0 || g.min > 1) err(w, 'min must be in 0..1');
          if (!Array.isArray(g.enemies) || g.enemies.length < 1 || g.enemies.length > lim) return err(w, `enemies must list 1..${lim} ids`);
          const defs = g.enemies.map((id) => D.enemies[id]);
          g.enemies.forEach((id, i) => {
            if (!defs[i]) { if (strict) err(w, `unknown enemy "${id}"`); return; }
            if (defs[i].chapter !== ch) err(w, `enemy "${id}" belongs to chapter ${defs[i].chapter}`);
            if (defs[i].tier === 'boss') err(w, `enemy "${id}" is a boss`);
            if (kind === 'normal' && defs[i].tier === 'elite') err(w, `enemy "${id}" is an elite in a normal group`);
          });
          if (defs.every(Boolean)) {
            if (kind === 'normal' && !defs.some((d) => d.tier === 'normal')) err(w, 'a normal group needs at least one normal enemy');
            if (kind === 'elite' && defs.filter((d) => d.tier === 'elite').length !== 1) err(w, 'an elite group has exactly one elite');
          }
        }));
        if (p.boss !== undefined) {
          if (p.boss !== FIXED.bosses[ch]) err('encounter ch' + ch, `boss must be "${FIXED.bosses[ch]}"`);
          else if (strict && !D.enemies[p.boss]) err('encounter ch' + ch, `unknown boss "${p.boss}"`);
        } else if (strict) err('encounter ch' + ch, 'boss encounter missing');
      });
      if (strict) [1, 2, 3].filter(chOk).forEach((ch) => ROSTER[ch].forEach((r) => { if (!D.enemies[r.id]) err('roster', `enemy "${r.id}" (chapter ${ch}, ${r.tier}) is not defined`); }));
    }

    // ---- events ----
    if (want('events')) {
      vals(D.events).forEach((ev) => {
        const w = 'event ' + ev.id;
        fields(w, ev, 'event');
        if (!ID_RE.test(ev.id)) err(w, 'id must be snake_case');
        if (!isStr(ev.title) || ev.title.length > 40) err(w, 'title must be 1 to 40 characters');
        if (!isStr(ev.text) || ev.text.length < 60 || ev.text.length > 220) err(w, 'text must be 60 to 220 characters');
        if (!isObj(ev.art) || !has('scenes', ev.art.scene)) err(w, 'art.scene must be in LISTS.scenes');
        if (ev.chapters !== undefined) { if (!Array.isArray(ev.chapters) || !ev.chapters.length) err(w, 'chapters must be a non-empty array (omit it for any chapter)'); else ev.chapters.forEach((n) => { if (!has('chapters', n)) err(w, `chapters has bad value ${n}`); }); }
        if (ev.once !== undefined && !isBool(ev.once)) err(w, 'once must be a boolean');
        if (ev.w !== undefined && !(isNum(ev.w) && ev.w > 0)) err(w, 'w must be a number > 0');
        if (ev.when !== undefined) {
          if (!isObj(ev.when)) err(w, 'when must be an object');
          else {
            Object.keys(ev.when).forEach((k) => { if (!has('whenKeys', k)) err(w, `when: unknown key "${k}"`); });
            if (ev.when.hero !== undefined && !has('heroIds', ev.when.hero)) err(w, 'when.hero');
            if (ev.when.flag !== undefined && !isStr(ev.when.flag)) err(w, 'when.flag');
            if (ev.when.relic !== undefined && !isStr(ev.when.relic)) err(w, 'when.relic');
          }
        }
        if (!Array.isArray(ev.choices) || ev.choices.length < 2 || ev.choices.length > 4) return err(w, 'choices must be 2..4');
        ev.choices.forEach((c, i) => {
          const cp = `choices[${i}]`;
          if (!isObj(c)) return err(w, `${cp} must be an object`);
          Object.keys(c).forEach((k) => { if (FIELDS.choice.indexOf(k) < 0) err(w, `${cp}: unknown field "${k}"`); });
          if (!isStr(c.label)) err(w, `${cp}.label`);
          if (c.cost !== undefined && !isStr(c.cost)) err(w, `${cp}.cost must be a display string`);
          if (c.req !== undefined) {
            if (!isObj(c.req)) err(w, `${cp}.req must be an object`);
            else {
              Object.keys(c.req).forEach((k) => { if (!has('reqKeys', k)) err(w, `${cp}.req: unknown key "${k}"`); });
              ['hpPct', 'hpBelow'].forEach((k) => { if (c.req[k] !== undefined && !(isNum(c.req[k]) && c.req[k] > 0 && c.req[k] <= 1)) err(w, `${cp}.req.${k} must be a fraction in (0,1]`); });
              if (c.req.gold !== undefined && !(isInt(c.req.gold) && c.req.gold > 0)) err(w, `${cp}.req.gold`);
              if (c.req.chapter !== undefined && !has('chapters', c.req.chapter)) err(w, `${cp}.req.chapter`);
              if (c.req.hero !== undefined && !has('heroIds', c.req.hero)) err(w, `${cp}.req.hero`);
              ['relic', 'flag'].forEach((k) => { if (c.req[k] !== undefined && !isStr(c.req[k])) err(w, `${cp}.req.${k}`); });
            }
          }
          if (!Array.isArray(c.out) || !c.out.length) return err(w, `${cp}.out`);
          c.out.forEach((o, j) => {
            const op = `${cp}.out[${j}]`;
            if (!isObj(o)) return err(w, `${op} must be an object`);
            if (!isNum(o.w) || o.w <= 0) err(w, `${op}.w must be a number > 0`);
            if (!isStr(o.text)) err(w, `${op}.text`);
            Object.keys(o).forEach((k) => { if (['w', 'text', 'ops'].indexOf(k) < 0) err(w, `${op}: unknown key "${k}"`); });
            vRun(w, isArr(o.ops) || o.ops === undefined ? A(o.ops) : o.ops, 'event', op + '.ops');
          });
          if (c.cost && !c.out.some((o) => A(o && o.ops).some((x) => x && ['gold', 'hurt', 'maxHp', 'removeCard', 'addCurse', 'heal', 'ink'].indexOf(x.op) >= 0))) warn(w, `${cp} shows a cost but no outcome pays it`);
        });
        noDash(w, ev);
      });
    }

    // ---- achievements, trials, tips, lore ----
    if (want('achievements')) {
      vals(D.achievements).forEach((a) => {
        const w = 'achievement ' + a.id;
        fields(w, a, 'achievement');
        if (!ID_RE.test(a.id)) err(w, 'id must be snake_case');
        if (!isStr(a.name) || !isStr(a.text)) err(w, 'name and text');
        if (!isObj(a.stat) || !has('statKeys', a.stat.k) || !isNum(a.stat.gte) || a.stat.gte <= 0) err(w, 'stat {k in LISTS.statKeys, gte > 0}');
        if (a.reward !== undefined && !(isObj(a.reward) && isInt(a.reward.inkstones) && a.reward.inkstones > 0)) err(w, 'reward must be {inkstones: whole number > 0}');
        noDash(w, a);
      });
      if (strict) {
        LISTS.heroIds.forEach((id) => { const u = heroes[id].unlock; if (u && !D.achievements[u.ach]) err('hero ' + id, `unlock achievement "${u.ach}" not defined`); });
        FIXED.achievements.forEach((id) => { if (!D.achievements[id]) err('fixed', `achievement "${id}" is not defined`); });
      }
    }
    if (want('trials')) {
      const seen = {};
      vals(D.trials).forEach((t) => {
        const w = 'trial ' + t.id;
        fields(w, t, 'trial');
        if (!isInt(t.level) || t.level < 1 || t.level > 10) err(w, 'level must be 1..10'); else { if (seen[t.level]) err(w, `level ${t.level} defined twice`); seen[t.level] = true; if (t.id !== 'trial_' + t.level) err(w, `id must be trial_${t.level}`); }
        if (!isStr(t.name) || !isStr(t.text)) err(w, 'name and text');
        vMods(w, t.mods, 'trialMods', 'trialModKind', 'mods');
        noDash(w, t);
      });
    }
    if (want('tips')) {
      D.tips.forEach((t, i) => {
        const w = 'tips[' + i + ']';
        if (!isStr(t)) err(w, 'must be a string'); else if (t.length > 110) err(w, 'over 110 characters'); else if (DASH.test(t)) err(w, 'contains an em or en dash');
      });
    }
    if (want('lore')) {
      vals(D.lore).forEach((l) => {
        const w = 'lore ' + l.id;
        if (!ID_RE.test(l.id)) err(w, 'id must be snake_case');
        if (/^barks_/.test(l.id)) {
          if (!has('heroIds', l.id.slice(6))) err(w, 'barks_<heroId>');
          Object.keys(O(l.lines)).forEach((k) => { if (FIXED.barkKeys.indexOf(k) < 0) err(w, `lines.${k} unknown`); });
          FIXED.barkKeys.forEach((k) => {
            const a = l.lines && l.lines[k];
            if (!Array.isArray(a) || a.length !== 5) err(w, `lines.${k} needs exactly 5 strings`);
            else a.forEach((s) => { if (!isStr(s) || s.length > 64) err(w, `lines.${k}: each line is a string of at most 64 characters`); });
          });
        } else if (!isStr(l.title) || !isStr(l.text) || l.title.length > 40) err(w, 'title (at most 40 characters) and text');
        if (l.text !== undefined && isStr(l.text) && l.text.length > 700) err(w, 'text over 700 characters');
        noDash(w, l);
      });
      if (strict) FIXED.lore.forEach((id) => { if (!D.lore[id]) err('fixed', `lore "${id}" is not defined`); });
    }

    // ---- cross-file references (strict only) ----
    if (strict && !only) {
      const groupIds = {};
      [1, 2, 3].forEach((ch) => D.encounters[ch].normal.concat(D.encounters[ch].elite).forEach((g) => { groupIds[O(g).id] = true; }));
      const chk = (w, ops, ctx) => D.walkOps(ops, (o) => {
        if (o.op === 'add') {
          const c = D.cards[o.card];
          if (!c) err(w, `add: unknown card "${o.card}"`);
          else if (ctx === 'enemy' && c.hero !== 'curse' && c.hero !== 'status') err(w, `add: enemy ops may only add curse or status cards ("${o.card}")`);
        }
        if (o.op === 'summon') { const s = D.enemies[o.enemy]; if (!s) err(w, `summon: unknown enemy "${o.enemy}"`); else if (s.tier !== 'minion') err(w, `summon: "${o.enemy}" is not a minion`); }
      });
      const chkRun = (w, ops) => A(ops).forEach((o) => {
        if (!isObj(o)) return;
        if (o.op === 'addRelic' && o.id && !D.relics[o.id]) err(w, `addRelic: unknown relic "${o.id}"`);
        if (o.op === 'addCard' && o.card) { const c = D.cards[o.card]; if (!c) err(w, `addCard: unknown card "${o.card}"`); else if (c.hero === 'curse') err(w, 'addCard: use addCurse for curse cards'); }
        if (o.op === 'addGem' && o.id && !D.gems[o.id]) err(w, `addGem: unknown gem "${o.id}"`);
        if (o.op === 'addCurse' && o.id && !(D.cards[o.id] && D.cards[o.id].hero === 'curse')) err(w, `addCurse: unknown curse "${o.id}"`);
        if (o.op === 'fight') {
          A(o.enemies).forEach((id) => { if (!D.enemies[id]) err(w, `fight: unknown enemy "${id}"`); });
          if (o.enc && !groupIds[o.enc]) err(w, `fight: unknown enc "${o.enc}"`);
          chkRun(w, o.win);
        }
      });
      vals(D.cards).forEach((c) => { const w = 'card ' + c.id; chk(w, c.fx, 'card'); chk(w, c.up && c.up.fx, 'card'); Object.keys(O(c.hand)).forEach((k) => chk(w, c.hand[k], 'card')); });
      vals(D.gems).forEach((g) => chk('gem ' + g.id, g.mod && g.mod.fx, 'card'));
      vals(D.enemies).forEach((e) => {
        const w = 'enemy ' + e.id;
        Object.keys(O(e.moves)).forEach((m) => chk(w, O(e.moves[m]).fx, 'enemy'));
        chk(w, e.start, 'enemy'); A(e.phases).forEach((p) => chk(w, O(p).fx, 'enemy')); A(e.hooks).forEach((h) => chk(w, O(h).fx, 'enemy'));
      });
      vals(D.relics).forEach((r) => A(r.hooks).forEach((h) => { if (!isObj(h)) return; if (has('runHooks', h.on)) chkRun('relic ' + r.id, h.fx); else chk('relic ' + r.id, h.fx, 'card'); }));
      LISTS.heroIds.forEach((id) => A(heroes[id].passives).forEach((h) => chk('hero ' + id, O(h).fx, 'card')));
      vals(D.events).forEach((ev) => {
        const w = 'event ' + ev.id;
        if (ev.when && ev.when.relic && !D.relics[ev.when.relic]) err(w, `when.relic unknown "${ev.when.relic}"`);
        A(ev.choices).forEach((c) => { if (!isObj(c)) return; if (c.req && c.req.relic && !D.relics[c.req.relic]) err(w, `req.relic unknown "${c.req.relic}"`); A(c.out).forEach((o) => chkRun(w, O(o).ops)); });
      });
      vals(D.trials).forEach((t) => { const need = t.mods && t.mods.curses; if (need && !FIXED.curses.every((id) => D.cards[id])) err('trial ' + t.id, 'curses mod needs the curse_* cards'); });
    }

    const counts = {};
    REG.forEach((k) => { counts[k] = Array.isArray(D[k]) ? D[k].length : Object.keys(D[k]).length; });
    counts.groups = [1, 2, 3].reduce((n, ch) => n + D.encounters[ch].normal.length + D.encounters[ch].elite.length, 0);
    return { errors, warnings, counts };
  };

  // ------------------------------------------------------------------
  // Audit: quotas (CONTENT_SPEC 3 to 6) and guidelines (the enemy number tables). Returns strings.
  // 'audit ...' lines are hard quota breaks the integration wave fails on; 'guide ...' lines are
  // soft numeric guidance the balance wave tunes. DATA.audit(kind, {hero, chapter}) scopes it.
  // ------------------------------------------------------------------
  D.audit = (kind, opt) => {
    opt = opt || {};
    const out = [];
    const want = (k) => !kind || kind === k;
    const need = (who, ok, msg) => { if (!ok) out.push(`audit ${who}: ${msg}`); };
    const soft = (who, ok, msg) => { if (!ok) out.push(`guide ${who}: ${msg}`); };
    const flatOf = (fx) => { const f = []; D.walkOps(fx, (o) => f.push(o)); return f; };
    const n1 = (v) => (isNum(v) ? v : isObj(v) && isNum(v.base) ? v.base : 0);
    const count = (list, f) => list.filter(f).length;

    if (want('cards')) {
      LISTS.heroIds.filter((id) => !opt.hero || id === opt.hero).forEach((id) => {
        const q = QUOTA.cards;
        const cs = vals(D.cards).filter((c) => c.hero === id && c.rarity !== 'token');
        const nr = (r) => count(cs, (c) => c.rarity === r);
        const nt = (t) => count(cs, (c) => c.type === t);
        need(id, nr('starter') === q.starter && nr('common') === q.common && nr('uncommon') === q.uncommon && nr('rare') === q.rare,
          `need ${q.starter}/${q.common}/${q.uncommon}/${q.rare} starter/common/uncommon/rare, have ${nr('starter')}/${nr('common')}/${nr('uncommon')}/${nr('rare')}`);
        need(id, nt('attack') >= cs.length * 0.3 && nt('skill') >= cs.length * 0.3, 'attack or skill share under 30 percent');
        need(id, nt('power') >= q.powers, `fewer than ${q.powers} powers`);
        need(id, cs.some((c) => c.cost === 'X'), 'no X cost card');
        need(id, count(cs, (c) => flatOf(c.fx).some((o) => o.op === 'cond' && o.if && o.if.row)) >= 3, 'fewer than 3 cards using cond on row');
        need(id, count(cs, (c) => flatOf(c.fx).some((o) => o.tgt === 'ally' || o.tgt === 'both' || (isObj(o.n) && o.n.who === 'ally'))) >= 4, 'fewer than 4 cards touching the ally hero');
        need(id, count(cs, (c) => flatOf(c.fx).some((o) => o.op === 'pick')) >= 2, 'fewer than 2 pick cards');
        need(id, count(cs, (c) => A(c.kw).length > 0) >= 5, 'fewer than 5 cards with keywords');
        need(id, !cs.some((c) => c.locked && (c.rarity === 'starter' || c.rarity === 'common')), 'a starter or common is locked');
        need(id, count(cs, (c) => c.locked && c.rarity === 'uncommon') <= q.lockedUncommon && count(cs, (c) => c.locked && c.rarity === 'rare') <= q.lockedRare, 'too many locked cards');
        const pairs = cs.map((c) => (c.art ? c.art.m + '/' + c.art.c : '?'));
        need(id, new Set(pairs).size === pairs.length, 'two cards share the same art.m plus art.c pair');
        Object.keys(q.slots).forEach((col) => need(id, count(cs, (c) => A(c.slots).indexOf(col) >= 0) >= q.slots[col], `fewer than ${q.slots[col]} cards with a ${col} slot`));
        need(id, cs.every((c) => { const n = A(c.slots).length; return c.rarity === 'uncommon' ? n >= 1 && n <= 2 : c.rarity === 'rare' ? n === 2 : n === 1; }), 'slot counts: starters and commons 1, uncommons 1 to 2, rares 2');
        need(id, count(cs, (c) => c.rarity === 'rare' && A(c.slots).indexOf('any') >= 0) <= 4, 'more than 4 rares with a prism slot');
        need(id, cs.filter((c) => c.type === 'power').every((c) => A(c.slots).indexOf('gold') >= 0), 'every power needs a gold slot');
        need(id, cs.filter((c) => c.rarity === 'rare').every((c) => isStr(c.flavor)), 'every rare needs a flavor line');
        need(id, count(cs, (c) => c.type === 'attack' && c.art && c.art.hero) >= nt('attack') * 0.3, 'art.hero on too few attacks (use it on about half of them)');
        if (D.cardPlain) cs.forEach((c) => { if (D.cardPlain(c.id).length > 110) out.push(`audit ${id}: ${c.id} rules text over 110 characters`); });
      });
    }

    if (want('enemies')) {
      [1, 2, 3].filter((ch) => !opt.chapter || ch === opt.chapter).forEach((ch) => {
        const q = QUOTA.enemies, w = 'ch' + ch;
        const es = vals(D.enemies).filter((e) => e.chapter === ch);
        ['normal', 'elite', 'minion', 'boss'].forEach((t) => need(w, count(es, (e) => e.tier === t) === q[t], `need exactly ${q[t]} ${t} enemies`));
        const p = D.encounters[ch];
        need(w, p.normal.length >= q.normalGroups, `need at least ${q.normalGroups} normal groups, have ${p.normal.length}`);
        need(w, p.elite.length === q.eliteGroups, `need exactly ${q.eliteGroups} elite groups, have ${p.elite.length}`);
        need(w, count(p.normal, (g) => O(g).min <= 0.1) >= 3 && count(p.normal, (g) => O(g).min >= 0.6) >= 2, 'group min values must spread from 0 to 0.8 (3 at <= 0.1, 2 at >= 0.6)');
        need(w, p.boss === FIXED.bosses[ch], 'boss encounter');
        const moves = (e) => Object.keys(O(e.moves)).map((k) => e.moves[k]).filter(isObj);
        const ops = (e) => [].concat(...moves(e).map((m) => flatOf(m.fx)), flatOf(e.start), ...A(e.phases).filter(isObj).map((ph) => flatOf(ph.fx)));   // filter first: spreading a holey array yields undefined
        const field = es.filter((e) => e.tier !== 'minion');
        need(w, count(field, (e) => ops(e).some((o) => o.op === 'dmg' && (o.tgt === 'back' || o.tgt === 'both'))) >= 2, 'fewer than 2 enemies striking the back row or all heroes');
        need(w, count(field, (e) => ops(e).some((o) => o.op === 'status' && D.isDebuff(o.s) && (o.tgt === undefined || LISTS.enemyHeroTgt.indexOf(o.tgt) >= 0))) >= 2, 'fewer than 2 enemies that debuff heroes');
        need(w, count(es, (e) => ops(e).some((o) => o.op === 'summon')) >= 1, 'no summoner');
        need(w, count(field, (e) => ops(e).some((o) => o.op === 'status' && (o.s === 'thorns' || o.s === 'plating') && (o.tgt === undefined || o.tgt === 'self'))) >= 1, 'no enemy with Thorns or Plating');
        need(w, count(field, (e) => moves(e).some((m) => m.kind === 'multi' || flatOf(m.fx).some((o) => o.op === 'dmg' && n1(o.hits) >= 2))) >= 2, 'fewer than 2 multi-hitters');
        need(w, count(es, (e) => ops(e).some((o) => o.op === 'add')) >= 1, 'no enemy that adds junk cards');
        es.filter((e) => e.tier === 'elite').forEach((e) => need(w, ((e.ai && e.ai.rules && e.ai.rules.length) || (e.phases && e.phases.length)), `${e.id}: an elite needs a rules entry or a phase`));
        es.filter((e) => e.tier === 'boss').forEach((e) => {
          need(w, e.ai && e.ai.open && e.ai.open.length && e.ai.rules && e.ai.rules.length, `${e.id}: a boss uses open and rules`);
          need(w, A(e.phases).length === q.bossPhases[ch], `${e.id}: needs exactly ${q.bossPhases[ch]} phases entries`);
          need(w, A(e.phases).every((ph) => isStr(O(ph).say)), `${e.id}: every phase needs a say line`);
          need(w, ops(e).some((o) => o.op === 'summon'), `${e.id}: a boss summons minions`);
        });
        // guidelines
        const avgDmg = (e) => {
          const dmg = (m) => flatOf(m.fx).filter((o) => o.op === 'dmg').reduce((s, o) => s + n1(o.n) * Math.max(1, n1(o.hits)), 0);
          const ai = e.ai || {};
          if (Array.isArray(ai.weighted) && ai.weighted.length) { const ws = ai.weighted.filter(isArr2), tot = ws.reduce((s, x) => s + x[1], 0); return tot > 0 ? ws.reduce((s, x) => s + (isObj(O(e.moves)[x[0]]) ? dmg(e.moves[x[0]]) : 0) * x[1] / tot, 0) : 0; }
          const seq = A(ai.seq); return seq.length ? seq.reduce((s, m) => s + (isObj(O(e.moves)[m]) ? dmg(e.moves[m]) : 0), 0) / seq.length : 0;
        };
        es.forEach((e) => {
          const g = GUIDE.hp[ch][e.tier];
          if (g && isArr2(e.hp)) soft(e.id, e.hp[0] >= g[0] && e.hp[1] <= g[1], `hp ${e.hp[0]} to ${e.hp[1]} outside ${g[0]} to ${g[1]}`);
          const cap = e.tier === 'minion' ? GUIDE.hit[ch].minion[1] : e.tier === 'normal' ? GUIDE.heavy[ch].normal[1] : e.tier === 'boss' ? GUIDE.heavy[ch].boss[1] : null;
          if (cap !== null) soft(e.id, moves(e).every((m) => flatOf(m.fx).every((o) => o.op !== 'dmg' || n1(o.n) <= cap)), `a hit above ${cap}`);
          if (e.tier === 'boss') soft(e.id, avgDmg(e) <= GUIDE.round[ch][1], `average round damage ${Math.round(avgDmg(e))} above ${GUIDE.round[ch][1]}`);
        });
        [['normal', p.normal], ['elite', p.elite]].forEach(([k, groups]) => groups.forEach((g) => {
          const members = A(O(g).enemies).map((id) => D.enemies[id]).filter(Boolean).filter((e) => e.tier !== 'minion');
          const sum = members.reduce((s, e) => s + avgDmg(e), 0), b = GUIDE.budget[ch][k];
          soft(g.id, sum <= b[1], `group average round damage ${Math.round(sum)} above budget ${b[1]}`);
        }));
      });
    }

    if (want('relics')) {
      const q = QUOTA.relics, rs = vals(D.relics);
      ['common', 'uncommon', 'rare', 'boss', 'shop'].forEach((r) => need('relics', count(rs, (x) => x.rarity === r) === q[r], `need exactly ${q[r]} ${r} relics, have ${count(rs, (x) => x.rarity === r)}`));
      LISTS.heroIds.forEach((id) => need('relics', count(rs, (x) => x.hero === id) === q.perHero, `need exactly ${q.perHero} relics for ${id}`));
      need('relics', count(rs, (x) => x.locked) <= Math.floor(rs.length * q.lockedFrac), 'more than 30 percent locked');
      need('relics', new Set(rs.map((x) => x.art && x.art.m)).size >= 40, 'art.m must spread over at least 40 different icons');
      const hooksUsed = {}, modsUsed = {};
      rs.forEach((r) => { A(r.hooks).forEach((h) => { const on = O(h).on; hooksUsed[on] = (hooksUsed[on] || 0) + 1; }); Object.keys(O(r.mods)).forEach((k) => { modsUsed[k] = true; }); });
      LISTS.combatHooks.concat(LISTS.runHooks).filter((h) => h !== 'combatEnd').forEach((h) => need('relics', hooksUsed[h] >= 1, `no relic uses the ${h} hook`));
      LISTS.mods.forEach((k) => need('relics', modsUsed[k], `no relic uses the ${k} mod`));
      need('relics', count(rs, (x) => x.rows) >= 2, 'fewer than 2 relics with rows');
      need('relics', count(rs, (x) => A(x.hooks).some((h) => h && h.filter && h.filter.gems)) >= 2, 'fewer than 2 gem-aware relics');
    }

    if (want('gems')) {
      const q = QUOTA.gems, gs = vals(D.gems);
      need('gems', gs.length === q.perColor * 4, `need exactly ${q.perColor * 4} gems, have ${gs.length}`);
      LISTS.gemColors.forEach((c) => need('gems', JSON.stringify(gs.filter((g) => g.color === c).map((g) => g.tier).sort()) === JSON.stringify(q.tiers), `${c} gems need tiers ${q.tiers.join(',')}`));
      need('gems', !gs.some((g) => g.tier === 1 && g.locked), 'tier 1 gems are never locked');
      need('gems', count(gs, (g) => g.locked) >= 4, 'lock some tier 2 and 3 gems (at least 4)');
    }

    if (want('events')) {
      const q = QUOTA.events, evs = vals(D.events);
      [1, 2, 3].forEach((ch) => need('events', count(evs, (e) => e.chapters && e.chapters.length === 1 && e.chapters[0] === ch) >= q.perChapter, `need at least ${q.perChapter} events for chapter ${ch}`));
      need('events', count(evs, (e) => !e.chapters) >= q.any, `need at least ${q.any} events for any chapter`);
      need('events', count(evs, (e) => e.once) <= Math.floor(evs.length * q.onceFrac), 'more than 60 percent of events are once');
      need('events', evs.some((e) => A(e.choices).some((c) => c && c.req && c.req.relic === 'silver_bell')), 'no choice gated by req.relic silver_bell');
      need('events', evs.some((e) => e.when && e.when.flag === 'fox_spared') && evs.some((e) => A(e.choices).some((c) => A(c && c.out).some((o) => A(o && o.ops).some((x) => x && x.op === 'flag' && x.k === 'fox_spared')))), 'the fox_spared flag path is not exercised (a flag op plus an event with when.flag)');
      evs.forEach((e) => {
        const risky = (o) => A(o && o.ops).some((x) => x && (['hurt', 'addCurse', 'fight'].indexOf(x.op) >= 0 || ((x.op === 'gold' || x.op === 'maxHp') && x.n < 0)));
        need('events', A(e.choices).some((c) => c && !c.cost && !A(c.out).some(risky)), `${e.id}: needs at least one safe choice`);
      });
    }

    if (want('meta')) {
      const q = QUOTA;
      need('meta', Object.keys(D.achievements).length === q.achievements, `need exactly ${q.achievements} achievements, have ${Object.keys(D.achievements).length}`);
      need('meta', Object.keys(D.trials).length === q.trials, `need exactly ${q.trials} trials`);
      need('meta', D.tips.length >= q.tips, `need at least ${q.tips} tips, have ${D.tips.length}`);
      FIXED.lore.forEach((id) => need('meta', !!D.lore[id], `lore "${id}" missing`));
    }
    return out;
  };

  return D;
})();

// Hocus Vocus: ART: the art director's toolkit and the ART namespace skeleton. Every art file builds on this one.
//
// STYLE (ART_BIBLE.md is the law): the house look is the owners' chibi style, a chunky warm-brown outline, flat candy colour + ONE hard shadow
// shape + a thin lit-side highlight, sparkle stars and little music notes. The cast kit (art_cast_kit.js) wraps this toolkit in those chibi defaults.
// The toolkit itself keeps its whole original helper set (the variable-width `inkPath` line, `celFill` with a backlight rim and optional halftone
// dots, anime gloss on hair and metal, the washi grain), so any art file can still reach for it. The default key light comes from the upper right
// (ART.tk.light), so shadows fall to the lower left.
// Read this header as the manual: every function a Wave 2 artist needs is here, with its options. Colours passed to helpers that DERIVE other
// colours (celFill, ribbon, glow, sparkle...) must be hex strings ('#ff7eb6'); plain fillStyle strings are fine anywhere else.
//
// THE NAMESPACE (DESIGN 5.6). Real art files REPLACE members by plain assignment (ART.icon.draw = ...); until they do, each member is a working
// placeholder (a labelled coloured box, never throws, safe with the no-op context, safe for unknown ids).
//   ART.res                 backing-store multiplier (UI sets it to UI.px; the gallery sets it and calls ART.sprite.clear())
//   ART.has(kind, id)       true only for REAL art. Art files mark theirs with ART.declare(kind, id | [ids]); ART.enemy.register declares 'enemy' ids
//   ART.declare(kind, ids)  kinds: hero enemy motif relic status tile intent gem `brush` stat type row scene fx (any string works)
//   ART.sheet(name, fn)     register a gallery sheet fn(canvas, params) into ART.sheets (a plain object); throws on a duplicate name. params.w and
//                           params.h are logical px, params.t is the animation argument (seconds, except ART.fx sheets: progress 0..1)
//   ART.sheetGrid(canvas, params, cells, drawCell, opts)   labelled contact-sheet grid, see below
//   ART.sprite(key, w, h, drawFn) -> canvas   memoised offscreen canvas of (w * ART.res) x (h * ART.res), its context pre-scaled so drawFn(g, w, h)
//                           paints in w x h. Callers ctx.drawImage(spr, x, y, w, h). LRU by count (ART.sprite.maxCount 400) AND by pixels
//                           (ART.sprite.maxPixels 48e6). ART.sprite.clear(), .has(key), .drop(keyPrefix), .stats() -> {count, hits, misses, pixels}.
//                           Falls back to an inert canvas + no-op context when no canvas can be made, so it never throws. NEVER pass a
//                           key whose content depends on anything not in the key. Include size, palette and variant in the key.
//   ART.blit(ctx, spr, x, y, w, h, alpha?)   drawImage that tolerates an inert sprite
//   ART.placeholder(ctx, label, x, y, w, h, opts?)   labelled coloured box (opts.round for a circle, opts.color, opts.alpha)
//   ART.hero    (art_cast.js)  draw portrait medallion bounds poseMs pointAt keyPt warm audit expressions ids outfits skins castId; the chibi
//               cast kit is ART.rj (art_cast_kit.js), Jordan and the gallery helpers are ART.cast
//   ART.enemy   register(id, {draw(ctx, o), bounds}) draw bounds poseMs -- art.js owns the shell: ground shadow, elite ring, boss aura, tier scale
//   ART.card    draw(ctx, cardOrId, w, h, t)   motif(ctx, id, x, y, size, palette, t)
//   ART.icon    draw(ctx, kind, id, x, y, size, opts)      ART.scene draw(ctx, id, w, h, t, opts) logo(ctx, x, y, w, t)
//   ART.map     hex(ctx, kind, x, y, size, opts) paintBloom(ctx, x, y, size, p) token(ctx, heroIds, x, y, t, moving)
//   ART.fx      NAME(ctx, o, t)  t is PROGRESS 0..1 here only; ART.fx.names (= LISTS.fx) and ART.fx.ms (default durations)
//
// ENEMY SHELL. ART.enemy.draw(ctx, id, {x, y, s, pose, t, pt, flip, hpPct, phase, alpha, glow}) looks the id up, translates to the feet centre,
// draws a contact shadow and (elite, boss) the tier aura, scales by s * tier scale (elite 1.08), mirrors on flip and calls
// entry.draw(ctx, {s, pose, t, pt, hpPct, phase, glow, flip}) with the context ALREADY translated and scaled, painting around (0, 0), y negative up,
// facing LEFT. Bounds are offsets from the feet centre at s = 1 (elite scale included), not mirrored by flip; `h` is the idle body's drawn height and the optional
// `right` the visible reach to the right of the feet (art plus ground ring), see ART.enemy.bounds. An unknown id draws a placeholder.
//
// THE TOOLKIT: ART.tk (all members are also plain properties, so `const tk = ART.tk` is the usual way in)
//   Palette      pal.{ink night indigo violet dusk paper paper2 sumi gold gold2 vermilion sakura sakura2 jade azure cyan amber bloodmoon ash white}
//                fam(name) -> {base, light, dark, glow} for the LISTS.palettes hue families (fams is the table; unknown -> ash)
//                shade(hex, t?) the house cel shadow, tint(hex, t?) toward white, deep(hex, t?) near-ink version, mix(a, b, t), rgba(hex, alpha)
//                light (default key light angle, the direction TO the light), font.{num display ui}, skies (sky presets)
//   Options      opt {reduceMotion, quality} (UI.applySettings replaces the whole object), motion() -> 1 or 0.3, lowQ() -> quality is 'low'
//   Random       seed(...parts) rng(...parts) vary(id, salt) -> 0..1 pick(id, list, salt) noise1(x, seed) noise2(x, y, seed): all deterministic,
//                seeded through U.hash and a murmur finaliser so near-identical ids do not cluster
//   Easing       ease.{...U.ease, smooth outBack2 inOutSine outSine inSine snap step}   wave(t, period, phase) pulse(t, period, phase, lo, hi)
//                spring(t, freq, damp) blend(a, b, k) blendPose(a, b, k) track([[time, v], ...], t, easing) poseTrack([[time, {pose}], ...], t, easing)
//   Geometry     shapes are arrays of control points [x, y] ([x, y, 1] = sharp corner) smoothed by Catmull-Rom; {poly:[[x, y], ...]} is a straight
//                polygon; a function(ctx) may add path commands (fills only). P(x, y, corner?) circlePts(cx, cy, r, n) ellipsePts(cx, cy, rx, ry, n, rot)
//                arcPts(cx, cy, rx, ry, a0, a1, n) rrectPts(x, y, w, h, r) xf(pts, {dx, dy, s, sx, sy, rot, cx, cy}) mirrorPts(pts, axisX)
//                lerpPts(a, b, k) bendPts(pts, {ang, pow, ox, oy}) bbox(pts) dist(ax, ay, bx, by) flatten(pts, {closed, tension, step}) -> flat
//                [x0, y0, x1, y1, ...] trace(ctx, shape, dx, dy, tension) shapeBox(shape) mat.{I mul pt inv local} (2D affine [a b c d e f])
//   Ink line     inkPath(ctx, shape, o)   the variable-width brush stroke: o.w (3.2) color closed taper taperStart taperEnd pressure ('mid' 'flat'
//                                         'head' 'tail' or fn(u)) wobble (0.14) freq seed t (boil) weightVar (closed lines are heavier on the shadow side)
//                                         light align alpha minW step tension
//                inkStroke(ctx, x0, y0, x1, y1, o) inkCurve(ctx, x0, y0, cx, cy, x1, y1, o) inkBlot(ctx, x, y, r, {seed, color, drips, n, jag})
//                inkBleed(ctx, shape, {w, color, alpha, inside}) inkText(ctx, text, x, y, size, {fill stroke strokeW family weight skew align rot shadow
//                shadowOff grad})
//   Cel shading  celFill(ctx, shape, base, o)   base + one hard shadow + lit-side highlight (o.hi) + backlight rim (o.rim) + halftone + outline:
//                                         o.light depth shadow shadowShape shadowT rim rimW rimSide rimAlpha hi hiW hiAlpha halftone line lineColor
//                                         align tension decor bbox seed wobble weightVar
//                celCircle(ctx, x, y, r, base, o) celEllipse(ctx, x, y, rx, ry, base, o)
//                ribbon(ctx, spine, base, o)  a tapered, shaded, inked strip along a spine (hair, tails, scarves, silk, tentacles, limbs):
//                                         wMax w0 w1 profile tipPow cap bend sway {amp, freq, phase} t shadow shadowW rim gloss glossColor
//                                         glossAlpha strands tipColor tipFrac tipShadow decor line lineColor seed light
//                hairLock(ctx, spine, base, o) ribbon with hair defaults    gloss(ctx, spine, {w, color, alpha})  the anime highlight band
//                chain(key, {spine, cuts, reach, overlap, draw}) -> chain: bakes ONE drawing into rigid slabs; chain.draw(ctx, bends, q) bends it
//                                         with one drawImage per slab (bends[0] rotates the root, bends[j] the j-th joint; q is the raster scale,
//                                         use ceil(2 * zoom) / 2), chain.warm(q), chain.segs, chain.joints. This is how ponytails, tails,
//                                         sashes and cloaks sway cheaply and without seams.
//   Light        glow(ctx, x, y, r, hex, alpha, add?) cached additive radial glow   sparkle(ctx, x, y, r, {color rot alpha thin glow})
//                kirakira(ctx, x, y, w, h, t, {n seed color size rise}) drifting gold flecks    speedLines(ctx, cx, cy, {mode 'radial'|'dir' n seed
//                r0 r1 rect angle len color alpha w})    petal(ctx, x, y, size, rot, alpha, base)    bolt(ctx, x0, y0, x1, y1, {seed w jag n color core})
//   Screen tone  halftone(ctx, x, y, w, h, {d r color alpha angle force}) 45 degree dots (cached pattern), halftoneRamp(ctx, x, y, w, h, {d dir r0 r1
//                color alpha}) graduated dots (draws every dot: cache it in a sprite)
//   Faces        eye(ctx, cx, cy, w, h, {expr side open look iris pupil ring sclera ink tilt drop lash wing lineW catch catchSide star glow lashes arc})
//                exprs: neutral happy closed angry determined hurt sad wide half sleepy smirk (eyePresets). side +1 puts the outer corner at +x.
//                brow(ctx, x, y, w, {side tilt arch thick color seed alpha}) mouth(ctx, x, y, w, kind, {lineW color inner tongue}) kinds: smile smirk
//                flat frown open grin shout grit cat tiny. blush(ctx, x, y, w, {color alpha hatch}) nose(ctx, x, y, s, {color skin})
//   Atmosphere   paperGrain(ctx, x, y, w, h, {alpha blend}) vignette(ctx, w, h, {color alpha hard inner}) sky(ctx, x, y, w, h, preset | stops, {key})
//                mist(ctx, x, y, w, h, t, {n seed color alpha speed}) stars(ctx, x, y, w, h, t, {n seed color}) moon(ctx, x, y, r, {glow phase color seed})
//   Utilities    lin(ctx, x0, y0, x1, y1, stops) rad(ctx, x0, y0, r0, x1, y1, r1, stops) withAlpha(ctx, a, fn) flipX(ctx, x, fn) clamp lerp num smoothstep
//   Every drawing function absorbs NaN and Infinity, never throws for odd input, and leaves save/restore balanced. Nothing here reads a clock or
//   the banned random call: animation takes a `t` you pass in, and lines never move unless you give them one.
//
// GALLERY GRID. ART.sheetGrid(canvas, params, cells, drawCell, opts)
//   cells       array of strings or {label, ...anything}      drawCell(ctx, cell, w, h, i, {col, row, x, y, cw, ch}): the context is clipped to the cell
//               and translated so (0, 0) is its top-left; w x h is the drawing area (the label strip sits below it)
//   opts        cols pad gap labelH title titleH bg ('night' | 'paper' | any fill) cellBg aspect      returns {cols, rows, cw, ch, rects}
//   ART.sheets.toolkit shows the candy helpers (chunky outlines, sticker bands, bunting, marquee bulbs, sparkles); look at it (gallery.html?sheet=toolkit) before drawing anything.
const ART = (() => {
  'use strict';
  const A = { res: 1 };                                    // the public namespace; ART.res is read live by the sprite cache
  const tk = { opt: { reduceMotion: false, quality: 'high' } };   // the toolkit; UI.applySettings replaces tk.opt
  const TAU = Math.PI * 2;
  const PI = Math.PI;
  const clamp = U.clamp;
  const lerp = U.lerp;
  // finite number or a default; every public entry point runs untrusted numbers through this so a NaN can never reach a canvas call
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : (d === undefined ? 0 : d));
  // alpha clamp that turns NaN into 0 (comparisons with NaN are false, so test the positive case first)
  const cA = (a) => (a >= 0 ? (a <= 1 ? a : 1) : 0);
  const pos = (v, d) => (v > 0 && isFinite(v) ? v : (d === undefined ? 0 : d));

  // ---------------------------------------------------------------------------------------------------------------
  // palette (mirrors the CSS custom properties in css/base.css) and hue families (LISTS.palettes)
  // ---------------------------------------------------------------------------------------------------------------
  const pal = {
    ink: '#140f2e', night: '#0d0b1e', indigo: '#1a1340', violet: '#3b2a7a', dusk: '#5b3fa8',
    paper: '#f3e6c8', paper2: '#e6d3a3', sumi: '#241a3a', gold: '#f5c96a', gold2: '#ffe9a8',
    vermilion: '#e8383d', sakura: '#ff7eb6', sakura2: '#ffc2dc', jade: '#3fd6b0', azure: '#5fb4ff',
    cyan: '#5ff5ff', amber: '#ff9a2e', bloodmoon: '#b0245c', ash: '#8a86a8', white: '#fff8f0',
    hush: '#cfcdd8', hush2: '#8e8aa3', felt: '#6e6a7e', bronze: '#c9893a', verdigris: '#5fbfa8',
    // the Hocus Vocus skin (HV_ART_AUDIO 9.1): the same values as the --hv-* and --gloss* tokens of css/base.css. `vox` is the light tint of the Vox orb
    // (the orb itself is the inline SVG --vox in the CSS), for canvas numbers and glows.
    hvPink: '#ff7eb6', hvPinkD: '#c93f78', hvPinkL: '#ffc9de', hvGreen: '#3fcf6a', hvGreenD: '#1f7a3a', hvLime: '#c6ff3d',
    hvViolet: '#a77bff', hvOrange: '#ff9a2e', hvTeal: '#2ec4b6', hvCream: '#fff4e6', hvLine: '#2d170f',
    gloss: '#f4f1fb', glossLilac: '#e6d9ff', glossMint: '#d9fff4', glossBlush: '#ffe3f1', vox: '#ffd0e6',
  };
  // card palette names -> {base, light, dark, glow}
  const fams = {
    rose: { base: '#ff7eb6', light: '#ffc2dc', dark: '#b0245c', glow: '#ffd6ea' },
    crimson: { base: '#e8383d', light: '#ff8a7a', dark: '#7d1230', glow: '#ffb0a0' },
    amber: { base: '#ff9a2e', light: '#ffd08a', dark: '#a34a08', glow: '#ffe0a8' },
    gold: { base: '#f5c96a', light: '#ffe9a8', dark: '#a8782a', glow: '#fff2c8' },
    jade: { base: '#3fd6b0', light: '#a5f5dc', dark: '#12775f', glow: '#c8fff0' },
    teal: { base: '#2fc0c8', light: '#9ff0f2', dark: '#0f6a78', glow: '#c8ffff' },
    azure: { base: '#5fb4ff', light: '#b5dcff', dark: '#2559a8', glow: '#d8eeff' },
    indigo: { base: '#4a4fd0', light: '#9aa0ff', dark: '#1a1a70', glow: '#c0c4ff' },
    violet: { base: '#8f5fe8', light: '#cdb0ff', dark: '#43208f', glow: '#e2d0ff' },
    ink: { base: '#2a2445', light: '#8a86a8', dark: '#0d0b1e', glow: '#f3e6c8' },
    moon: { base: '#e8eefc', light: '#ffffff', dark: '#8a96c0', glow: '#ffffff' },
    ash: { base: '#8a86a8', light: '#c4c0d8', dark: '#4a4664', glow: '#dcd8ec' },
  };
  const fam = (name) => fams[name] || fams.ash;

  // colour derivations are hot (called per shape), so they are memoised per input string
  const memo = (fn) => {
    const m = new Map();
    return (a, b) => {
      const k = a + '|' + (b === undefined ? '' : b);
      let v = m.get(k);
      if (v === undefined) { v = fn(a, b); if (m.size > 4000) m.clear(); m.set(k, v); }
      return v;
    };
  };
  const shade = memo((hex, t) => U.color.shadow(hex, t));                       // the house cel shadow: darker, pulled toward indigo
  const tint = memo((hex, t) => U.color.lighten(hex, t == null ? 0.35 : t));    // toward white
  const deep = memo((hex, t) => U.color.mix(U.color.darken(hex, t == null ? 0.55 : t), pal.ink, 0.35));   // near-ink version of a hue (iris rims, deep lines)
  const mix = (a, b, t) => U.color.mix(a, b, clamp(num(t, 0.5), 0, 1));
  const rgbaM = new Map();
  const rgba = (hex, a) => {
    const q = Math.round(cA(a) * 100);
    const k = hex + '|' + q;
    let v = rgbaM.get(k);
    if (v === undefined) { v = U.color.rgba(hex, q / 100); if (rgbaM.size > 6000) rgbaM.clear(); rgbaM.set(k, v); }
    return v;
  };

  // ---------------------------------------------------------------------------------------------------------------
  // seeded randomness: everything varies per id, nothing varies per frame unless the caller feeds t
  // ---------------------------------------------------------------------------------------------------------------
  // FNV hashes of near-identical strings cluster in their high bits, so every derived seed goes through a murmur3 finaliser
  const mix32 = (h) => { h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0; };
  const seed = (...parts) => mix32(U.hash(...parts));
  const rng = (...parts) => U.rng(mix32(U.hash(...parts)));
  const vary = (id, salt) => mix32(U.hash(id, salt === undefined ? '' : salt)) / 4294967296;      // one stable number in 0..1
  const pick = (id, list, salt) => list[Math.floor(vary(id, salt) * list.length) % list.length];
  const noise1 = (x, sd) => U.noise.n1(x, sd | 0);                                       // smooth 0..1
  const noise2 = (x, y, sd) => U.noise.n2(x, y, sd | 0);

  // ---------------------------------------------------------------------------------------------------------------
  // easing and pose blending
  // ---------------------------------------------------------------------------------------------------------------
  const ease = Object.assign({}, U.ease, {
    smooth: U.smooth,
    outBack2: (t) => { const c = 2.4; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    inOutSine: (t) => -(Math.cos(PI * t) - 1) / 2,
    outSine: (t) => Math.sin(t * PI / 2),
    inSine: (t) => 1 - Math.cos(t * PI / 2),
    // anticipation then release (easeInOutBack): dips below 0 first, then overshoots 1, settles at 1
    snap: (t) => { const c2 = 1.70158 * 1.525; return t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2 : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2; },
    step: (t) => (t < 1 ? 0 : 1),
  });
  const wave = (t, period, phase) => Math.sin(TAU * (t / (period || 1) + (phase || 0)));
  const pulse = (t, period, phase, lo, hi) => { const a = lo === undefined ? 0 : lo, b = hi === undefined ? 1 : hi; return a + (b - a) * (0.5 + 0.5 * wave(t, period, phase)); };
  // damped spring step response: 0 at t=0, overshoots, settles at 1 (freq rad/s, damp 1/s)
  const spring = (t, freq, damp) => (t <= 0 ? 0 : 1 - Math.exp(-(damp === undefined ? 5 : damp) * t) * Math.cos((freq === undefined ? 12 : freq) * t));
  const blend = (a, b, k) => a + (b - a) * k;
  // component-wise blend of two plain objects of numbers (missing keys count as 0); strings and arrays are taken from b when k >= 0.5
  const blendPose = (a, b, k) => {
    const out = {};
    const keys = new Set(Object.keys(a || {}).concat(Object.keys(b || {})));
    keys.forEach((key) => {
      const x = a ? a[key] : undefined, y = b ? b[key] : undefined;
      if (typeof x === 'number' || typeof y === 'number') out[key] = blend(typeof x === 'number' ? x : 0, typeof y === 'number' ? y : 0, k);
      else out[key] = k >= 0.5 ? (y !== undefined ? y : x) : (x !== undefined ? x : y);
    });
    return out;
  };
  // keyframe track: keys = [[time, value], ...] ascending; eases each span with `easing` (name in ART.tk.ease or fn); holds the ends
  const track = (keys, t, easing) => {
    const n = keys.length;
    if (n === 0) return 0;
    if (t <= keys[0][0]) return keys[0][1];
    if (t >= keys[n - 1][0]) return keys[n - 1][1];
    const fn = typeof easing === 'function' ? easing : (ease[easing] || ease.inOutSine);
    let i = 1;
    while (i < n - 1 && t > keys[i][0]) i++;
    const a = keys[i - 1], b = keys[i];
    return a[1] + (b[1] - a[1]) * fn((t - a[0]) / (b[0] - a[0] || 1));
  };
  // keyframes of whole poses: frames = [[time, poseObj], ...]; always returns a fresh object the caller may edit
  const poseTrack = (frames, t, easing) => {
    const n = frames.length;
    if (t <= frames[0][0]) return Object.assign({}, frames[0][1]);
    if (t >= frames[n - 1][0]) return Object.assign({}, frames[n - 1][1]);
    const fn = typeof easing === 'function' ? easing : (ease[easing] || ease.inOutSine);
    let i = 1;
    while (i < n - 1 && t > frames[i][0]) i++;
    const a = frames[i - 1], b = frames[i];
    return blendPose(a[1], b[1], fn((t - a[0]) / (b[0] - a[0] || 1)));
  };

  // ---------------------------------------------------------------------------------------------------------------
  // geometry: a "shape" is an array of control points [x, y] (or [x, y, 1] for a sharp corner) that Catmull-Rom smoothing
  // turns into a curve; {poly:[[x,y],...]} is a straight-edged polygon; a function(ctx) may add path commands (fills only)
  // ---------------------------------------------------------------------------------------------------------------
  const P = (x, y, corner) => (corner ? [x, y, 1] : [x, y]);
  const circlePts = (cx, cy, r, n) => ellipsePts(cx, cy, r, r, n, 0);
  function ellipsePts(cx, cy, rx, ry, n, rot) {
    n = n || 12; rot = rot || 0;
    const out = [], c = Math.cos(rot), s = Math.sin(rot);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, x = Math.cos(a) * rx, y = Math.sin(a) * ry;
      out.push([cx + x * c - y * s, cy + x * s + y * c]);
    }
    return out;
  }
  // arc as control points from angle a0 to a1 (radians, canvas orientation), n points inclusive
  function arcPts(cx, cy, rx, ry, a0, a1, n) {
    n = Math.max(2, n || 6);
    const out = [];
    for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * (i / (n - 1)); out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * (ry === undefined ? rx : ry)]); }
    return out;
  }
  // rounded rectangle as control points: eight points with the corners cut by r, which Catmull-Rom smoothing rounds nicely
  function rrectPts(x, y, w, h, r) {
    r = Math.min(r === undefined ? Math.min(w, h) * 0.25 : r, w / 2, h / 2);
    return [[x + r, y], [x + w - r, y], [x + w, y + r], [x + w, y + h - r], [x + w - r, y + h], [x + r, y + h], [x, y + h - r], [x, y + r]];
  }
  // transform helper: returns a NEW array. o = {dx, dy, s, sx, sy, rot, cx, cy}: scale and rotate about (cx, cy) then translate
  function xf(pts, o) {
    o = o || {};
    const sx = (o.sx !== undefined ? o.sx : (o.s !== undefined ? o.s : 1)), sy = (o.sy !== undefined ? o.sy : (o.s !== undefined ? o.s : 1));
    const rot = o.rot || 0, c = Math.cos(rot), s = Math.sin(rot), cx = o.cx || 0, cy = o.cy || 0, dx = o.dx || 0, dy = o.dy || 0;
    return pts.map((p) => {
      const x = (p[0] - cx) * sx, y = (p[1] - cy) * sy;
      const q = [cx + x * c - y * s + dx, cy + x * s + y * c + dy];
      if (p[2]) q.push(p[2]);
      return q;
    });
  }
  const mirrorPts = (pts, axisX) => pts.map((p) => { const q = [2 * (axisX || 0) - p[0], p[1]]; if (p[2]) q.push(p[2]); return q; });
  // morph between two control-point lists of equal length (k 0..1)
  const lerpPts = (a, b, k) => a.map((p, i) => { const q = b[i] || p; const r = [lerp(p[0], q[0], k), lerp(p[1], q[1], k)]; if (p[2]) r.push(p[2]); return r; });
  // bend a chain root-to-tip: point i rotates about the root by ang * (i/(n-1))^pow, so the tip swings most (hair, tails, ribbons)
  function bendPts(pts, o) {
    o = o || {};
    const n = pts.length, ang = num(o.ang, 0), pw = o.pow === undefined ? 1.3 : o.pow;
    const ox = o.ox === undefined ? pts[0][0] : o.ox, oy = o.oy === undefined ? pts[0][1] : o.oy;
    if (!ang) return pts;
    return pts.map((p, i) => {
      const a = ang * Math.pow(n > 1 ? i / (n - 1) : 0, pw), c = Math.cos(a), s = Math.sin(a);
      const x = p[0] - ox, y = p[1] - oy;
      const q = [ox + x * c - y * s, oy + x * s + y * c];
      if (p[2]) q.push(p[2]);
      return q;
    });
  }
  function bbox(pts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < pts.length; i++) { const p = pts[i]; if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    return [x0, y0, x1, y1];
  }
  const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);

  // Catmull-Rom control points to a dense flat polyline [x0, y0, x1, y1, ...]. tension 1 = standard, 0 = straight lines.
  function flatten(pts, o) {
    o = o || {};
    const closed = !!o.closed, k = (o.tension === undefined ? 1 : o.tension) / 6, step = o.step || 5;
    const n = pts.length, out = [];
    if (n === 0) return out;
    if (n === 1) { out.push(pts[0][0], pts[0][1]); return out; }
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const p1 = pts[i], p2 = pts[(i + 1) % n];
      const p0 = closed ? pts[(i + n - 1) % n] : pts[i > 0 ? i - 1 : 0];
      const p3 = closed ? pts[(i + 2) % n] : pts[i + 2 < n ? i + 2 : n - 1];
      const x1 = p1[0], y1 = p1[1], x2 = p2[0], y2 = p2[1];
      const c1x = p1[2] ? x1 : x1 + (x2 - p0[0]) * k, c1y = p1[2] ? y1 : y1 + (y2 - p0[1]) * k;
      const c2x = p2[2] ? x2 : x2 - (p3[0] - x1) * k, c2y = p2[2] ? y2 : y2 - (p3[1] - y1) * k;
      const cnt = Math.max(1, Math.min(40, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / step)));
      for (let j = 0; j < cnt; j++) {
        const u = j / cnt, v = 1 - u;
        const a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, d = u * u * u;
        out.push(a * x1 + b * c1x + c * c2x + d * x2, a * y1 + b * c1y + c * c2y + d * y2);
      }
    }
    if (!closed) out.push(pts[n - 1][0], pts[n - 1][1]);
    return out;
  }
  const polyFlat = (poly) => { const out = []; for (let i = 0; i < poly.length; i++) out.push(poly[i][0], poly[i][1]); return out; };
  // dense polyline for any shape descriptor (null for function shapes)
  function denseOf(shape, closed, o) {
    if (Array.isArray(shape)) return flatten(shape, { closed, tension: o && o.tension, step: o && o.step });
    if (shape && shape.poly) return polyFlat(shape.poly);
    return null;
  }
  // add a shape to the current path (no beginPath, no fill); dx, dy offset it; always a closed subpath
  function traceShape(ctx, shape, dx, dy, tension, closed) {
    dx = dx || 0; dy = dy || 0;
    if (typeof shape === 'function') { if (dx || dy) { ctx.save(); ctx.translate(dx, dy); shape(ctx); ctx.restore(); } else shape(ctx); return; }
    const isClosed = closed === undefined ? true : closed;
    if (shape && shape.poly) {
      const p = shape.poly;
      if (!p.length) return;
      ctx.moveTo(p[0][0] + dx, p[0][1] + dy);
      for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0] + dx, p[i][1] + dy);
      if (isClosed) ctx.closePath();
      return;
    }
    const pts = shape, n = pts.length;
    if (n < 2) return;
    const k = (tension === undefined ? 1 : tension) / 6;
    ctx.moveTo(pts[0][0] + dx, pts[0][1] + dy);
    const segs = isClosed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const p1 = pts[i], p2 = pts[(i + 1) % n];
      const p0 = isClosed ? pts[(i + n - 1) % n] : pts[i > 0 ? i - 1 : 0];
      const p3 = isClosed ? pts[(i + 2) % n] : pts[i + 2 < n ? i + 2 : n - 1];
      const x1 = p1[0], y1 = p1[1], x2 = p2[0], y2 = p2[1];
      ctx.bezierCurveTo((p1[2] ? x1 : x1 + (x2 - p0[0]) * k) + dx, (p1[2] ? y1 : y1 + (y2 - p0[1]) * k) + dy,
        (p2[2] ? x2 : x2 - (p3[0] - x1) * k) + dx, (p2[2] ? y2 : y2 - (p3[1] - y1) * k) + dy, x2 + dx, y2 + dy);
    }
    if (isClosed) ctx.closePath();
  }
  function shapeBox(shape) {
    if (Array.isArray(shape)) return bbox(shape);
    if (shape && shape.poly) return bbox(shape.poly);
    return null;
  }
  // ---------------------------------------------------------------------------------------------------------------
  // sprite cache: memoised offscreen canvases, LRU by count and by total pixels
  // ---------------------------------------------------------------------------------------------------------------
  // every 2d method as a no-op, for environments where a real canvas cannot be made (never throws, never draws)
  const NOOP = (() => {
    let self;
    const fn = () => self;
    const handler = {
      get: (t, k) => (k === 'canvas' ? undefined : k === 'measureText' ? () => ({ width: 0 }) : k === 'getImageData' ? () => ({ data: [], width: 0, height: 0 }) : fn),
      set: () => true,
    };
    self = (typeof Proxy === 'function') ? new Proxy(function () {}, handler) : { canvas: undefined };
    return self;
  })();
  function makeCanvas(w, h) {
    try {
      if (typeof document !== 'undefined' && document && typeof document.createElement === 'function') {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const g = c.getContext && c.getContext('2d');
        if (g) return { c, g };
      }
    } catch (e) { /* fall through to the next option */ }
    try {
      if (typeof OffscreenCanvas === 'function') {
        const c = new OffscreenCanvas(w, h), g = c.getContext('2d');
        if (g) return { c, g };
      }
    } catch (e) { /* fall through to the inert stand-in */ }
    return { c: { width: w, height: h, _inert: true }, g: NOOP };
  }
  const sprites = new Map();
  const sstat = { hits: 0, misses: 0, pixels: 0 };
  const patterns = new Map();
  function sprite(key, w, h, drawFn) {
    w = Math.max(1, num(w, 1)); h = Math.max(1, num(h, 1));
    const res = A.res > 0 ? A.res : 1;
    const k = key + '@' + res;
    const hit = sprites.get(k);
    if (hit) { sstat.hits++; sprites.delete(k); sprites.set(k, hit); return hit.c; }
    sstat.misses++;
    let pw = Math.min(4096, Math.max(1, Math.ceil(w * res))), ph = Math.min(4096, Math.max(1, Math.ceil(h * res)));
    const { c, g } = makeCanvas(pw, ph);
    try {
      g.setTransform(pw / w, 0, 0, ph / h, 0, 0);
      drawFn(g, w, h, c);
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) console.error('ART.sprite ' + key + ': ' + (e && e.message));
    } finally {
      try { g.setTransform(1, 0, 0, 1, 0, 0); } catch (e) { /* inert context */ }
    }
    const entry = { c, px: pw * ph };
    sprites.set(k, entry);
    sstat.pixels += entry.px;
    while ((sprites.size > sprite.maxCount || sstat.pixels > sprite.maxPixels) && sprites.size > 1) {
      const oldest = sprites.keys().next().value;
      const e = sprites.get(oldest);
      sstat.pixels -= e.px;
      sprites.delete(oldest);
    }
    return c;
  }
  sprite.maxCount = 400;
  sprite.maxPixels = 48e6;
  sprite.clear = () => { sprites.clear(); patterns.clear(); sstat.pixels = 0; };
  sprite.has = (key) => sprites.has(key + '@' + (A.res > 0 ? A.res : 1));
  sprite.stats = () => ({ count: sprites.size, hits: sstat.hits, misses: sstat.misses, pixels: sstat.pixels });
  sprite.drop = (prefix) => { for (const k of Array.from(sprites.keys())) if (k.indexOf(prefix) === 0) { sstat.pixels -= sprites.get(k).px; sprites.delete(k); } };
  // draw a sprite made by ART.sprite into ctx at (x, y) with logical size w x h
  function blit(ctx, spr, x, y, w, h, alpha) {
    if (!spr || spr._inert) return;
    if (alpha !== undefined && alpha < 1) { const ga = ctx.globalAlpha; ctx.globalAlpha = ga * cA(alpha); ctx.drawImage(spr, x, y, w, h); ctx.globalAlpha = ga; } else ctx.drawImage(spr, x, y, w, h);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // the ink line: variable-width calligraphic strokes
  // ---------------------------------------------------------------------------------------------------------------
  const LIGHT = -1.05;                                  // default key light: the direction TO the light, up and to the right
  const motion = () => (tk.opt && tk.opt.reduceMotion ? 0.3 : 1);
  const lowQ = () => !!(tk.opt && tk.opt.quality === 'low');
  const smoothstep = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

  // Fill a shape (any shape descriptor) as a brush stroke of varying width.
  //   o.w          maximum width in px (default 3.2)          o.color   any fill style (default ART.tk.pal.ink)
  //   o.closed     treat the shape as a loop (an outline), default false
  //   o.taper      fraction of the length used to taper EACH end of an open stroke, default 0.28 (o.taperStart / o.taperEnd override)
  //   o.pressure   'mid' (bulge in the middle, open default), 'flat' (closed default), 'head', 'tail' or fn(u 0..1) -> 0..1
  //   o.wobble     pressure wobble amplitude 0..1 (default 0.14), o.freq wobble frequency per px (default 0.06), o.seed int
  //   o.t          if given the wobble drifts with time (a boiling line); omitted means the line never moves
  //   o.weightVar  closed lines are thicker on the shadow side (0..1, default 0.5), o.light the light angle (see ART.tk.light)
  //   o.align      closed lines only: -1 inside, 0 centred, 1 outside the path (default 0.3)
  //   o.alpha, o.minW, o.step (sample spacing, default 5)
  function inkPath(ctx, shape, o) {
    o = o || {};
    const closed = !!o.closed;
    const col = o.color || pal.ink;
    const W = pos(o.w, 3.2);
    if (typeof shape === 'function') {
      ctx.save(); ctx.beginPath(); shape(ctx);
      ctx.strokeStyle = col; ctx.lineWidth = W; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); ctx.restore();
      return;
    }
    if (!shape) return;
    const d = denseOf(shape, closed, o);
    if (!d || d.length < 4) return;
    const m = d.length >> 1;
    const L = new Array(m);
    L[0] = 0;
    for (let i = 1; i < m; i++) L[i] = L[i - 1] + Math.hypot(d[2 * i] - d[2 * i - 2], d[2 * i + 1] - d[2 * i - 1]);
    const total = L[m - 1] + (closed ? Math.hypot(d[0] - d[2 * m - 2], d[1] - d[2 * m - 1]) : 0);
    if (!(total > 0.4)) return;
    const ts = closed ? 0 : (o.taperStart !== undefined ? o.taperStart : (o.taper !== undefined ? o.taper : 0.28));
    const te = closed ? 0 : (o.taperEnd !== undefined ? o.taperEnd : (o.taper !== undefined ? o.taper : 0.28));
    const prs = o.pressure === undefined ? (closed ? 'flat' : 'mid') : o.pressure;
    const wob = o.wobble === undefined ? 0.14 : o.wobble;
    const freq = o.freq === undefined ? 0.06 : o.freq;
    const sd = o.seed | 0;
    const ph = o.t === undefined ? 0 : num(o.t) * (o.boil === undefined ? 1.6 : o.boil);
    const minW = o.minW === undefined ? Math.min(0.3, W * 0.12) : o.minW;
    const wv = o.weightVar === undefined ? (closed ? 0.5 : (o.light !== undefined ? 0.4 : 0)) : o.weightVar;
    const la = o.light === undefined ? LIGHT : o.light;
    const sdx = -Math.cos(la), sdy = -Math.sin(la);
    let sgn = 1;
    if (closed) {
      let area = 0;
      for (let i = 0; i < m; i++) { const j = (i + 1) % m; area += d[2 * i] * d[2 * j + 1] - d[2 * j] * d[2 * i + 1]; }
      sgn = area > 0 ? 1 : -1;
    }
    const align = closed ? (o.align === undefined ? 0.3 : o.align) : 0;
    const ax = new Array(m), ay = new Array(m), bx = new Array(m), by = new Array(m);
    let wStart = 0, wEnd = 0;
    for (let i = 0; i < m; i++) {
      const a = closed ? (i + m - 1) % m : (i > 0 ? i - 1 : 0), b = closed ? (i + 1) % m : (i < m - 1 ? i + 1 : m - 1);
      let tx = d[2 * b] - d[2 * a], ty = d[2 * b + 1] - d[2 * a + 1];
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl; ty /= tl;
      const nx = ty * sgn, ny = -tx * sgn;
      const u = L[i] / total;
      let w = W;
      w *= typeof prs === 'function' ? num(prs(u), 1) : prs === 'flat' ? 1 : prs === 'head' ? 1 - 0.6 * u : prs === 'tail' ? 0.4 + 0.6 * u : 0.62 + 0.38 * Math.sin(PI * u);
      if (ts > 0 && u < ts) w *= smoothstep(u / ts);
      if (te > 0 && u > 1 - te) w *= smoothstep((1 - u) / te);
      if (wob) w *= 1 + wob * (noise1(L[i] * freq + ph + sd * 3.7, sd) * 2 - 1);
      if (wv) w *= 1 + wv * (nx * sdx + ny * sdy);
      if (w < minW) w = minW;
      const off = align * w / 2, x = d[2 * i], y = d[2 * i + 1];
      ax[i] = x + nx * (off + w / 2); ay[i] = y + ny * (off + w / 2);
      bx[i] = x + nx * (off - w / 2); by[i] = y + ny * (off - w / 2);
      if (i === 0) wStart = w;
      if (i === m - 1) wEnd = w;
    }
    const ga = ctx.globalAlpha;
    if (o.alpha !== undefined) ctx.globalAlpha = ga * cA(o.alpha);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(ax[0], ay[0]);
    for (let i = 1; i < m; i++) ctx.lineTo(ax[i], ay[i]);
    if (closed) {
      ctx.closePath();
      ctx.moveTo(bx[0], by[0]);
      for (let i = m - 1; i >= 1; i--) ctx.lineTo(bx[i], by[i]);
      ctx.closePath();
      ctx.fill('evenodd');
    } else {
      for (let i = m - 1; i >= 0; i--) ctx.lineTo(bx[i], by[i]);
      ctx.closePath();
      ctx.fill();
      if ((ts === 0 && wStart > 1.2) || (te === 0 && wEnd > 1.2)) {
        ctx.beginPath();
        if (ts === 0 && wStart > 1.2) { ctx.moveTo(d[0] + wStart / 2, d[1]); ctx.arc(d[0], d[1], wStart / 2, 0, TAU); }
        if (te === 0 && wEnd > 1.2) { ctx.moveTo(d[2 * m - 2] + wEnd / 2, d[2 * m - 1]); ctx.arc(d[2 * m - 2], d[2 * m - 1], wEnd / 2, 0, TAU); }
        ctx.fill();
      }
    }
    if (o.alpha !== undefined) ctx.globalAlpha = ga;
  }
  // a straight (or bent) brush stroke between two points; o.bend pushes the middle sideways by that many px
  function inkStroke(ctx, x0, y0, x1, y1, o) {
    o = o || {};
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, b = num(o.bend, 0);
    inkPath(ctx, [[x0, y0], [(x0 + x1) / 2 - dy / len * b, (y0 + y1) / 2 + dx / len * b], [x1, y1]], o);
  }
  // quadratic curve stroke with one control point
  function inkCurve(ctx, x0, y0, cx, cy, x1, y1, o) {
    inkPath(ctx, [[x0, y0], [(x0 + 2 * cx + x1) / 4, (y0 + 2 * cy + y1) / 4], [x1, y1]], o);
  }
  // irregular ink blot (filled, no outline). o: color, seed, n (points, default 11), jag 0..1 (default 0.28), drips (count, default 0)
  function inkBlot(ctx, x, y, r, o) {
    o = o || {};
    const rr = rng('blot', o.seed | 0), n = o.n || 11, jag = o.jag === undefined ? 0.28 : o.jag;
    const pts = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU, k = 1 + (rr() * 2 - 1) * jag; pts.push([x + Math.cos(a) * r * k, y + Math.sin(a) * r * k]); }
    ctx.beginPath(); traceShape(ctx, pts); ctx.fillStyle = o.color || pal.ink; ctx.fill();
    const drips = o.drips | 0;
    for (let i = 0; i < drips; i++) {
      const a = 0.3 + rr() * (PI - 0.6), len = r * (0.6 + rr() * 1.1), w = Math.max(1, r * (0.12 + rr() * 0.14));
      const sx = x + Math.cos(a) * r * 0.7, sy = y + Math.sin(a) * r * 0.7;
      inkPath(ctx, [[sx, sy], [sx + (rr() - 0.5) * 2, sy + len * 0.5], [sx, sy + len]], { w, color: o.color || pal.ink, taperStart: 0, taperEnd: 0.5, wobble: 0.1, pressure: 'flat', seed: i });
      ctx.beginPath(); ctx.arc(sx, sy + len, w * 0.62, 0, TAU); ctx.fillStyle = o.color || pal.ink; ctx.fill();
    }
  }
  // soft ink-bleed edge on a shape: a few translucent strokes that feather inward (default) or outward. o: w, color, alpha, inside
  function inkBleed(ctx, shape, o) {
    o = o || {};
    if (lowQ()) return;
    const w = pos(o.w, 6), col = o.color || pal.ink, a = o.alpha === undefined ? 0.5 : o.alpha, inside = o.inside !== false;
    const ga = ctx.globalAlpha;
    ctx.save();
    if (inside) { ctx.beginPath(); traceShape(ctx, shape); ctx.clip(); }
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = col;
    for (let k = 0; k < 4; k++) {
      ctx.globalAlpha = ga * cA(a * (0.22 - k * 0.04));
      ctx.lineWidth = Math.max(0.5, w * (2 - k * 0.42));
      ctx.setLineDash(k % 2 ? [w * 3, w * 0.8] : [w * 5, w * 1.6, w * 1.5, w]);
      ctx.beginPath(); traceShape(ctx, shape); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // halftone (screen-tone) dots
  // ---------------------------------------------------------------------------------------------------------------
  function dotPattern(ctx, o) {
    const d = Math.max(2, num(o.d, 6)), r = Math.max(0.3, num(o.r, d * 0.27)), col = o.color || pal.ink, a = o.alpha === undefined ? 0.5 : o.alpha;
    const key = 'ht|' + d + '|' + r + '|' + col + '|' + Math.round(a * 100);
    const res = A.res > 0 ? A.res : 1;
    const pk = key + '@' + res;
    let pat = patterns.get(pk);
    if (pat) return pat;
    const spr = sprite(key, d, d, (g) => {
      g.fillStyle = rgba(col, a);
      g.beginPath(); g.arc(d * 0.25, d * 0.25, r, 0, TAU); g.arc(d * 0.75, d * 0.75, r, 0, TAU); g.fill();
      g.beginPath(); g.arc(d * 1.25, d * 0.25, r, 0, TAU); g.arc(d * 0.25, d * 1.25, r, 0, TAU); g.arc(-d * 0.25, d * 0.25, r, 0, TAU); g.arc(d * 0.25, -d * 0.25, r, 0, TAU);
      g.arc(d * 0.75, -d * 0.25, r, 0, TAU); g.arc(-d * 0.25, d * 0.75, r, 0, TAU); g.arc(d * 1.25, d * 0.75, r, 0, TAU); g.arc(d * 0.75, d * 1.25, r, 0, TAU); g.fill();
    });
    try {
      pat = ctx.createPattern(spr, 'repeat');
      if (pat && typeof pat.setTransform === 'function' && typeof DOMMatrix === 'function') pat.setTransform(new DOMMatrix([1 / res, 0, 0, 1 / res, 0, 0]));
    } catch (e) { pat = null; }
    if (pat) patterns.set(pk, pat);
    return pat;
  }
  // Fill the rectangle (x, y, w, h) with a 45 degree dot screen. Usually called inside a clip. o: d spacing (6), r dot radius,
  // color (ink), alpha (0.5), angle (extra rotation of the whole screen in radians)
  function halftone(ctx, x, y, w, h, o) {
    o = o || {};
    if (lowQ() && o.force !== true) return;
    const pat = dotPattern(ctx, o);
    ctx.save();
    const cx = x + w / 2, cy = y + h / 2, half = Math.hypot(w, h) / 2 + 2;
    ctx.translate(cx, cy);
    if (o.angle) ctx.rotate(o.angle);
    if (pat) { ctx.fillStyle = pat; ctx.fillRect(-half, -half, half * 2, half * 2); }
    else { ctx.globalAlpha = ctx.globalAlpha * 0.35; ctx.fillStyle = o.color || pal.ink; ctx.fillRect(-half, -half, half * 2, half * 2); }
    ctx.restore();
  }
  // Graduated screen-tone: dot radius grows from r0 to r1 along direction o.dir (radians) across the rect. Draws every dot, so cache it.
  function halftoneRamp(ctx, x, y, w, h, o) {
    o = o || {};
    const d = Math.max(3, num(o.d, 7)), r0 = num(o.r0, 0.2), r1 = num(o.r1, d * 0.5), dir = num(o.dir, 0);
    const c = Math.cos(dir), s = Math.sin(dir), span = Math.abs(w * c) + Math.abs(h * s) || 1;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = rgba(o.color || pal.ink, o.alpha === undefined ? 0.6 : o.alpha);
    ctx.beginPath();
    const cx = x + w / 2, cy = y + h / 2;
    for (let j = 0, gy = y - d; gy < y + h + d; gy += d / 2, j++) {
      for (let gx = x - d + (j % 2 ? d / 2 : 0); gx < x + w + d; gx += d) {
        const k = clamp(0.5 + ((gx - cx) * c + (gy - cy) * s) / span, 0, 1), r = lerp(r0, r1, k);
        if (r > 0.25) { ctx.moveTo(gx + r, gy); ctx.arc(gx, gy, r, 0, TAU); }
      }
    }
    ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // cel shading
  // ---------------------------------------------------------------------------------------------------------------
  // Fill a closed shape the house way: base colour, ONE hard shadow shape, an optional rim light, optional halftone in the
  // shadow, then a variable-width ink outline.
  //   base           fill colour (a hex string, so the shadow can be derived)
  //   o.light        angle of the direction TO the key light (default ART.tk.light, up and to the right)
  //   o.depth        shadow crescent thickness in px (default 12% of the shape's short side, 1.5..14)
  //   o.shadow       false (no shadow), or a colour string (default ART.tk.shade(base))
  //   o.shadowShape  a shape descriptor drawn as the shadow instead of the automatic crescent (clipped to the shape)
  //   o.rim          rim-light colour; o.rimW thickness (default 1.6); o.rimSide 'shadow' (default, backlight on the shadow edge),
  //                  'light', or an angle in radians giving the direction the rim faces; o.rimAlpha
  //   o.hi           lit-side highlight edge: true or 'auto' (the base lifted 30% toward white) or a colour; o.hiW thickness (2.2), o.hiAlpha (0.85)
  //   o.halftone     true or {d, r, color, alpha, angle}: dot screen clipped inside the shadow
  //   o.line         false for no outline, a number for its width (default 3.2); o.lineColor, o.align, o.seed, o.wobble, o.weightVar
  //   o.tension      Catmull-Rom smoothing 0..1 (default 1); use about 0.3 for rectangles and straight shafts so they do not bulge into lenses
  //   o.decor        fn(ctx): extra art drawn inside the shape (clipped to it) after the shading and BEFORE the outline: stripes, tips, patterns
  //   o.bbox         [x0, y0, x1, y1] when the shape is a function (needed for the shadow maths)
  function celFill(ctx, shape, base, o) {
    o = o || {};
    if (!shape) return;
    const light = o.light === undefined ? LIGHT : o.light;
    const box = shapeBox(shape) || o.bbox || [-1500, -1500, 1500, 1500];
    const bw = box[2] - box[0], bh = box[3] - box[1];
    const depth = o.depth === undefined ? clamp(Math.min(bw, bh) * 0.12, 1.5, 14) : o.depth;
    const sdx = -Math.cos(light), sdy = -Math.sin(light);
    ctx.beginPath(); traceShape(ctx, shape, 0, 0, o.tension); ctx.fillStyle = base; ctx.fill();
    const region = (dx, dy) => { ctx.beginPath(); ctx.rect(box[0] - 80, box[1] - 80, bw + 160, bh + 160); traceShape(ctx, shape, dx, dy, o.tension); ctx.clip('evenodd'); };
    if (o.shadow !== false && (o.shadowShape || depth > 0)) {
      const shCol = typeof o.shadow === 'string' ? o.shadow : shade(base, o.shadowT);
      ctx.save();
      ctx.beginPath(); traceShape(ctx, shape, 0, 0, o.tension); ctx.clip();
      if (o.shadowShape) { ctx.beginPath(); traceShape(ctx, o.shadowShape); ctx.clip(); } else region(-sdx * depth, -sdy * depth);
      ctx.fillStyle = shCol; ctx.fillRect(box[0] - 80, box[1] - 80, bw + 160, bh + 160);
      if (o.halftone && !lowQ()) { const h = o.halftone === true ? {} : o.halftone; halftone(ctx, box[0], box[1], bw, bh, { d: h.d || 5, r: h.r, color: h.color || deep(base), alpha: h.alpha === undefined ? 0.45 : h.alpha, angle: h.angle, force: true }); }
      ctx.restore();
    }
    if (o.hi && Math.min(bw, bh) > 9) {
      // third tone: a thin lit-side highlight, the base colour lifted toward white
      const hw = pos(o.hiW, 2.2), hc = o.hi === true || o.hi === 'auto' ? tint(base, 0.3) : o.hi;
      ctx.save();
      ctx.beginPath(); traceShape(ctx, shape, 0, 0, o.tension); ctx.clip();
      region(sdx * hw, sdy * hw);
      ctx.globalAlpha = ctx.globalAlpha * cA(o.hiAlpha === undefined ? 0.85 : o.hiAlpha);
      ctx.fillStyle = hc; ctx.fillRect(box[0] - 80, box[1] - 80, bw + 160, bh + 160);
      ctx.restore();
    }
    if (o.rim) {
      const rw = pos(o.rimW, 1.6);
      let rx = sdx, ry = sdy;
      if (o.rimSide === 'light') { rx = -sdx; ry = -sdy; } else if (typeof o.rimSide === 'number') { rx = Math.cos(o.rimSide); ry = Math.sin(o.rimSide); }
      ctx.save();
      ctx.beginPath(); traceShape(ctx, shape, 0, 0, o.tension); ctx.clip();
      region(-rx * rw, -ry * rw);
      if (o.rimAlpha !== undefined) ctx.globalAlpha = ctx.globalAlpha * cA(o.rimAlpha);
      ctx.fillStyle = o.rim; ctx.fillRect(box[0] - 80, box[1] - 80, bw + 160, bh + 160);
      ctx.restore();
    }
    if (o.decor) { ctx.save(); ctx.beginPath(); traceShape(ctx, shape, 0, 0, o.tension); ctx.clip(); o.decor(ctx); ctx.restore(); }
    if (o.line !== false && o.line !== 0) {
      inkPath(ctx, shape, { closed: true, w: typeof o.line === 'number' ? o.line : pos(o.lineW, 3.2), color: o.lineColor || pal.ink, align: o.align, seed: o.seed, wobble: o.wobble, weightVar: o.weightVar, light, step: o.step, tension: o.tension });
    }
  }
  const celEllipse = (ctx, cx, cy, rx, ry, base, o) => celFill(ctx, ellipsePts(cx, cy, rx, ry, clamp(Math.round(Math.max(rx, ry) / 2) + 8, 10, 24), 0), base, o);
  const celCircle = (ctx, cx, cy, r, base, o) => celEllipse(ctx, cx, cy, r, r, base, o);

  // ---------------------------------------------------------------------------------------------------------------
  // ribbons: tapered, shaded, inked strips along a spine (hair locks, tails, scarves, silk, tentacles, limbs)
  // ---------------------------------------------------------------------------------------------------------------
  // Draw a ribbon along `spine` (control points [x,y], root first). base is the fill hex.
  //   width      o.wMax (max width, default 10), o.w0 (root width, default 0.75 * wMax), o.w1 (tip width, default 0 = a point),
  //              o.profile fn(u 0..1) -> width multiplier of wMax (replaces the default lock profile), o.tipPow (default 1.4)
  //   caps       o.cap 'flat' | 'round' (both ends, round adds a half circle)
  //   motion     o.bend (radians the tip swings about the root), or o.sway {amp, freq, phase} with o.t (seconds): amp*sin(2*pi*freq*t + phase)
  //   shading    o.shadow (false or colour), o.rim, o.rimW, o.light, o.halftone (as celFill) and o.shadowW (0..1, share of the width in shadow, default 0.55)
  //   detail     o.gloss (default true: the anime highlight band, colour o.glossColor, alpha o.glossAlpha), o.strands (0..3 thin lines, default 1),
  //              o.tipColor / o.tipFrac (default 0.28) / o.tipShadow dip the last part of the ribbon in a second colour, o.decor fn(ctx) as in celFill
  //   line       o.line width or false, o.lineColor, o.seed
  function ribbon(ctx, spine, base, o) {
    o = o || {};
    if (!spine || spine.length < 2) return;
    let sp = spine;
    let bend = num(o.bend, 0);
    if (o.sway) bend += num(o.sway.amp, 0) * Math.sin(TAU * num(o.sway.freq, 0.5) * num(o.t, 0) + num(o.sway.phase, 0)) * motion();
    if (bend) sp = bendPts(spine, { ang: bend });
    const d = flatten(sp, { step: 5 });
    const m = d.length >> 1;
    if (m < 2) return;
    const L = [0];
    for (let i = 1; i < m; i++) L.push(L[i - 1] + Math.hypot(d[2 * i] - d[2 * i - 2], d[2 * i + 1] - d[2 * i - 1]));
    const total = L[m - 1];
    if (!(total > 1)) return;
    const wMax = pos(o.wMax, 10), w0 = o.w0 === undefined ? wMax * 0.75 : o.w0, w1 = o.w1 === undefined ? 0 : o.w1, tipPow = o.tipPow || 1.4;
    const widthAt = (u) => {
      if (o.profile) return wMax * num(o.profile(u), 1);
      const up = 0.28;
      if (u < up) return lerp(w0, wMax, smoothstep(u / up));
      return lerp(w1, wMax, 1 - Math.pow((u - up) / (1 - up), tipPow));
    };
    const cx = [], cy = [], nx = [], ny = [], wd = [];
    for (let i = 0; i < m; i++) {
      const a = i > 0 ? i - 1 : 0, b = i < m - 1 ? i + 1 : m - 1;
      let tx = d[2 * b] - d[2 * a], ty = d[2 * b + 1] - d[2 * a + 1];
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl; ty /= tl;
      cx.push(d[2 * i]); cy.push(d[2 * i + 1]); nx.push(-ty); ny.push(tx); wd.push(Math.max(0, widthAt(L[i] / total)));
    }
    const left = [], right = [];
    for (let i = 0; i < m; i++) { left.push([cx[i] + nx[i] * wd[i] / 2, cy[i] + ny[i] * wd[i] / 2]); right.push([cx[i] - nx[i] * wd[i] / 2, cy[i] - ny[i] * wd[i] / 2]); }
    const outline = left.slice();
    const roundTip = o.cap === 'round';
    if (roundTip) {
      const r = wd[m - 1] / 2, ang = Math.atan2(ny[m - 1], nx[m - 1]);
      for (let k = 1; k <= 3; k++) { const a = ang - (k / 4) * PI; outline.push([cx[m - 1] + Math.cos(a) * r, cy[m - 1] + Math.sin(a) * r]); }
    }
    for (let i = m - 1; i >= 0; i--) outline.push(right[i]);
    if (roundTip) {
      const r = wd[0] / 2, ang = Math.atan2(-ny[0], -nx[0]);
      for (let k = 1; k <= 3; k++) { const a = ang - (k / 4) * PI; outline.push([cx[0] + Math.cos(a) * r, cy[0] + Math.sin(a) * r]); }
    }
    const light = o.light === undefined ? LIGHT : o.light;
    const sdx = -Math.cos(light), sdy = -Math.sin(light);
    const i0 = Math.floor(m * 0.3), i1 = Math.max(i0 + 1, Math.floor(m * 0.7));
    let dotN = 0;
    for (let i = i0; i <= i1 && i < m; i++) dotN += nx[i] * sdx + ny[i] * sdy;
    const side = dotN >= 0 ? 1 : -1;                     // +1: the left edge array faces the shadow
    let shadowShape;
    if (o.shadow !== false) {
      const edge = side > 0 ? left : right, sw = clamp(o.shadowW === undefined ? 0.55 : o.shadowW, 0.1, 1);
      const poly = [];
      for (let i = 0; i < m; i++) { const k = side * wd[i] * (0.5 - sw); poly.push([cx[i] + nx[i] * k, cy[i] + ny[i] * k]); }
      for (let i = m - 1; i >= 0; i--) poly.push(edge[i]);
      shadowShape = { poly };
    }
    let decor = o.decor;
    if (o.tipColor) {
      const tf = clamp(o.tipFrac === undefined ? 0.28 : o.tipFrac, 0.05, 0.9), i0 = Math.max(1, Math.floor(m * (1 - tf))), last = m - 1;
      // ragged colour boundary: five points across the width alternating up and down the strand, like dipped hair
      const bnd = [], e0 = clamp(i0 - 2, 1, last);
      for (let k = 0; k <= 4; k++) {
        const f = 0.5 - k * 0.25, idx = clamp(i0 + (k % 2 ? 3 : -2), 1, last);
        bnd.push([cx[idx] + nx[idx] * wd[idx] * f, cy[idx] + ny[idx] * wd[idx] * f]);
      }
      const tipPoly = { poly: bnd.concat(right.slice(e0), left.slice(e0).reverse()) };
      const prev = decor;
      decor = (g) => {
        if (prev) prev(g);
        g.beginPath(); traceShape(g, tipPoly); g.fillStyle = o.tipColor; g.fill();
        if (shadowShape) { g.save(); g.beginPath(); traceShape(g, tipPoly); g.clip(); g.beginPath(); traceShape(g, shadowShape); g.fillStyle = o.tipShadow || mix(shade(o.tipColor), o.tipColor, 0.45); g.fill(); g.restore(); }
      };
    }
    celFill(ctx, { poly: outline }, base, { light, shadowShape, shadow: o.shadow === false ? false : o.shadow, rim: o.rim, rimW: o.rimW, rimSide: o.rimSide, halftone: o.halftone, line: o.line, lineColor: o.lineColor, seed: o.seed, weightVar: o.weightVar, wobble: o.wobble, step: 6, decor });
    if (o.gloss !== false && total > 14) {
      const g0 = 0.16, g1 = 0.72, poly = [];
      const gl = [], gr = [];
      for (let i = 0; i < m; i++) {
        const u = L[i] / total;
        if (u < g0 || u > g1) continue;
        const k = (u - g0) / (g1 - g0), gw = wd[i] * 0.2 * Math.sin(PI * Math.pow(k, 0.85)) + 0.2;
        const off = -side * wd[i] * 0.2;
        gl.push([cx[i] + nx[i] * (off + gw / 2), cy[i] + ny[i] * (off + gw / 2)]);
        gr.push([cx[i] + nx[i] * (off - gw / 2), cy[i] + ny[i] * (off - gw / 2)]);
      }
      if (gl.length > 2) {
        for (let i = 0; i < gl.length; i++) poly.push(gl[i]);
        for (let i = gr.length - 1; i >= 0; i--) poly.push(gr[i]);
        const ga = ctx.globalAlpha;
        ctx.globalAlpha = ga * cA(o.glossAlpha === undefined ? 0.6 : o.glossAlpha);
        ctx.beginPath(); traceShape(ctx, { poly }); ctx.fillStyle = o.glossColor || tint(base, 0.78); ctx.fill();
        ctx.globalAlpha = ga;
      }
    }
    const strands = o.strands === undefined ? 1 : o.strands | 0;
    if (strands > 0 && total > 26 && !lowQ()) {
      for (let s = 0; s < strands; s++) {
        const off = (strands === 1 ? 0.12 : (s / (strands - 1) - 0.5) * 0.55) * -side, pts = [];
        for (let i = 0; i < m; i++) {
          const u = L[i] / total;
          if (u < 0.32 || u > 0.9) continue;
          pts.push([cx[i] + nx[i] * off * wd[i], cy[i] + ny[i] * off * wd[i]]);
        }
        if (pts.length > 2) inkPath(ctx, pts, { w: 1, color: deep(base, 0.45), alpha: 0.55, taper: 0.4, wobble: 0.1, seed: s + 5 });
      }
    }
  }
  // ribbon with hair defaults: highlight band on, one strand line, sway ready. Same options as ribbon.
  function hairLock(ctx, spine, base, o) { ribbon(ctx, spine, base, Object.assign({ gloss: true, strands: 1 }, o)); }
  // the anime highlight: a white tapered band along a spine. o: w (default 4), color, alpha (default 0.6)
  function gloss(ctx, spine, o) {
    o = o || {};
    const ga = ctx.globalAlpha;
    ctx.globalAlpha = ga * cA(o.alpha === undefined ? 0.6 : o.alpha);
    ribbon(ctx, spine, o.color || pal.white, { wMax: pos(o.w, 4), w0: 0, w1: 0, tipPow: 1, shadow: false, line: false, gloss: false, strands: 0, profile: (u) => Math.sin(PI * u) });
    ctx.globalAlpha = ga;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // light: glow, sparkle, kirakira, speed lines
  // ---------------------------------------------------------------------------------------------------------------
  const hexOk = (c) => (typeof c === 'string' && c.charAt(0) === '#' ? c : pal.white);
  function glowSprite(color) {
    return sprite('glow|' + color, 64, 64, (g) => {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, rgba(tint(color, 0.6), 1));
      gr.addColorStop(0.22, rgba(color, 0.75));
      gr.addColorStop(0.55, rgba(color, 0.22));
      gr.addColorStop(1, rgba(color, 0));
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    });
  }
  // additive radial glow, cached and scaled: ART.tk.glow(ctx, x, y, r, '#5ff5ff', 0.8). Colour must be a hex string. add=false uses normal blending.
  function glow(ctx, x, y, r, color, alpha, add) {
    if (!(r > 0.5)) return;
    const spr = glowSprite(hexOk(color));
    ctx.save();
    if (add !== false) ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = ctx.globalAlpha * cA(alpha === undefined ? 1 : alpha);
    ctx.drawImage(spr, x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }
  // four-point star with concave sides. o: color, rot, alpha, thin (waist, default 0.16), glow (halo strength 0..1, default 0.5)
  function sparkle(ctx, x, y, r, o) {
    o = o || {};
    if (!(r > 0.3)) return;
    const rot = num(o.rot, 0), k = o.thin === undefined ? 0.16 : o.thin, col = o.color || pal.white;
    ctx.save();
    if (o.alpha !== undefined) ctx.globalAlpha = ctx.globalAlpha * cA(o.alpha);
    const gl = o.glow === undefined ? 0.5 : o.glow;
    if (gl > 0 && r > 2.5) glow(ctx, x, y, r * 1.5, hexOk(col), gl * 0.6);
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a0 = rot + i * PI / 2, a1 = a0 + PI / 2, am = a0 + PI / 4;
      const px = x + Math.cos(a0) * r, py = y + Math.sin(a0) * r;
      if (i === 0) ctx.moveTo(px, py);
      ctx.quadraticCurveTo(x + Math.cos(am) * r * k, y + Math.sin(am) * r * k, x + Math.cos(a1) * r, y + Math.sin(a1) * r);
    }
    ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    ctx.restore();
  }
  // Inked music note glyph centred on (x, y), head width about size. o: kind ('eighth' | 'quarter' | 'beamed' | 'rest'), color (ink), alpha, rot, line (stroke width)
  function note(ctx, x, y, size, o) {
    o = o || {};
    size = pos(size, 16);
    const col = hexOk(o.color || pal.ink), lw = pos(o.line, Math.max(1.2, size * 0.14)), kind = o.kind || 'eighth';
    ctx.save();
    if (o.alpha !== undefined) ctx.globalAlpha = ctx.globalAlpha * cA(o.alpha);
    ctx.translate(x, y); ctx.rotate(num(o.rot, 0));
    const hw = size * 0.5, hh = size * 0.36, sh = size * 1.7;
    const head = (hx, hy) => { ctx.beginPath(); ctx.ellipse(hx, hy, hw, hh, -0.35, 0, TAU); ctx.fillStyle = col; ctx.fill(); };
    const stem = (hx, hy) => { const sx = hx + hw * 0.86, sy = hy - hh * 0.2; inkPath(ctx, [[sx, sy], [sx, sy - sh]], { w: lw, color: col, align: 0, wobble: 0 }); return [sx, sy - sh]; };
    if (kind === 'rest') {
      const pts = [[-hw * 0.3, -size * 0.9], [hw * 0.7, -size * 0.5], [-hw * 0.3, -size * 0.1], [hw * 0.6, size * 0.3]];
      inkPath(ctx, pts, { w: lw * 1.2, color: col, align: 0, wobble: 0 });
      ctx.beginPath(); ctx.ellipse(-hw * 0.1, size * 0.6, hw * 0.6, hh * 0.9, 0, 0, TAU); ctx.fillStyle = col; ctx.fill();
    } else if (kind === 'beamed') {
      const ax = -hw * 1.1, bx = hw * 1.5;
      head(ax, 0); head(bx, -size * 0.2);
      const t1 = stem(ax, 0), t2 = stem(bx, -size * 0.2);
      inkPath(ctx, [[t1[0], t1[1]], [t2[0], t2[1]]], { w: lw * 2.2, color: col, align: 0, wobble: 0 });
    } else {
      head(0, 0);
      const top = stem(0, 0);
      if (kind !== 'quarter') inkPath(ctx, [[top[0], top[1]], [top[0] + size * 0.55, top[1] + size * 0.5], [top[0] + size * 0.4, top[1] + size * 0.95]], { w: lw, color: col, align: 0, wobble: 0 });
    }
    ctx.restore();
  }
  // Concentric sound rings centred on (x, y), first ring at r. o: n (3), gap (0.32, share of r), color (gold), alpha, lw, broken (false: outermost ring as left and right arcs), rot
  function soundRings(ctx, x, y, r, o) {
    o = o || {};
    r = pos(r, 10);
    const n = Math.max(1, Math.min(12, Math.round(num(o.n, 3)))), gap = num(o.gap, 0.32), lw = pos(o.lw, Math.max(1, r * 0.1));
    ctx.save();
    if (o.alpha !== undefined) ctx.globalAlpha = ctx.globalAlpha * cA(o.alpha);
    ctx.strokeStyle = hexOk(o.color || pal.gold); ctx.lineWidth = lw; ctx.lineCap = 'round';
    const rot = num(o.rot, 0);
    for (let i = 0; i < n; i++) {
      const rr = r * (1 + gap * i);
      ctx.beginPath();
      if (o.broken && i === n - 1) {
        ctx.arc(x, y, rr, rot + PI * 0.65, rot + PI * 1.35); ctx.moveTo(x + Math.cos(rot - PI * 0.35) * rr, y + Math.sin(rot - PI * 0.35) * rr); ctx.arc(x, y, rr, rot - PI * 0.35, rot + PI * 0.35);
      } else ctx.arc(x, y, rr, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
  // Drifting gold-leaf flecks over the rect (x, y, w, h). t in seconds; o: n (14), seed, color (gold), size (max radius, 3.2), rise (px/s, 6)
  function kirakira(ctx, x, y, w, h, t, o) {
    o = o || {};
    const n = o.n === undefined ? 14 : o.n, sd = o.seed | 0, size = num(o.size, 3.2), rise = num(o.rise, 6) * motion(), col = o.color || pal.gold;
    const tt = num(t, 0);
    for (let i = 0; i < n; i++) {
      const v1 = vary(sd, 'kx' + i), v2 = vary(sd, 'ky' + i), v3 = vary(sd, 'kp' + i), v4 = vary(sd, 'ks' + i);
      const px = x + v1 * w + Math.sin(tt * 0.6 + v3 * TAU) * 6 * motion();
      const py = y + ((v2 * h - tt * rise * (0.5 + v4)) % h + h) % h;
      const tw = 0.5 + 0.5 * Math.sin(tt * (1.5 + v4 * 2) + v3 * TAU);
      if (tw < 0.12) continue;
      sparkle(ctx, px, py, size * (0.4 + v4 * 0.7) * (0.5 + tw * 0.6), { color: v4 > 0.6 ? pal.gold2 : col, alpha: tw, rot: v3, glow: 0.3 });
    }
  }
  // Manga speed lines. o.mode 'radial' (default: lines converge on cx, cy between radii r0 and r1) or 'dir' (parallel lines at o.angle across
  // the rect o.rect [x, y, w, h], each up to o.len long). Also: n (36), seed, color, alpha (0.7), w (max line width, 3)
  function speedLines(ctx, cx, cy, o) {
    o = o || {};
    const n = o.n === undefined ? 36 : o.n, rr = rng('speed', o.seed | 0), w = pos(o.w, 3), col = o.color || pal.white;
    ctx.save();
    ctx.globalAlpha = ctx.globalAlpha * cA(o.alpha === undefined ? 0.7 : o.alpha);
    ctx.fillStyle = col;
    ctx.beginPath();
    if (o.mode === 'dir') {
      const R = o.rect || [cx - 300, cy - 200, 600, 400], ang = num(o.angle, 0), len = pos(o.len, 220), c = Math.cos(ang), s = Math.sin(ang);
      for (let i = 0; i < n; i++) {
        const px = R[0] + rr() * R[2], py = R[1] + rr() * R[3], l = len * (0.35 + rr() * 0.65), ww = w * (0.3 + rr() * 0.7);
        ctx.moveTo(px, py); ctx.lineTo(px - c * l - s * ww / 2, py - s * l + c * ww / 2); ctx.lineTo(px - c * l + s * ww / 2, py - s * l - c * ww / 2); ctx.closePath();
      }
    } else {
      const r0 = num(o.r0, 60), r1 = pos(o.r1, 800);
      for (let i = 0; i < n; i++) {
        const a = (i + rr() * 0.8) / n * TAU, ri = r0 + rr() * (r1 - r0) * 0.35, ww = w * (0.35 + rr() * 0.9) / 2, ro = r1, ca = Math.cos(a), sa = Math.sin(a);
        ctx.moveTo(cx + ca * ri, cy + sa * ri); ctx.lineTo(cx + ca * ro - sa * ww * 2, cy + sa * ro + ca * ww * 2); ctx.lineTo(cx + ca * ro + sa * ww * 2, cy + sa * ro - ca * ww * 2); ctx.closePath();
      }
    }
    ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // small shared shapes: petal, lightning bolt, gradients, scoped state
  // ---------------------------------------------------------------------------------------------------------------
  // A soft sakura-style petal with a rose edge and a white highlight, centred at (x, y), size = half length. base is the fill (default pink).
  function petal(ctx, x, y, size, rot, alpha, base) {
    if (!(size > 0.3) || !(alpha > 0.02)) return;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(num(rot, 0)); ctx.globalAlpha = ctx.globalAlpha * cA(alpha);
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.bezierCurveTo(size * 0.9, -size * 0.7, size * 0.8, size * 0.55, 0, size * 0.85);
    ctx.bezierCurveTo(-size * 0.8, size * 0.55, -size * 0.9, -size * 0.7, 0, -size);
    ctx.fillStyle = base || '#ff9cc6'; ctx.fill();
    ctx.lineWidth = Math.max(0.8, size * 0.12); ctx.strokeStyle = '#b0245c'; ctx.globalAlpha = ctx.globalAlpha * 0.8; ctx.stroke();
    ctx.globalAlpha = ctx.globalAlpha * 0.9; ctx.beginPath(); ctx.ellipse(-size * 0.2, -size * 0.25, size * 0.22, size * 0.42, 0.3, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.restore();
  }
  // A jagged lightning bolt from (x0, y0) to (x1, y1): a soft coloured underglow stroke and a bright core. Deterministic per o.seed
  // (feed it Math.floor(t * 14) for a crackle). o: seed, w (core width, 2), jag (sideways wander in px, 8), n (segments, 6), color ('#5fd0ff'), core ('#eaffff')
  function bolt(ctx, x0, y0, x1, y1, o) {
    o = o || {};
    const n = Math.max(2, o.n | 0 || 6), w = pos(o.w, 2), jag = num(o.jag, 8), r = rng('bolt', o.seed | 0);
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, pts = [[x0, y0]];
    for (let i = 1; i < n; i++) { const u = i / n, off = (r() - 0.5) * 2 * jag * Math.sin(u * PI); pts.push([x0 + dx * u + nx * off, y0 + dy * u + ny * off]); }
    pts.push([x1, y1]);
    inkPath(ctx, { poly: pts }, { w: w * 2.8, color: rgba(o.color || '#5fd0ff', 0.4), taper: 0.2, wobble: 0, pressure: 'flat', step: 60 });
    inkPath(ctx, { poly: pts }, { w, color: o.core || '#eaffff', taper: 0.25, wobble: 0, pressure: 'flat', step: 60 });
  }
  // gradient helpers: stops = [[offset, colour], ...]
  function lin(ctx, x0, y0, x1, y1, stops) { const g = ctx.createLinearGradient(num(x0), num(y0), num(x1), num(y1)); stops.forEach((s) => g.addColorStop(clamp(s[0], 0, 1), s[1])); return g; }
  function rad(ctx, x0, y0, r0, x1, y1, r1, stops) { const g = ctx.createRadialGradient(num(x0), num(y0), Math.max(0, num(r0)), num(x1), num(y1), Math.max(0, num(r1))); stops.forEach((s) => g.addColorStop(clamp(s[0], 0, 1), s[1])); return g; }
  // withAlpha: run fn(ctx) with the global alpha multiplied by a (restored after). flipX: run fn(ctx) mirrored about the vertical line x (saved and restored)
  function withAlpha(ctx, a, fn) { const ga = ctx.globalAlpha; ctx.globalAlpha = ga * cA(a); fn(ctx); ctx.globalAlpha = ga; }
  function flipX(ctx, x, fn) { ctx.save(); ctx.translate(x, 0); ctx.scale(-1, 1); ctx.translate(-x, 0); fn(ctx); ctx.restore(); }


  // ---------------------------------------------------------------------------------------------------------------
  // 2D affine matrices [a, b, c, d, e, f] (the canvas order) and the sliced rigid chain
  // ---------------------------------------------------------------------------------------------------------------
  const mat = {
    I: () => [1, 0, 0, 1, 0, 0],
    mul: (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]],
    pt: (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]],
    inv: (m) => {
      const d = m[0] * m[3] - m[1] * m[2] || 1e-9;
      return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d];
    },
    // rotate by rot and scale (sx, sy) about the pivot (px, py), then translate by (dx, dy)
    local: (px, py, dx, dy, rot, sx, sy) => {
      const c = Math.cos(rot || 0), s = Math.sin(rot || 0), a = c * (sx === undefined ? 1 : sx), b = s * (sx === undefined ? 1 : sx), cc = -s * (sy === undefined ? 1 : sy), d = c * (sy === undefined ? 1 : sy);
      return [a, b, cc, d, px + (dx || 0) - (a * px + cc * py), py + (dy || 0) - (b * px + d * py)];
    },
  };
  // A chain is a piece of art (a lock of hair, a tail, a sash, a strand of silk) that bends. The art is drawn ONCE at rest by o.draw and cut
  // into rigid slabs at fractions of a spine; each slab is a cached sprite. Drawing rotates the slabs about their joints, so the whole thing
  // bends like a real ribbon at the price of one drawImage per slab, and the shading and outline never seam because they were drawn together.
  //   ART.tk.chain(key, o) -> chain
  //   o.spine    [[x, y], ...] the spine of the artwork at rest (root first), only used to place the joints and the cuts
  //   o.cuts     fractions of the spine length where it splits, default [0.34, 0.68] (so 3 slabs)
  //   o.reach    half width of a slab in px, must cover the artwork (default 40)      o.overlap  px each slab runs into the next (default 4)
  //   o.draw     fn(ctx) painting the WHOLE artwork at rest in the spine's coordinates
  //   chain.draw(ctx, bends, q)   bends[0] rotates the whole chain about its root, bends[j] the j-th joint (radians, each relative to the
  //                               slab before it); q (default 1) is the raster scale: use ceil(2 * zoom) / 2 so big draws stay sharp
  //   chain.warm(q)               bake every slab now (returns the slab count)
  //   chain.segs, chain.joints    for tests and debugging
  function chain(key, o) {
    const spine = o.spine, cuts = o.cuts || [0.34, 0.68], reach = pos(o.reach, 40), overlap = o.overlap === undefined ? 4 : o.overlap;
    const d = flatten(spine, { step: 3 });
    const m = d.length >> 1, L = [0];
    for (let i = 1; i < m; i++) L.push(L[i - 1] + Math.hypot(d[2 * i] - d[2 * i - 2], d[2 * i + 1] - d[2 * i - 1]));
    const total = L[m - 1] || 1;
    const at = (u) => {
      const s = clamp(u, 0, 1) * total;
      let i = 1;
      while (i < m - 1 && L[i] < s) i++;
      const i0 = i - 1, sp = L[i] - L[i0] || 1, f = clamp((s - L[i0]) / sp, 0, 1);
      let tx = d[2 * i] - d[2 * i0], ty = d[2 * i + 1] - d[2 * i0 + 1];
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      return { x: lerp(d[2 * i0], d[2 * i], f), y: lerp(d[2 * i0 + 1], d[2 * i + 1], f), tx, ty };
    };
    const start = at(0), end = at(1), joints = cuts.map(at);
    const ext = (p, s) => ({ x: p.x + p.tx * s, y: p.y + p.ty * s, tx: p.tx, ty: p.ty });
    const bounds = [ext(start, -reach)].concat(joints, [ext(end, reach)]);
    const segs = [];
    for (let j = 0; j < bounds.length - 1; j++) {
      const a = bounds[j], b0 = bounds[j + 1], b = j < bounds.length - 2 ? ext(b0, overlap) : b0;
      const qa0 = [a.x + a.ty * reach, a.y - a.tx * reach], qa1 = [a.x - a.ty * reach, a.y + a.tx * reach];
      const qb0 = [b.x + b.ty * reach, b.y - b.tx * reach], qb1 = [b.x - b.ty * reach, b.y + b.tx * reach];
      const poly = [qa0, qb0, qb1, qa1];
      const bx = bbox(poly);
      segs.push({ poly, box: [Math.floor(bx[0]), Math.floor(bx[1]), Math.ceil(bx[2]), Math.ceil(bx[3])], pivot: j === 0 ? [start.x, start.y] : [bounds[j].x, bounds[j].y] });
    }
    const spr = (j, q) => {
      const sg = segs[j], bw = sg.box[2] - sg.box[0], bh = sg.box[3] - sg.box[1];
      return sprite(key + '|c' + j + '|q' + q, bw * q, bh * q, (g) => {
        g.scale(q, q); g.translate(-sg.box[0], -sg.box[1]);
        g.save(); g.beginPath(); traceShape(g, { poly: sg.poly }); g.clip();
        o.draw(g);
        g.restore();
      });
    };
    return {
      segs, joints, total,
      warm(q) { for (let j = 0; j < segs.length; j++) spr(j, q || 1); return segs.length; },
      draw(ctx, bends, q) {
        q = q || 1;
        const mats = [];
        let M = mat.I();
        for (let j = 0; j < segs.length; j++) {
          const b = bends && bends[j] ? bends[j] : 0;
          if (b) M = mat.mul(M, mat.local(segs[j].pivot[0], segs[j].pivot[1], 0, 0, b, 1, 1));
          mats.push(M);
        }
        for (let j = segs.length - 1; j >= 0; j--) {
          const sg = segs[j], mm = mats[j];
          ctx.save();
          ctx.transform(mm[0], mm[1], mm[2], mm[3], mm[4], mm[5]);
          ctx.drawImage(spr(j, q), sg.box[0], sg.box[1], sg.box[2] - sg.box[0], sg.box[3] - sg.box[1]);
          ctx.restore();
        }
      },
    };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // faces: the anime eye, brows, mouths, blush
  // ---------------------------------------------------------------------------------------------------------------
  // expression presets for the eye: arc (a drawn curve instead of an eye), tilt (inner corner lowered, radians-ish, 0..1),
  // drop (share of the eye height the flat upper lid covers), lash (line weight multiplier)
  const EYE_PRESETS = {
    neutral: {},
    smile: {},
    happy: { arc: 'happy' },
    closed: { arc: 'closed' },
    angry: { tilt: 0.6, drop: 0.2, lash: 1.25 },
    determined: { tilt: 0.3, drop: 0.14, lash: 1.15 },
    hurt: { arc: 'hurt' },
    sad: { tilt: -0.5, drop: 0.1 },
    wide: { wide: 1.14 },
    half: { drop: 0.4 },
    sleepy: { drop: 0.5, tilt: -0.12 },
    smirk: { tilt: 0.22, drop: 0.3 },
  };
  // Draw one anime eye centred at (cx, cy), w wide, h tall (h > w gives the big vertical anime eye).
  //   o.expr    neutral | happy | closed | angry | determined | hurt | sad | wide | half | sleepy | smirk   (presets, see EYE_PRESETS)
  //   o.side    +1 (default) the outer corner and the wing flick point to +x, -1 mirrored
  //   o.open    0..1, animate for blinking (0 = closed)             o.look [dx, dy] -1..1 iris offset
  //   o.iris    [topColour, bottomColour] gradient, default violet  o.pupil, o.ring, o.sclera, o.ink colours
  //   o.tilt, o.drop, o.lash, o.wing (0..1 flick length, default 0.55), o.lineW (px)   override the preset numbers
  //   o.catch   catchlight strength 0..1 (default 1), o.catchSide +1/-1 which side the big catchlight sits in world space (default +1)
  //   o.star    the tiny star catchlight (default true)            o.glow 0..1 emissive glow behind and inside the iris
  //   o.lashes  little lash flicks at the outer corner (default true when w >= 14)
  function eye(ctx, cx, cy, w, h, o) {
    o = o || {};
    w = pos(w, 10); h = pos(h, 12);
    const pr = EYE_PRESETS[o.expr] || EYE_PRESETS.neutral;
    const side = o.side === -1 ? -1 : 1;
    const open = clamp(o.open === undefined ? 1 : num(o.open, 1), 0, 1);
    const arc = o.arc !== undefined ? o.arc : pr.arc;
    const tilt = o.tilt !== undefined ? o.tilt : (pr.tilt || 0);
    const drop = o.drop !== undefined ? o.drop : (pr.drop || 0);
    const lashK = num(o.lash, pr.lash || 1);
    const ink = o.ink || pal.ink;
    const lw = pos(o.lineW, Math.max(1.1, w * 0.085));
    const wing = o.wing === undefined ? 0.55 : o.wing;
    const iris = o.iris || ['#3a2a8a', '#9d8cff'];
    const a = w / 2 * (pr.wide || 1), b = h / 2 * (pr.wide || 1);
    ctx.save();
    ctx.translate(cx, cy);
    if (side < 0) ctx.scale(-1, 1);
    const glowK = clamp(num(o.glow, 0), 0, 1);
    const isArc = arc === 'happy' || arc === 'closed' || arc === 'hurt' || open < 0.09;
    if (glowK > 0.01 && !isArc) glow(ctx, 0, 0, w * 0.95, hexOk(iris[1]), glowK * 0.7);
    if (isArc) {
      const kind = arc || 'closed';
      if (kind === 'happy') {
        inkPath(ctx, [[-a, b * 0.3], [-a * 0.55, -b * 0.28], [a * 0.05, -b * 0.5], [a * 0.62, -b * 0.3], [a * 1.02, b * 0.18], [a * 1.08 + wing * w * 0.12, b * 0.02]], { w: lw * 2.6 * lashK, color: ink, taperStart: 0.3, taperEnd: 0.2, pressure: (u) => 0.5 + 0.7 * u, wobble: 0.06, seed: 3 });
        inkPath(ctx, [[-a * 0.55, b * 0.38], [0, b * 0.3], [a * 0.5, b * 0.34]], { w: lw * 0.7, color: ink, alpha: 0.55, taper: 0.4 });
      } else if (kind === 'hurt') {
        inkPath(ctx, [[a * 0.95, -b * 0.75], [-a * 0.1, -b * 0.3], [-a * 0.65, 0.0]], { w: lw * 2.3, color: ink, taperStart: 0.05, taperEnd: 0.25, pressure: 'flat', wobble: 0.05 });
        inkPath(ctx, [[-a * 0.65, 0.0], [-a * 0.1, b * 0.3], [a * 0.95, b * 0.75]], { w: lw * 2.3, color: ink, taperStart: 0.25, taperEnd: 0.05, pressure: 'flat', wobble: 0.05 });
      } else {
        inkPath(ctx, [[-a, -b * 0.05], [-a * 0.5, b * 0.28], [a * 0.1, b * 0.4], [a * 0.68, b * 0.24], [a * 1.02, -b * 0.08], [a * 1.1 + wing * w * 0.1, -b * 0.28]], { w: lw * 2.5 * lashK, color: ink, taperStart: 0.28, taperEnd: 0.22, pressure: (u) => 0.55 + 0.6 * u, wobble: 0.06, seed: 4 });
        if (w >= 14) { inkPath(ctx, [[a * 0.7, b * 0.26], [a * 0.98, b * 0.5]], { w: lw * 0.9, color: ink, taper: 0.5 }); inkPath(ctx, [[a * 0.35, b * 0.38], [a * 0.5, b * 0.66]], { w: lw * 0.8, color: ink, taper: 0.5 }); }
      }
      ctx.restore();
      return;
    }
    // ----- the open eye: lid outline in local space, outer corner at +x
    const yb = (x) => 0.1 * b + 0.88 * b * (1 - (x / a) * (x / a));            // bottom lid height at x
    const topPts = [[-a * 0.62, -b * 0.8], [-a * 0.12, -b * 1.0], [a * 0.5, -b * 0.92]];
    const cutY = -b + 2 * b * drop;
    const top = topPts.map((p) => {
      let y = p[1];
      y = Math.max(y, cutY);
      y += tilt * b * 0.5 * (-p[0] / a);
      y = lerp(yb(p[0]), y, open);
      return [p[0], Math.min(y, yb(p[0]) - 0.04 * b)];
    });
    const I = [-a, b * 0.12, 1], O = [a * 1.02, -b * 0.05 + tilt * b * -0.1, 1];
    const shape = [I, top[0], top[1], top[2], O, [a * 0.58, b * 0.68], [0, b * 0.98], [-a * 0.6, b * 0.8]];
    ctx.save();
    ctx.beginPath(); traceShape(ctx, shape); ctx.clip();
    ctx.fillStyle = o.sclera || pal.white; ctx.fillRect(-a * 1.3, -b * 1.3, a * 2.6, b * 2.6);
    const look = o.look || [0, 0];
    const irx = a * 0.84, iry = b * 1.04, icx = num(look[0]) * a * 0.3, icy = b * 0.04 + num(look[1]) * b * 0.22;
    const gr = ctx.createLinearGradient(0, icy - iry, 0, icy + iry);
    gr.addColorStop(0, iris[0]); gr.addColorStop(0.5, mix(iris[0], iris[1], 0.5)); gr.addColorStop(1, glowK > 0.2 ? tint(iris[1], 0.35) : iris[1]);
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.ellipse(icx, icy, irx, iry, 0, 0, TAU); ctx.fill();
    ctx.lineWidth = Math.max(0.6, w * 0.05); ctx.strokeStyle = o.ring || deep(iris[0], 0.35); ctx.stroke();
    ctx.fillStyle = o.pupil || deep(iris[0], 0.72);
    ctx.beginPath(); ctx.ellipse(icx, icy - iry * 0.02, irx * 0.4, iry * 0.5, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = ctx.globalAlpha * 0.5; ctx.fillStyle = tint(iris[1], 0.5);
    ctx.beginPath(); ctx.ellipse(icx, icy + iry * 0.52, irx * 0.72, iry * 0.34, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = ctx.globalAlpha * 2;
    // hard lid shadow across the top
    ctx.save();
    ctx.beginPath(); ctx.rect(-a * 1.4, -b * 1.4, a * 2.8, b * 2.8); traceShape(ctx, shape, 0, 0.3 * h * Math.max(0.35, open)); ctx.clip('evenodd');
    ctx.fillStyle = rgba(pal.indigo, 0.34); ctx.fillRect(-a * 1.4, -b * 1.4, a * 2.8, b * 2.8);
    ctx.restore();
    const ck = clamp(o.catch === undefined ? 1 : num(o.catch, 1), 0, 1);
    if (ck > 0.02) {
      const cs = (o.catchSide === -1 ? -1 : 1) * side;
      ctx.globalAlpha = ctx.globalAlpha * ck; ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(icx + cs * irx * 0.4, icy - iry * 0.36, irx * 0.26, iry * 0.24, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(icx - cs * irx * 0.4, icy + iry * 0.5, Math.max(0.5, irx * 0.11), 0, TAU); ctx.fill();
      if (o.star !== false && w >= 16) sparkle(ctx, icx - cs * irx * 0.12, icy + iry * 0.28, irx * 0.2, { color: '#ffffff', glow: 0, thin: 0.2 });
      ctx.globalAlpha = ctx.globalAlpha / ck;
    }
    ctx.restore();
    // ink: heavy upper lid with the wing flick, a lighter second lid, lower lash, tiny inner tick
    const wx = O[0] + wing * w * 0.34, wy = O[1] - wing * h * 0.26 + tilt * b * -0.05;
    inkPath(ctx, [[I[0] + a * 0.05, I[1] - b * 0.05], top[0], top[1], top[2], [O[0], O[1]], [wx, wy]], { w: lw * 2.4 * lashK, color: ink, taperStart: 0.22, taperEnd: 0.16, pressure: (u) => 0.4 + 0.75 * Math.pow(u, 0.7), wobble: 0.05, seed: 7 });
    if (w >= 12) inkPath(ctx, [[top[1][0] - a * 0.1, top[1][1] - b * 0.09], [top[2][0], top[2][1] - b * 0.1], [O[0] + a * 0.02, O[1] - b * 0.12], [wx - w * 0.06, wy - h * 0.06]], { w: lw * 0.85, color: ink, alpha: 0.85, taper: 0.4, wobble: 0.05, seed: 9 });
    if (o.lashes !== false && w >= 14) {
      inkPath(ctx, [[top[2][0] + a * 0.15, top[2][1] - b * 0.02], [top[2][0] + a * 0.3, top[2][1] - b * 0.28]], { w: lw * 0.9, color: ink, taper: 0.6 });
      inkPath(ctx, [[O[0] - a * 0.08, O[1]], [O[0] + a * 0.16, O[1] - b * 0.36]], { w: lw * 0.9, color: ink, taper: 0.6 });
    }
    inkPath(ctx, [[a * 0.62, b * 0.7], [a * 0.3, b * 0.92], [-a * 0.15, b * 1.0]], { w: lw * 0.75, color: ink, alpha: 0.8, taper: 0.45, wobble: 0.05 });
    inkPath(ctx, [[-a * 1.0, b * 0.02], [-a * 1.12, b * 0.2]], { w: lw * 0.7, color: ink, alpha: 0.65, taper: 0.5 });
    ctx.restore();
  }
  // Eyebrow: a tapered brush tick, thicker at the inner end. o: side (+1 outer end at +x), tilt (0..1 inner end lowered: angry), arch (0..1),
  // thick (px, default 2.6), color, seed
  function brow(ctx, x, y, w, o) {
    o = o || {};
    const side = o.side === -1 ? -1 : 1, tilt = num(o.tilt, 0), arch = num(o.arch, 0.35), th = pos(o.thick, Math.max(1.4, w * 0.13));
    const ang = -tilt * 0.6, c = Math.cos(ang), s = Math.sin(ang);
    const raw = [[-w / 2, 0], [-w * 0.12, -arch * w * 0.14], [w * 0.28, -arch * w * 0.12], [w / 2, w * 0.05]];
    const pts = raw.map((p) => [x + side * (p[0] * c - p[1] * s), y + (p[0] * s + p[1] * c)]);
    inkPath(ctx, pts, { w: th, color: o.color || pal.ink, pressure: (u) => 1 - 0.55 * u, taperStart: 0.1, taperEnd: 0.5, wobble: 0.08, seed: o.seed | 0, alpha: o.alpha });
  }
  // Mouth of width w centred at (x, y). kind: smile | smirk | flat | frown | open | grin | shout | grit | cat | tiny. o: lineW, color, inner, tongue
  function mouth(ctx, x, y, w, kind, o) {
    o = o || {};
    w = pos(w, 10);
    const lw = pos(o.lineW, Math.max(1.1, w * 0.1)), ink = o.color || pal.ink, inner = o.inner || '#7a1638', tongue = o.tongue || '#ff7fa0';
    const line = (pts, wid, k) => inkPath(ctx, pts, { w: wid || lw * 1.4, color: ink, taper: 0.38, wobble: 0.06, seed: k || 1 });
    const fillOpen = (shape, bx, by, bw, bh) => {
      ctx.save();
      ctx.beginPath(); traceShape(ctx, shape); ctx.fillStyle = inner; ctx.fill(); ctx.clip();
      ctx.beginPath(); ctx.ellipse(bx, by + bh * 0.36, bw * 0.36, bh * 0.3, 0, 0, TAU); ctx.fillStyle = tongue; ctx.fill();
      ctx.restore();
    };
    if (kind === 'smile') {
      line([[x - w / 2, y - w * 0.02], [x - w * 0.22, y + w * 0.14], [x + w * 0.2, y + w * 0.14], [x + w / 2, y - w * 0.08]]);
      line([[x + w * 0.5, y - w * 0.06], [x + w * 0.58, y - w * 0.16]], lw * 0.9, 2);
    } else if (kind === 'smirk') {
      line([[x - w / 2, y + w * 0.06], [x - w * 0.1, y + w * 0.14], [x + w * 0.3, y + w * 0.05], [x + w / 2, y - w * 0.16]]);
      line([[x + w * 0.5, y - w * 0.14], [x + w * 0.6, y - w * 0.25]], lw * 0.9, 2);
    } else if (kind === 'flat') line([[x - w / 2, y], [x, y + w * 0.05], [x + w / 2, y - w * 0.02]]);
    else if (kind === 'frown') line([[x - w / 2, y + w * 0.1], [x - w * 0.2, y - w * 0.04], [x + w * 0.2, y - w * 0.04], [x + w / 2, y + w * 0.1]]);
    else if (kind === 'cat') {
      line([[x - w / 2, y - w * 0.04], [x - w * 0.24, y + w * 0.14], [x, y - w * 0.02]], lw * 1.3);
      line([[x, y - w * 0.02], [x + w * 0.24, y + w * 0.14], [x + w / 2, y - w * 0.06]], lw * 1.3, 2);
    } else if (kind === 'tiny') {
      ctx.beginPath(); ctx.ellipse(x, y + w * 0.04, w * 0.14, w * 0.11, 0, 0, TAU); ctx.fillStyle = inner; ctx.fill();
      inkPath(ctx, ellipsePts(x, y + w * 0.04, w * 0.14, w * 0.11, 8), { closed: true, w: lw, color: ink, align: 0 });
    } else if (kind === 'open') {
      const sh = ellipsePts(x, y + w * 0.12, w * 0.24, w * 0.3, 10);
      fillOpen(sh, x, y + w * 0.12, w * 0.5, w * 0.6);
      inkPath(ctx, sh, { closed: true, w: lw * 1.4, color: ink, align: 0 });
    } else if (kind === 'grit') {
      const sh = [[x - w * 0.5, y - w * 0.02], [x + w * 0.5, y - w * 0.02], [x + w * 0.44, y + w * 0.3], [x, y + w * 0.36], [x - w * 0.44, y + w * 0.3]];
      ctx.beginPath(); traceShape(ctx, sh, 0, 0, 0.6); ctx.fillStyle = '#fff8f0'; ctx.fill();
      ctx.save(); ctx.beginPath(); traceShape(ctx, sh, 0, 0, 0.6); ctx.clip();
      for (let i = 1; i < 5; i++) inkPath(ctx, [[x - w * 0.5 + w * i * 0.2, y - w * 0.04], [x - w * 0.5 + w * i * 0.2, y + w * 0.38]], { w: lw * 0.7, color: ink, taper: 0, pressure: 'flat', wobble: 0 });
      inkPath(ctx, [[x - w * 0.5, y + w * 0.16], [x + w * 0.5, y + w * 0.16]], { w: lw * 0.8, color: ink, taper: 0, pressure: 'flat', wobble: 0 });
      ctx.restore();
      inkPath(ctx, sh, { closed: true, w: lw * 1.5, color: ink, align: 0, tension: 0.6 });
    } else {                                                                     // grin | shout
      const big = kind === 'shout';
      const sh = [[x - w * 0.5, y - w * 0.06], [x - w * 0.2, y - w * 0.13], [x + w * 0.22, y - w * 0.13], [x + w * 0.5, y - w * 0.08], [x + w * 0.36, y + w * (big ? 0.5 : 0.34)], [x, y + w * (big ? 0.62 : 0.46)], [x - w * 0.36, y + w * (big ? 0.5 : 0.34)]];
      fillOpen(sh, x, y + w * 0.1, w, w * (big ? 0.7 : 0.5));
      ctx.save(); ctx.beginPath(); traceShape(ctx, sh); ctx.clip();
      ctx.fillStyle = '#fff8f0'; ctx.beginPath(); ctx.rect(x - w * 0.6, y - w * 0.2, w * 1.2, w * (big ? 0.24 : 0.18)); ctx.fill();
      ctx.restore();
      inkPath(ctx, sh, { closed: true, w: lw * 1.5, color: ink, align: 0 });
    }
  }
  // Blush: a soft rose patch with three hatch marks. o: color (default #ff7aa6), alpha (0.4), hatch (default true)
  function blush(ctx, x, y, w, o) {
    o = o || {};
    const col = o.color || '#ff7aa6', h = w * 0.55;
    ctx.save();
    ctx.globalAlpha = ctx.globalAlpha * cA(o.alpha === undefined ? 0.4 : o.alpha);
    ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, w / 2, h / 2, 0, 0, TAU); ctx.fill();
    ctx.restore();
    if (o.hatch !== false && w >= 9) for (let i = 0; i < 3; i++) inkPath(ctx, [[x - w * 0.3 + i * w * 0.24, y + h * 0.28], [x - w * 0.16 + i * w * 0.24, y - h * 0.28]], { w: Math.max(0.8, w * 0.055), color: deep(col, 0.2), alpha: 0.7, taper: 0.5, wobble: 0 });
  }
  // tiny nose mark; s is the face size hint (px)
  function nose(ctx, x, y, s, o) {
    o = o || {};
    inkPath(ctx, [[x - s * 0.02, y - s * 0.03], [x + s * 0.03, y + s * 0.03], [x + s * 0.09, y + s * 0.04]], { w: Math.max(0.9, s * 0.032), color: o.color || deep(o.skin || '#e8b090', 0.4), alpha: 0.8, taper: 0.45, wobble: 0 });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // atmosphere: paper grain, vignette, sky, mist, stars, moon
  // ---------------------------------------------------------------------------------------------------------------
  function grainPattern(ctx) {
    const res = A.res > 0 ? A.res : 1;
    const pk = 'grain@' + res;
    let pat = patterns.get(pk);
    if (pat) return pat;
    const S = 192;
    const spr = sprite('paper|grain', S, S, (g) => {
      const r = rng('paper', 'grain');
      for (let i = 0; i < 900; i++) {
        const x = r() * S, y = r() * S, dark = r() < 0.55, s = 0.4 + r() * 1.1;
        g.fillStyle = dark ? rgba('#3a2a1a', 0.05 + r() * 0.16) : rgba('#ffffff', 0.05 + r() * 0.18);
        g.fillRect(x, y, s, s);
      }
      g.lineCap = 'round';
      for (let i = 0; i < 90; i++) {
        const x = r() * S, y = r() * S, a = r() * TAU, l = 3 + r() * 9, dark = r() < 0.5;
        g.strokeStyle = dark ? rgba('#4a3220', 0.09 + r() * 0.08) : rgba('#ffffff', 0.12 + r() * 0.1);
        g.lineWidth = 0.4 + r() * 0.5;
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (r() - 0.5) * 3, y + Math.sin(a) * l * 0.5 + (r() - 0.5) * 3, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      }
      for (let i = 0; i < 8; i++) {
        const x = r() * S, y = r() * S;
        g.fillStyle = rgba('#8a6a3a', 0.025); g.beginPath(); g.arc(x, y, 8 + r() * 14, 0, TAU); g.fill();
      }
    });
    try {
      pat = ctx.createPattern(spr, 'repeat');
      if (pat && typeof pat.setTransform === 'function' && typeof DOMMatrix === 'function') pat.setTransform(new DOMMatrix([1 / res, 0, 0, 1 / res, 0, 0]));
    } catch (e) { pat = null; }
    if (pat) patterns.set(pk, pat);
    return pat;
  }
  // washi paper grain over the rect. o: alpha (0.5), blend ('source-over' default, 'multiply' on light paper). One cached tile, one fill.
  function paperGrain(ctx, x, y, w, h, o) {
    o = o || {};
    if (lowQ() && o.force !== true) return;
    const pat = grainPattern(ctx);
    if (!pat) return;
    ctx.save();
    ctx.globalAlpha = ctx.globalAlpha * cA(o.alpha === undefined ? 0.5 : o.alpha);
    if (o.blend) ctx.globalCompositeOperation = o.blend;
    ctx.fillStyle = pat; ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
  // Hard or soft vignette over w x h. o: color (night), alpha (0.6), hard (a thick inset frame instead of a gradient), inner (0..1 clear centre size)
  function vignette(ctx, w, h, o) {
    o = o || {};
    const col = o.color || pal.night, a = o.alpha === undefined ? 0.6 : o.alpha, r = Math.hypot(w, h) / 2;
    ctx.save();
    if (o.hard) {
      ctx.globalAlpha = ctx.globalAlpha * cA(a); ctx.fillStyle = col;
      const t = Math.min(w, h) * 0.045;
      ctx.fillRect(0, 0, w, t); ctx.fillRect(0, h - t, w, t); ctx.fillRect(0, t, t, h - 2 * t); ctx.fillRect(w - t, t, t, h - 2 * t);
    } else {
      const g = ctx.createRadialGradient(w / 2, h / 2, r * clamp(o.inner === undefined ? 0.45 : o.inner, 0, 0.95), w / 2, h / 2, r);
      g.addColorStop(0, rgba(col, 0)); g.addColorStop(1, rgba(col, a));
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  }
  const SKIES = {
    dusk: [[0, '#ffc98a'], [0.3, '#ff8f7a'], [0.62, '#8a4fa0'], [1, '#2a1c55']],
    golden: [[0, '#ffe7a8'], [0.4, '#ffb36b'], [0.8, '#c97a72'], [1, '#6a3f7a']],
    night: [[0, '#0d0b1e'], [0.6, '#1a1340'], [1, '#3b2a7a']],
    dawn: [[0, '#ffd9c2'], [0.4, '#ffb0c8'], [0.75, '#a58bd8'], [1, '#4a3a8c']],
    storm: [[0, '#1a0a24'], [0.5, '#4a1238'], [1, '#b0245c']],
    crimson: [[0, '#2a0a20'], [0.55, '#8a1a3a'], [1, '#ff6a4a']],
    paper: [[0, '#f8efd6'], [1, '#e6d3a3']],
    moon: [[0, '#0b0a20'], [0.7, '#1e1a4c'], [1, '#4a4a9c']],
  };
  // Vertical sky gradient over the rect. preset: a key of ART.tk.skies (dusk golden night dawn storm crimson paper moon) or [[offset, hex], ...].
  // o.key caches the result as a sprite (recommended for full-screen static skies).
  function sky(ctx, x, y, w, h, preset, o) {
    o = o || {};
    const stops = Array.isArray(preset) ? preset : (SKIES[preset] || SKIES.night);
    const paint = (g, gx, gy, gw, gh) => {
      const gr = g.createLinearGradient(0, gy, 0, gy + gh);
      stops.forEach((s) => gr.addColorStop(clamp(s[0], 0, 1), s[1]));
      g.fillStyle = gr; g.fillRect(gx, gy, gw, gh);
    };
    if (o.key) { blit(ctx, sprite('sky|' + o.key + '|' + w + 'x' + h, w, h, (g, sw, sh) => paint(g, 0, 0, sw, sh)), x, y, w, h); return; }
    paint(ctx, x, y, w, h);
  }
  // Drifting fog bands over the rect at time t. o: n (5), seed, color (paper), alpha (0.12), speed (px/s, 10)
  function mist(ctx, x, y, w, h, t, o) {
    o = o || {};
    const n = o.n === undefined ? 5 : o.n, sd = o.seed | 0, col = hexOk(o.color || pal.paper), a = o.alpha === undefined ? 0.12 : o.alpha, sp = num(o.speed, 10) * motion();
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    for (let i = 0; i < n; i++) {
      const v = vary(sd, 'm' + i), v2 = vary(sd, 'my' + i), rw = w * (0.35 + v * 0.35), rh = h * (0.12 + v2 * 0.14);
      const px = x + ((v * (w + rw) + num(t, 0) * sp * (0.5 + v2)) % (w + rw * 2)) - rw, py = y + h * (0.25 + 0.7 * v2);
      glow(ctx, px, py, rw * 0.5, col, a * (0.6 + 0.4 * v), false);
      ctx.save(); ctx.translate(px, py); ctx.scale(1, rh / (rw * 0.5)); glow(ctx, 0, 0, rw * 0.5, col, a, false); ctx.restore();
    }
    ctx.restore();
  }
  // Twinkling starfield over the rect. o: n (60), seed, color (white)
  function stars(ctx, x, y, w, h, t, o) {
    o = o || {};
    const n = o.n === undefined ? 60 : o.n, sd = o.seed | 0, col = o.color || pal.white;
    const ga = ctx.globalAlpha;
    ctx.save();
    for (let i = 0; i < n; i++) {
      const px = x + vary(sd, 'sx' + i) * w, py = y + vary(sd, 'sy' + i) * h * 0.8, s = 0.5 + vary(sd, 'ss' + i) * 1.3;
      const tw = 0.55 + 0.45 * Math.sin(num(t, 0) * (0.8 + vary(sd, 'st' + i) * 2) + vary(sd, 'sp' + i) * TAU);
      ctx.globalAlpha = ga * cA(tw * (0.35 + 0.5 * vary(sd, 'sa' + i)));
      if (s > 1.5) sparkle(ctx, px, py, s * 2.4, { color: col, glow: 0, rot: 0.2 }); else { ctx.fillStyle = col; ctx.fillRect(px - s / 2, py - s / 2, s, s); }
    }
    ctx.restore();
  }
  // Moon disc with halo. o: glow (halo strength, 0.7), phase (0 full .. 1 new-ish crescent), color, seed
  function moon(ctx, x, y, r, o) {
    o = o || {};
    const col = o.color || '#fff4d6', ph = clamp(num(o.phase, 0), 0, 1);
    glow(ctx, x, y, r * 3.2, '#ffe9a8', o.glow === undefined ? 0.7 : o.glow);
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();
    ctx.fillStyle = col; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    const rr = rng('moon', o.seed | 0);
    ctx.fillStyle = rgba('#c8b890', 0.28);
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(x + (rr() - 0.5) * r * 1.3, y + (rr() - 0.5) * r * 1.3, r * (0.08 + rr() * 0.16), 0, TAU); ctx.fill(); }
    if (ph > 0.01) { ctx.fillStyle = rgba(pal.indigo, 0.92); ctx.beginPath(); ctx.arc(x + r * 2 * ph * 0.9, y - r * 0.1 * ph, r * 1.02, 0, TAU); ctx.fill(); }
    ctx.restore();
    inkPath(ctx, ellipsePts(x, y, r, r, 20), { closed: true, w: Math.max(1.2, r * 0.05), color: pal.ink, align: 0.5, wobble: 0.08, weightVar: 0.3 });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // lettering
  // ---------------------------------------------------------------------------------------------------------------
  const font = {
    num: '"Trebuchet MS","Segoe UI",Arial,"Liberation Sans",system-ui,sans-serif',
    display: '"Arial Rounded MT Bold","Nunito","Quicksand","Varela Round","Trebuchet MS",Arial,"Liberation Sans",system-ui,sans-serif',   // the css --font-display stack (HV_ART_AUDIO 9)
    ui: '"Segoe UI","Helvetica Neue",Arial,"Liberation Sans",system-ui,sans-serif',                                                          // the css --font-ui stack
  };
  // Heavy comic lettering: fill, thick ink outline, optional block shadow. o: fill (white), stroke (ink), strokeW (size * 0.16),
  // family (font.num), weight (900), skew (-0.18, negative leans right), align ('center'), rot (radians), shadow (colour), shadowOff (size * 0.08),
  // grad [topHex, bottomHex] for a vertical gradient fill.
  function inkText(ctx, text, x, y, size, o) {
    o = o || {};
    size = pos(size, 16);
    ctx.save();
    ctx.translate(x, y);
    if (o.rot) ctx.rotate(o.rot);
    const sk = o.skew === undefined ? -0.18 : o.skew;
    ctx.transform(1, 0, sk, 1, 0, 0);
    ctx.font = (o.weight || 900) + ' ' + size + 'px ' + (o.family || font.num);
    ctx.textAlign = o.align || 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.miterLimit = 2;
    const sw = pos(o.strokeW, size * 0.16);
    const str = String(text);
    if (o.shadow) { const off = num(o.shadowOff, size * 0.08); ctx.fillStyle = o.shadow; ctx.strokeStyle = o.shadow; ctx.lineWidth = sw; ctx.strokeText(str, off, off); ctx.fillText(str, off, off); }
    ctx.strokeStyle = o.stroke || pal.ink; ctx.lineWidth = sw; ctx.strokeText(str, 0, 0);
    if (o.grad) { const g = ctx.createLinearGradient(0, -size * 0.5, 0, size * 0.5); g.addColorStop(0, o.grad[0]); g.addColorStop(1, o.grad[1]); ctx.fillStyle = g; } else ctx.fillStyle = o.fill || pal.white;
    ctx.fillText(str, 0, 0);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // placeholder for unknown ids, and the gallery grid helper
  // ---------------------------------------------------------------------------------------------------------------
  // A labelled coloured box (a circle with o.round) that says "art missing here". Never throws. o: color, round, alpha
  function placeholder(ctx, label, x, y, w, h, o) {
    o = o || {};
    w = Math.max(1, num(w, 40)); h = Math.max(1, num(h, 40));
    const txt = String(label === undefined || label === null ? '?' : label);
    const hue = (U.hashStr(txt) % 360);
    const col = o.color || U.color.hsl(hue, 0.5, 0.36);
    ctx.save();
    if (o.alpha !== undefined) ctx.globalAlpha = ctx.globalAlpha * cA(o.alpha);
    ctx.beginPath();
    if (o.round) ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, TAU); else ctx.rect(x, y, w, h);
    ctx.fillStyle = col; ctx.fill();
    ctx.lineWidth = Math.max(1.5, Math.min(w, h) * 0.04); ctx.strokeStyle = pal.ink; ctx.stroke();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = rgba('#ffffff', 0.22); ctx.lineWidth = 1.5; ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); ctx.moveTo(x + w, y); ctx.lineTo(x, y + h); ctx.stroke();
    ctx.restore();
    const fs = clamp(Math.min(w / Math.max(3, txt.length) * 1.7, h * 0.3), 7, 22);
    ctx.font = '700 ' + fs + 'px ' + font.ui; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = pal.white; ctx.fillText(txt, x + w / 2, y + h / 2, Math.max(4, w - 4));
    ctx.restore();
  }
  // Lay out labelled cells on a gallery canvas so every artist can build a contact sheet in a few lines.
  //   ART.sheetGrid(canvas, params, cells, drawCell, opts)
  //   canvas, params   exactly what a sheet function receives (the context is already scaled; params.w and params.h are logical px)
  //   cells            array of strings or objects {label, ...anything}; the label is printed under the cell
  //   drawCell         fn(ctx, cell, w, h, i, cellInfo): the context is clipped to the cell and translated so (0, 0) is its top-left and
  //                    the drawing area is w x h (label strip excluded). cellInfo = {col, row, x, y, cw, ch}
  //   opts             cols (default: best fit for the aspect), title, pad (10), labelH (18), bg ('night' | 'paper' | any fill), cellBg (fill
  //                    or false), aspect (cell w/h hint when auto-fitting, default 1), gap (8), titleH (0 or 26 with a title)
  // Returns {cols, rows, cw, ch, rects} for tests.
  function sheetGrid(canvas, params, cells, drawCell, opts) {
    opts = opts || {};
    const ctx = canvas.getContext('2d');
    const W = num(params && params.w, 1600), H = num(params && params.h, 900);
    const pad = num(opts.pad, 10), gap = num(opts.gap, 8), labelH = num(opts.labelH, 18), titleH = opts.title ? num(opts.titleH, 26) : 0;
    const n = Math.max(1, cells.length);
    const availW = W - pad * 2, availH = H - pad * 2 - titleH;
    let cols = opts.cols;
    if (!cols) {
      let best = 0;
      const aspect = opts.aspect || 1;
      for (let c = 1; c <= n; c++) {
        const r = Math.ceil(n / c), cw = (availW - gap * (c - 1)) / c, ch = (availH - gap * (r - 1)) / r - labelH;
        const s = Math.min(cw, ch * aspect);
        if (s > best) { best = s; cols = c; }
      }
    }
    cols = Math.max(1, Math.min(n, cols | 0));
    const rows = Math.ceil(n / cols);
    const cw = (availW - gap * (cols - 1)) / cols, chFull = (availH - gap * (rows - 1)) / rows, ch = Math.max(4, chFull - labelH);
    ctx.save();
    ctx.fillStyle = opts.bg === 'paper' ? pal.paper : (opts.bg && opts.bg !== 'night' ? opts.bg : pal.night);
    ctx.fillRect(0, 0, W, H);
    if (opts.title) { ctx.font = '700 15px ' + font.ui; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = opts.bg === 'paper' ? pal.ink : pal.paper; ctx.fillText(String(opts.title), pad, pad + titleH / 2); }
    const rects = [];
    for (let i = 0; i < cells.length; i++) {
      const col = i % cols, row = Math.floor(i / cols);
      const x = pad + col * (cw + gap), y = pad + titleH + row * (chFull + gap);
      const cell = cells[i], label = typeof cell === 'string' ? cell : (cell && cell.label !== undefined ? cell.label : '');
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, cw, ch); ctx.clip();
      if (opts.cellBg !== false) { ctx.fillStyle = opts.cellBg || (opts.bg === 'paper' ? pal.paper2 : pal.indigo); ctx.fillRect(x, y, cw, ch); }
      ctx.translate(x, y);
      try { drawCell(ctx, cell, cw, ch, i, { col, row, x, y, cw, ch }); } catch (e) {
        ctx.fillStyle = '#3a0d1e'; ctx.fillRect(0, 0, cw, ch); ctx.fillStyle = '#ffd0da'; ctx.font = '12px ' + font.ui; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(String(e && e.message).slice(0, 60), 6, 6);
        if (typeof console !== 'undefined' && console.error) console.error('sheetGrid cell ' + i + ': ' + (e && e.stack));
      }
      ctx.restore();
      ctx.font = '600 12px ' + font.ui; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = opts.bg === 'paper' ? pal.ink : '#c9bff0'; ctx.fillText(String(label), x + cw / 2, y + ch + labelH / 2, cw);
      rects.push({ x, y, w: cw, h: ch });
    }
    ctx.restore();
    return { cols, rows, cw, ch, rects };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // the toolkit object
  // ---------------------------------------------------------------------------------------------------------------
  // numeric arguments in [from, to) that are NaN or infinite become 0 before the drawing function sees them
  const sane = (fn, from, to) => function () {
    const n = Math.min(arguments.length, to);
    for (let i = from; i < n; i++) if (typeof arguments[i] === 'number' && !isFinite(arguments[i])) arguments[i] = 0;
    return fn.apply(this, arguments);
  };
  Object.assign(tk, {
    pal, fams, fam, light: LIGHT, font, skies: SKIES,
    shade, tint, deep, mix, rgba,
    seed, rng, vary, pick, noise1, noise2,
    ease, wave, pulse, spring, blend, blendPose, track, poseTrack, motion, lowQ,
    P, circlePts, ellipsePts, arcPts, rrectPts, xf, mirrorPts, lerpPts, bendPts, bbox, dist, flatten, trace: traceShape, shapeBox,
    inkPath, inkStroke: sane(inkStroke, 1, 5), inkCurve: sane(inkCurve, 1, 7), inkBlot: sane(inkBlot, 1, 4), inkBleed, inkText: sane(inkText, 2, 5),
    celFill, celEllipse: sane(celEllipse, 1, 5), celCircle: sane(celCircle, 1, 4), ribbon, hairLock, gloss,
    halftone: sane(halftone, 1, 5), halftoneRamp: sane(halftoneRamp, 1, 5), glow: sane(glow, 1, 4), sparkle: sane(sparkle, 1, 4), note: sane(note, 1, 4), soundRings: sane(soundRings, 1, 4), kirakira: sane(kirakira, 1, 6), speedLines: sane(speedLines, 1, 3),
    eye: sane(eye, 1, 5), eyePresets: EYE_PRESETS, brow: sane(brow, 1, 4), mouth: sane(mouth, 1, 4), blush: sane(blush, 1, 4), nose: sane(nose, 1, 4),
    paperGrain: sane(paperGrain, 1, 5), vignette: sane(vignette, 1, 3), sky: sane(sky, 1, 5), mist: sane(mist, 1, 6), stars: sane(stars, 1, 6), moon: sane(moon, 1, 4),
    petal: sane(petal, 1, 4), bolt: sane(bolt, 1, 5), lin, rad, withAlpha, flipX,
    clamp, lerp, num, smoothstep, mat, chain,
  });

  // ---------------------------------------------------------------------------------------------------------------
  // registry of real (non-placeholder) art, and gallery sheets
  // ---------------------------------------------------------------------------------------------------------------
  const real = new Set();
  A.declare = (kind, ids) => { (Array.isArray(ids) ? ids : [ids]).forEach((id) => real.add(kind + '|' + id)); };
  A.has = (kind, id) => real.has(kind + '|' + id);
  A.sheets = {};
  A.sheet = (name, fn) => {
    if (typeof name !== 'string' || !name) throw new Error('ART.sheet: name must be a non-empty string');
    if (typeof fn !== 'function') throw new Error('ART.sheet(' + name + '): fn must be a function');
    if (Object.prototype.hasOwnProperty.call(A.sheets, name)) throw new Error('ART.sheet: duplicate sheet name "' + name + '"');
    A.sheets[name] = fn;
    return fn;
  };
  A.sprite = sprite;
  A.blit = blit;
  A.placeholder = placeholder;
  A.sheetGrid = sheetGrid;
  A.tk = tk;

  // ---------------------------------------------------------------------------------------------------------------
  // placeholders for every member of DESIGN 5.6: labelled shapes, never throw, safe on the no-op context
  // ---------------------------------------------------------------------------------------------------------------
  const POSE_MS = { attack: 420, cast: 500, hurt: 260, block: 300, buff: 400, die: 700, down: 500, cheer: 800, telegraph: 0, idle: 0, walk: 0 };
  const poseMs = (pose) => (POSE_MS[pose] || 0);
  const heroDef = (id) => (DATA.heroes && DATA.heroes[id]) || null;
  const heroColor = (id) => { const d = heroDef(id); return d ? d.color : '#a9c4ff'; };

  A.hero = {
    poseMs,
    bounds: () => ({ w: 120, h: 250, head: { x: 6, y: -200 }, hand: { x: 40, y: -100 }, feet: { x: 0, y: 0 }, weapon: { x: 70, y: -150 } }),
    draw(ctx, id, o) {
      o = o || {};
      const s = num(o.s, 1), x = num(o.x, 0), y = num(o.y, 0);
      ctx.save();
      ctx.translate(x, y); ctx.scale(o.flip ? -s : s, s);
      if (o.alpha !== undefined) ctx.globalAlpha = ctx.globalAlpha * cA(o.alpha);
      placeholder(ctx, String(id) + (o.pose ? ' ' + o.pose : ''), -50, -250, 100, 250, { color: U.color.mix(heroColor(id), pal.ink, 0.45) });
      ctx.restore();
    },
    portrait(ctx, id, o) { o = o || {}; placeholder(ctx, String(id) + ' ' + (o.expr || 'neutral'), num(o.x, 0), num(o.y, 0), pos(o.w, 150), pos(o.h, 200), { color: U.color.mix(heroColor(id), pal.ink, 0.45) }); },
    medallion(ctx, id, x, y, r) { r = pos(r, 24); placeholder(ctx, String(id), num(x, 0) - r, num(y, 0) - r, r * 2, r * 2, { round: true, color: U.color.mix(heroColor(id), pal.ink, 0.35) }); },
  };

  const enemies = new Map();
  const enemyMeta = (id) => (DATA.enemies && DATA.enemies[id]) || (DATA.rosterById && DATA.rosterById[id]) || null;
  const chapterHue = { 1: '#8f5fe8', 2: '#ff6a4a', 3: '#ff3a6a' };
  function enemyBase(id) {
    const m = enemyMeta(id), size = m && m.size ? m.size : 'm', h = (DATA.LISTS.sizeHeight[size] || 170);
    const w = size === 'xl' ? h * 0.9 : size === 'l' ? h * 0.85 : h * 0.8;
    return { w, h, head: { x: -w * 0.1, y: -h * 0.88 }, body: { x: 0, y: -h * 0.5 }, feet: { x: 0, y: 0 } };
  }
  const tierScale = (id) => { const m = enemyMeta(id); return m && m.tier === 'elite' ? 1.08 : 1; };
  // the gold rune ring of an elite and the slow ring of a boss (drawn below): radius as a share of the bounds width, one place for the drawing and for `right`
  const RING_K = { elite: 0.52, boss: 0.6 };
  const ringReach = (id, w) => { const m = enemyMeta(id); return m && RING_K[m.tier] ? w * RING_K[m.tier] : 0; };
  A.enemy = {
    poseMs,
    // art_enemies_N.js call this once per id: entry = {draw(ctx, o), bounds:{w,h,head,body,feet}}
    register(id, entry) {
      if (!entry || typeof entry.draw !== 'function') throw new Error('ART.enemy.register(' + id + '): entry.draw is required');
      enemies.set(id, entry);
      real.add('enemy|' + id);
    },
    // `right` (only when there is something to report) is how far the visible picture reaches to the RIGHT of the feet centre: the larger of what the entry
    // declares for its art (the idle and the held telegraph pose) and the shell's own ground ring. SCENE slides the enemy line left by the overhang so a
    // lane at the screen edge never crops a tail, a wing or the ring (DESIGN 5.9, SCENE.stats().fit). Every other number is the drawn silhouette too:
    // `h` reaches the top of the idle body (not its thinnest tip), because intent bubbles sit on top.y - 6.
    bounds(id) {
      const e = enemies.get(id), b = e && e.bounds ? e.bounds : enemyBase(id), k = tierScale(id);
      const sc = (p) => ({ x: p.x * k, y: p.y * k });
      const out = { w: b.w * k, h: b.h * k, head: sc(b.head), body: sc(b.body || { x: 0, y: -b.h / 2 }), feet: sc(b.feet || { x: 0, y: 0 }) };
      const ring = ringReach(id, b.w * k), right = Math.max(num(b.right, 0) * k, ring);
      if (right > 0) out.right = right;
      return out;
    },
    draw(ctx, id, o) {
      o = o || {};
      const e = enemies.get(id), m = enemyMeta(id), tier = m ? m.tier : 'normal';
      const b = A.enemy.bounds(id), k = tierScale(id), s = num(o.s, 1) * k, t = num(o.t, 0);
      ctx.save();
      ctx.translate(num(o.x, 0), num(o.y, 0));
      if (o.alpha !== undefined) ctx.globalAlpha = ctx.globalAlpha * cA(o.alpha);
      const sw = b.w * num(o.s, 1);
      // contact shadow
      ctx.save(); ctx.scale(1, 0.16);
      ctx.beginPath(); ctx.arc(0, 0, sw * 0.42, 0, TAU); ctx.fillStyle = rgba(pal.ink, 0.38); ctx.fill();
      ctx.restore();
      // tier aura: elites get a gold rune ring and orbiting sparks, bosses a large coloured glow and a slow rune ring
      if (tier === 'elite' || tier === 'boss') {
        const boss = tier === 'boss', col = boss ? (chapterHue[m && m.chapter] || '#8f5fe8') : '#ffb640', bh = b.h * num(o.s, 1);
        const pl = 0.5 + 0.5 * Math.sin(t * 2.2);
        glow(ctx, 0, -bh * 0.5, bh * (boss ? 0.78 : 0.62), col, (boss ? 0.34 : 0.26) + 0.08 * pl);
        ctx.save(); ctx.scale(1, 0.2);
        ctx.strokeStyle = rgba(boss ? pal.gold2 : pal.gold, 0.85); ctx.lineWidth = boss ? 3 : 2.2;
        ctx.setLineDash([9, 7]); ctx.lineDashOffset = -t * (boss ? 10 : 24) * motion();
        ctx.beginPath(); ctx.arc(0, 0, sw * RING_K[tier], 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        const nSp = boss ? 5 : 3;
        for (let i = 0; i < nSp; i++) {
          const a = t * 0.9 * motion() + i * TAU / nSp;
          sparkle(ctx, Math.cos(a) * sw * 0.5, -bh * (0.42 + 0.3 * Math.sin(a * 0.5 + i)) + Math.sin(a) * bh * 0.05, boss ? 6 : 4.5, { color: pal.gold2, alpha: 0.5 + 0.5 * Math.sin(t * 3 + i), glow: 0.5 });
        }
      }
      if (o.glow) glow(ctx, 0, -b.h * num(o.s, 1) * 0.5, b.h * num(o.s, 1) * 0.7, typeof o.glow === 'string' ? o.glow : '#ffe9a8', typeof o.glow === 'number' ? clamp(o.glow, 0, 1) * 0.6 : 0.4);
      ctx.scale(o.flip ? -s : s, s);
      if (e) e.draw(ctx, { s, pose: o.pose || 'idle', t, pt: num(o.pt, 0), hpPct: o.hpPct === undefined ? 1 : o.hpPct, phase: o.phase | 0, glow: o.glow || 0, flip: !!o.flip });
      else placeholder(ctx, String(id), -b.w / 2 / k, -b.h / k, b.w / k, b.h / k, { color: U.color.mix(m && m.chapter ? chapterHue[m.chapter] : pal.dusk, pal.ink, 0.5) });
      ctx.restore();
    },
  };

  A.card = {
    draw(ctx, cardOrId, w, h) {
      const id = typeof cardOrId === 'string' ? cardOrId : (cardOrId && cardOrId.id) || '?';
      const def = DATA.cards && DATA.cards[id];
      const f = fam(def && def.art && def.art.c);
      w = pos(w, 170); h = pos(h, 116);
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, f.light); g.addColorStop(1, f.dark);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      placeholder(ctx, id, w * 0.2, h * 0.2, w * 0.6, h * 0.6, { color: f.base, alpha: 0.85 });
    },
    motif(ctx, motifId, x, y, size, palette) {
      size = pos(size, 40);
      const f = fam(typeof palette === 'string' ? palette : (palette && palette.name) || 'ash');
      placeholder(ctx, String(motifId), num(x, 0) - size / 2, num(y, 0) - size / 2, size, size, { round: true, color: f.dark });
    },
  };
  A.icon = {
    draw(ctx, kind, id, x, y, size, opts) {
      size = pos(size, 24);
      placeholder(ctx, String(id), num(x, 0) - size / 2, num(y, 0) - size / 2, size, size, { round: true, alpha: opts && opts.dim ? 0.5 : 1 });
    },
  };
  A.scene = {
    draw(ctx, sceneId, w, h, t) {
      w = pos(w, 1280); h = pos(h, 720);
      sky(ctx, 0, 0, w, h, /boss|defeat/.test(String(sceneId)) ? 'storm' : /ch2|shop|camp|event|title|treasure/.test(String(sceneId)) ? 'night' : /victory/.test(String(sceneId)) ? 'dawn' : /paper/.test(String(sceneId)) ? 'paper' : 'golden');
      ctx.fillStyle = rgba(pal.ink, 0.55); ctx.fillRect(0, h * 0.72, w, h * 0.28);
      ctx.font = '700 22px ' + font.ui; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = pal.white;
      ctx.fillText('scene ' + sceneId, w / 2, h / 2);
    },
    logo(ctx, x, y, w) { w = pos(w, 400); inkText(ctx, 'HOCUS VOCUS', num(x, 0), num(y, 0), w / 6.3, { family: font.display, fill: pal.paper, weight: 900, skew: -0.08 }); },
  };
  A.map = {
    hex(ctx, kind, x, y, size, opts) {
      size = pos(size, 46);
      const wash = { fog: '#e6d3a3', known: '#cbb98f', ground: '#f3e6c8', block: '#3a2f52', painted: '#f8e9c0', edge: '#cbb98f', path: '#ffd889', hover: '#ffe9a8', target: '#ff9ac8' }[kind] || '#e6d3a3';
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = PI / 6 + i * PI / 3; const px = num(x, 0) + Math.cos(a) * size, py = num(y, 0) + Math.sin(a) * size; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
      ctx.closePath(); ctx.fillStyle = wash; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = pal.ink; ctx.stroke();
      if (opts && opts.tile && opts.tile !== 'empty') { ctx.font = '700 ' + Math.max(8, size * 0.28) + 'px ' + font.ui; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = pal.ink; ctx.fillText(String(opts.tile).slice(0, 5), x, y); }
    },
    paintBloom(ctx, x, y, size, p) { p = clamp(num(p, 1), 0, 1); glow(ctx, x, y, Math.max(1, size * (0.3 + p * 1.1)), pal.sakura, 0.5 * (1 - p * 0.5), false); },
    token(ctx, heroIds, x, y) {
      const ids = Array.isArray(heroIds) ? heroIds : [heroIds];
      ids.forEach((id, i) => { ctx.beginPath(); ctx.arc(num(x, 0) + (i - (ids.length - 1) / 2) * 16, num(y, 0), 12, 0, TAU); ctx.fillStyle = heroColor(id); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = pal.ink; ctx.stroke(); });
    },
  };
  // effects: one signature, t is PROGRESS 0..1. The placeholder is a fading expanding ring.
  A.fx = { names: (DATA.LISTS && DATA.LISTS.fx ? DATA.LISTS.fx : []).slice(), ms: { slash: 260, cross: 340, thrust: 240, burst: 300, ring: 420, inkSplash: 700, petals: 1100, lightning: 380, chain: 420, flame: 700, frost: 600, poison: 800, shield: 500, heal: 800, buff: 700, debuff: 700, sparkle: 600, speedLines: 280, impactFrame: 140, sfxText: 520, vignette: 400, chromatic: 220, brushDrag: 450, numberPop: 900 } };
  A.fx.names.forEach((name) => {
    A.fx[name] = (ctx, o, t) => {
      o = o || {};
      const p = clamp(num(t, 0), 0, 1), r = (10 + p * 50) * num(o.s, 1);
      ctx.save();
      ctx.globalAlpha = ctx.globalAlpha * (1 - p);
      ctx.strokeStyle = o.color || pal.gold; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(num(o.x, 640), num(o.y, 360), r, 0, TAU); ctx.stroke();
      ctx.restore();
    };
  });


  // ---------------------------------------------------------------------------------------------------------------
  // gallery sheet: the toolkit demo (ART.sheets.toolkit), the visual regression target for art.js
  // ---------------------------------------------------------------------------------------------------------------
  A.sheet('toolkit', (canvas, params) => {
    const t = num(params.t, 0);
    // The candy helper demo: chunky warm-brown outlines of even weight, flat candy colour with one hard shadow, sticker bands, bunting,
    // marquee bulbs and sparkles. Nothing here uses the tapered ink line, the screen tone or the paper grain: those helpers still exist
    // for old art, but the Hocus Vocus look does not ask for them.
    const LN = pal.hvLine, CREAM = pal.hvCream;
    const CANDY = [pal.hvPink, pal.hvLime, pal.hvViolet, pal.hvOrange, pal.hvTeal, pal.hvGreen];
    // a chunky candy shape: even brown outline, one hard shadow, a thin lit edge
    const chunk = (g, shape, col, o) => celFill(g, shape, col, Object.assign({ line: 3.2, lineColor: LN, weightVar: 0, wobble: 0, hi: true, hiW: 2.4, tension: 0.7 }, o || {}));
    const starPts = (cx, cy, ro, ri, n, rot) => { const p = []; for (let i = 0; i < n * 2; i++) { const a = (rot || -PI / 2) + i * PI / n, r = i % 2 ? ri : ro; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return p; };
    const heartPts = (cx, cy, s) => { const p = []; for (let i = 0; i < 20; i++) { const a = i / 20 * TAU; p.push([cx + s * 16 * Math.pow(Math.sin(a), 3), cy - s * (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) + s * 3]); } return p; };
    // a sticker: a cream border under a brown-lined candy shape
    const sticker = (g, shape, col, o) => {
      g.save(); g.beginPath(); traceShape(g, shape, 0, 0, 0.7); g.lineJoin = 'round'; g.lineWidth = 11; g.strokeStyle = CREAM; g.stroke(); g.fillStyle = CREAM; g.fill(); g.restore();
      chunk(g, shape, col, o);
    };
    const label = (g, txt, x, y, size, o) => inkText(g, txt, x, y, size, Object.assign({ skew: 0, family: font.display, stroke: LN, fill: CREAM, weight: 800, strokeW: size * 0.22 }, o || {}));
    const cells = [
      { label: 'chunky outlines: celFill with an even brown line', fn(g, w, h) {
        g.fillStyle = CREAM; g.fillRect(0, 0, w, h);
        const u = Math.min(w, h);
        chunk(g, { poly: starPts(w * 0.27, h * 0.32, u * 0.2, u * 0.1, 5) }, pal.hvOrange, { line: 3.6, tension: 1 });
        chunk(g, heartPts(w * 0.72, h * 0.31, u * 0.0105), pal.hvPink, { line: 3.6 });
        celCircle(g, w * 0.27, h * 0.74, u * 0.15, pal.hvLime, { line: 3.6, lineColor: LN, weightVar: 0, wobble: 0, hi: true, hiW: 2.6 });
        chunk(g, rrectPts(w * 0.5, h * 0.58, w * 0.4, h * 0.3, u * 0.07), pal.hvViolet, { line: 3.6, tension: 0.4 });
        sparkle(g, w * 0.86, h * 0.14, 9, { color: pal.hvOrange, glow: 0 }); sparkle(g, w * 0.08, h * 0.56, 7, { color: pal.hvPink, glow: 0 });
      } },
      { label: 'sticker bands: cream border, notched tail', fn(g, w, h) {
        g.fillStyle = '#ffc9de'; g.fillRect(0, 0, w, h);
        const band = (y, rot, col, txt, notch) => {
          g.save(); g.translate(w / 2, y); g.rotate(rot);
          const bw = w * 0.74, bh = h * 0.2, x0 = -bw / 2, y0 = -bh / 2;
          const pts = notch ? [[x0, y0], [x0 + bw, y0], [x0 + bw - bh * 0.42, 0, 1], [x0 + bw, y0 + bh], [x0, y0 + bh]] : rrectPts(x0, y0, bw, bh, bh * 0.45);
          sticker(g, notch ? { poly: pts } : pts, col, { tension: notch ? 1 : 0.4 });
          label(g, txt, notch ? -bh * 0.12 : 0, 1, bh * 0.52);
          g.restore();
        };
        band(h * 0.24, -0.1, pal.hvViolet, 'SPARKLE', true);
        band(h * 0.52, 0.07, pal.hvGreen, 'BIG LA!', false);
        band(h * 0.8, -0.05, pal.hvOrange, 'ENCORE', true);
      } },
      { label: 'bunting: flags on a swag, sway (t)', fn(g, w, h) {
        sky(g, 0, 0, w, h, 'dawn');
        [[0.2, 0], [0.62, 1.7]].forEach(([y0, ph], row) => {
          const ax = 8, bx = w - 8, ay = h * y0, sag = h * 0.16, cur = (u) => [ax + (bx - ax) * u, ay + 4 * sag * u * (1 - u)];
          const spine = []; for (let i = 0; i <= 16; i++) spine.push(cur(i / 16));
          g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = LN; g.lineWidth = 3; g.beginPath(); spine.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke(); g.restore();
          for (let i = 0; i < 7; i++) {
            const u = (i + 0.7) / 7.4, p = cur(u), sw = 0.12 * Math.sin(t * 1.7 + i * 0.9 + ph) * motion();
            g.save(); g.translate(p[0], p[1]); g.rotate(sw);
            chunk(g, { poly: [[-14, 0], [14, 0], [0, 38]] }, CANDY[(i + row * 2) % CANDY.length], { line: 3, tension: 1 });
            g.restore();
          }
        });
      } },
      { label: 'marquee bulbs: a chase of lit and dim (t)', fn(g, w, h) {
        sky(g, 0, 0, w, h, 'night');
        const fx = w * 0.12, fy = h * 0.2, fw = w * 0.76, fh = h * 0.6;
        chunk(g, rrectPts(fx, fy, fw, fh, 16), pal.hvViolet, { line: 3.6, tension: 0.4 });
        const per = 2 * (fw + fh), n = 20, step = Math.floor(t * 5);
        for (let i = 0; i < n; i++) {
          let d = (i / n) * per, x, y;
          if (d < fw) { x = fx + d; y = fy; } else if ((d -= fw) < fh) { x = fx + fw; y = fy + d; } else if ((d -= fh) < fw) { x = fx + fw - d; y = fy + fh; } else { d -= fw; x = fx; y = fy + fh - d; }
          const on = (i + step) % 3 === 0;
          if (on) glow(g, x, y, 17, '#ffd84a', 0.95);
          celCircle(g, x, y, 5.4, on ? '#fff2a0' : '#b98a3a', { line: 2, lineColor: LN, weightVar: 0, wobble: 0, shadow: on ? false : undefined, hi: on });
        }
        label(g, 'SING!', w / 2, h / 2, Math.min(w * 0.22, 46), { fill: '#fff2a0', rot: -0.05 });
      } },
      { label: 'sticker faces: dot eyes, catchlights, blush', fn(g, w, h) {
        g.fillStyle = '#d9fff4'; g.fillRect(0, 0, w, h);
        const faces = [['smile', pal.hvPink], ['open', pal.hvLime], ['wink', pal.hvOrange], ['grin', pal.hvViolet]];
        faces.forEach(([kind, col], i) => {
          const cx = w * (0.27 + 0.46 * (i % 2)), cy = h * (0.28 + 0.46 * Math.floor(i / 2)), r = Math.min(w, h) * 0.2;
          sticker(g, ellipsePts(cx, cy, r, r, 18, 0), col, { line: 3.2 });
          g.save(); g.fillStyle = LN; g.strokeStyle = LN; g.lineCap = 'round'; g.lineWidth = 3;
          [-1, 1].forEach((s) => {
            const ex = cx + s * r * 0.36, ey = cy - r * 0.1;
            if (kind === 'wink' && s === 1) { g.beginPath(); g.arc(ex, ey + 2, r * 0.14, PI * 1.1, PI * 1.9); g.stroke(); return; }
            g.beginPath(); g.ellipse(ex, ey, r * 0.11, r * 0.15, 0, 0, TAU); g.fill();
            g.fillStyle = CREAM; g.beginPath(); g.arc(ex - r * 0.035, ey - r * 0.06, r * 0.045, 0, TAU); g.fill(); g.fillStyle = LN;
          });
          g.fillStyle = 'rgba(255,90,130,0.55)'; [-1, 1].forEach((s) => { g.beginPath(); g.ellipse(cx + s * r * 0.64, cy + r * 0.26, r * 0.16, r * 0.1, 0, 0, TAU); g.fill(); });
          g.beginPath();
          if (kind === 'open' || kind === 'grin') { g.ellipse(cx, cy + r * 0.34, r * 0.2, r * (kind === 'open' ? 0.2 : 0.13), 0, 0, TAU); g.fillStyle = '#9c2f45'; g.fill(); g.stroke(); } else { g.arc(cx, cy + r * 0.14, r * 0.26, PI * 0.15, PI * 0.85); g.stroke(); }
          g.restore();
        });
      } },
      { label: 'ribbon streamers: round caps, no gloss, sway (t)', fn(g, w, h) {
        sky(g, 0, 0, w, h, 'dawn');
        const cols = [pal.hvPink, pal.hvLime, pal.hvTeal, pal.hvViolet, pal.hvOrange];
        for (let i = 0; i < 5; i++) {
          const x = 40 + i * (w - 96) / 4, len = h * 0.6;
          ribbon(g, [[x, 22], [x + 10, 22 + len * 0.35], [x - 8, 22 + len * 0.7], [x + 6, 22 + len]], cols[i], { wMax: 22, w0: 20, w1: 14, cap: 'round', gloss: false, strands: 0, sway: { amp: 0.18, freq: 0.6, phase: i * 1.3 }, t, line: 3, lineColor: LN, shadowW: 0.28, rim: false });
        }
        ribbon(g, [[16, h - 26], [w * 0.4, h - 56], [w * 0.7, h - 16], [w - 16, h - 42]], pal.hvPink, { wMax: 16, w0: 14, w1: 12, cap: 'round', gloss: false, strands: 0, bend: Math.sin(t) * 0.12, line: 3, lineColor: LN, shadowW: 0.28 });
      } },
      { label: 'sparkles: stars, kirakira flecks, glows', fn(g, w, h) {
        sky(g, 0, 0, w, h, 'night');
        kirakira(g, 0, 0, w, h, t, { n: 26, seed: 4 });
        sparkle(g, w * 0.2, h * 0.5, 22, { color: pal.white });
        sparkle(g, w * 0.4, h * 0.34, 12, { color: pal.gold2, rot: 0.5 });
        glow(g, w * 0.62, h * 0.5, 36, pal.hvLime, 0.9);
        glow(g, w * 0.82, h * 0.5, 30, pal.hvPink, 0.9);
        sparkle(g, w * 0.62, h * 0.5, 12, { color: '#ffffff', glow: 0 });
        sparkle(g, w * 0.82, h * 0.5, 12, { color: '#ffffff', glow: 0 });
      } },
      { label: 'pop burst: wedge rays behind a sticker star (t)', fn(g, w, h) {
        const cx = w / 2, cy = h / 2, n = 18, r = Math.hypot(w, h), rot = t * 0.12 * motion();
        for (let i = 0; i < n; i++) {
          g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(rot + i * TAU / n) * r, cy + Math.sin(rot + i * TAU / n) * r); g.lineTo(cx + Math.cos(rot + (i + 1) * TAU / n) * r, cy + Math.sin(rot + (i + 1) * TAU / n) * r); g.closePath();
          g.fillStyle = i % 2 ? '#ffe0ef' : '#ffc2dc'; g.fill();
        }
        sticker(g, { poly: starPts(cx, cy, Math.min(w, h) * 0.36, Math.min(w, h) * 0.22, 9, -PI / 2 + t * 0.1) }, pal.hvLime, { line: 3.4, tension: 1 });
        label(g, 'POP', cx, cy + 1, Math.min(w, h) * 0.17, { fill: pal.hvPinkD, stroke: CREAM, strokeW: Math.min(w, h) * 0.05 });
        sparkle(g, w * 0.14, h * 0.2, 10, { color: pal.hvOrange, glow: 0 }); sparkle(g, w * 0.88, h * 0.82, 9, { color: pal.hvViolet, glow: 0 });
      } },
      { label: 'sky presets (candy names) and haze', fn(g, w, h) {
        const names = Object.keys(SKIES), sh = h / names.length;
        const candy = { dusk: 'Sherbet', golden: 'Honey Pop', night: 'Midnight Fizz', dawn: 'Cotton Candy', storm: 'Grape Soda', crimson: 'Cherry Fizz', paper: 'Vanilla', moon: 'Blueberry' };
        names.forEach((n, i) => {
          sky(g, 0, i * sh, w, sh, n);
          g.font = '700 12px ' + font.display; g.textAlign = 'left'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.lineWidth = 3.4; g.strokeStyle = LN; g.fillStyle = CREAM;
          g.strokeText(candy[n] || n, 8, i * sh + sh / 2); g.fillText(candy[n] || n, 8, i * sh + sh / 2);
        });
        mist(g, 0, 0, w, h, t, { seed: 2, alpha: 0.14, color: '#ffffff' });
      } },
      { label: 'lettering: heavy sticker type with a block shadow', fn(g, w, h) {
        g.fillStyle = '#fff4e6'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 9; i++) sparkle(g, w * (0.08 + 0.84 * vary(5, 'lx' + i)), h * (0.1 + 0.8 * vary(5, 'ly' + i)), 5 + 5 * vary(5, 'ls' + i), { color: CANDY[i % CANDY.length], glow: 0, rot: i });
        inkText(g, 'LA LA', w * 0.5, h * 0.36, Math.min(w * 0.27, 56), { skew: 0, family: font.display, stroke: LN, grad: ['#ffd0e6', '#ff6fb0'], shadow: pal.hvTeal, rot: -0.06 });
        inkText(g, 'POP!', w * 0.5, h * 0.72, Math.min(w * 0.3, 62), { skew: 0, family: font.display, stroke: LN, grad: ['#e6ff9a', '#7ed321'], shadow: pal.hvViolet, rot: 0.05 });
      } },
      { label: 'ease curves with a bead riding each (t)', fn(g, w, h) {
        g.fillStyle = '#3b2a7a'; g.fillRect(0, 0, w, h);
        const list = [['outBack', pal.hvPink], ['outElastic', pal.cyan], ['snap', pal.gold], ['inOutSine', pal.hvLime]];
        const px = (u) => 16 + u * (w - 32), py = (v) => h - 24 - v * (h - 96);
        g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
        list.forEach(([n, c]) => {
          g.strokeStyle = c; g.lineWidth = 4; g.beginPath();
          for (let i = 0; i <= 40; i++) { const u = i / 40; (i ? g.lineTo : g.moveTo).call(g, px(u), py(ease[n](u))); }
          g.stroke();
        });
        g.restore();
        const k = (t * 0.35) % 1;
        list.forEach(([n, c]) => celCircle(g, px(k), py(ease[n](k)), 6, c, { line: 2.4, lineColor: LN, weightVar: 0, wobble: 0, shadow: false }));
        g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 2; g.lineCap = 'round'; g.beginPath();
        for (let i = 0; i <= 40; i++) { const u = i / 40, sv = spring(u * 1.2, 14, 6); (i ? g.lineTo : g.moveTo).call(g, px(u), py(sv)); }
        g.stroke();
      } },
      { label: 'ART.tk.chain: one baked drawing bent at its joints (t)', fn(g, w, h) {
        sky(g, 0, 0, w, h, 'night');
        for (let i = 0; i < 3; i++) {
          const ch = ART.tk.chain('sheet|chain' + i, { spine: [[0, 0], [8, 40], [-6, 80], [4, 120]], cuts: [0.34, 0.68], reach: 30, draw: (gg) => { ribbon(gg, [[0, 0], [8, 40], [-6, 80], [4, 120]], [pal.hvPink, pal.hvLime, pal.hvOrange][i], { wMax: 24, w0: 20, w1: 14, cap: 'round', gloss: false, strands: 0, line: 3, lineColor: LN, shadowW: 0.28, sway: null, rim: false }); } });
          g.save(); g.translate(w * (0.2 + 0.3 * i), 20 + (h - 160) * 0.3); ch.draw(g, [0.12 * Math.sin(t * 1.4 + i), 0.3 * Math.sin(t * 1.4 + i - 0.8), 0.4 * Math.sin(t * 1.4 + i - 1.6)], 1); g.restore();
        }
        label(g, 'one sprite per slab', w / 2, h - 18, 14, { weight: 700 });
      } },
      { label: 'confetti, zap bolts, sparkle stars (t)', fn(g, w, h) {
        sky(g, 0, 0, w, h, 'night');
        for (let i = 0; i < 28; i++) {
          const x = w * vary(7, 'cx' + i), y = ((h * vary(7, 'cy' + i) + t * 14 * (0.5 + vary(7, 'cv' + i))) % (h + 20)) - 10, a = t * (1 + 2 * vary(7, 'cr' + i)) + i;
          g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = CANDY[i % CANDY.length];
          if (i % 3 === 0) { g.beginPath(); g.arc(0, 0, 3.4, 0, TAU); g.fill(); } else g.fillRect(-6, -2.6, 12, 5.2);
          g.restore();
        }
        bolt(g, w * 0.15, h * 0.45, w * 0.5, h * 0.62, { seed: Math.floor(t * 8), jag: 14, w: 5, color: '#e6ff9a', core: '#ffffff' }); bolt(g, w * 0.5, h * 0.62, w * 0.86, h * 0.44, { seed: Math.floor(t * 8) + 5, jag: 14, w: 5, color: '#ff9ac8' });
        sparkle(g, w * 0.3, h * 0.2, 14, { color: pal.gold2, rot: t }); sparkle(g, w * 0.72, h * 0.8, 11, { color: pal.hvPinkL, rot: -t });
      } },
      { label: 'notes and sound rings', fn(g, w, h) {
        sky(g, 0, 0, w, h, 'night');
        ['eighth', 'quarter', 'beamed', 'rest'].forEach((k, i) => note(g, w * (0.14 + i * 0.24), h * 0.36, 22, { kind: k, color: CANDY[i], rot: i === 1 ? 0.1 : 0 }));
        soundRings(g, w * 0.28, h * 0.72, 16, { n: 3, color: pal.hvLime, alpha: 0.95, lw: 3.4 });
        soundRings(g, w * 0.7, h * 0.72, 16, { n: 3, color: pal.hvPink, broken: true, rot: 0, lw: 3.4 });
      } },
      { label: 'candy palette and hue families', fn(g, w, h) {
        g.fillStyle = '#2a1c55'; g.fillRect(0, 0, w, h);
        const keys = ['hvPink', 'hvPinkD', 'hvPinkL', 'hvGreen', 'hvGreenD', 'hvLime', 'hvViolet', 'hvOrange', 'hvTeal', 'hvCream', 'hvLine', 'gloss', 'glossLilac', 'glossMint', 'glossBlush', 'vox'];
        const sw = (w - 12) / 8;
        keys.forEach((k, i) => { chunk(g, rrectPts(6 + (i % 8) * sw + 1, 8 + Math.floor(i / 8) * 26, sw - 3, 21, 6), pal[k], { line: 2, shadow: false, hi: false, tension: 0.4 }); });
        const names = Object.keys(fams), rh = (h - 74) / 6;
        names.forEach((k, i) => {
          const f = fams[k], col = Math.floor(i / 6), y = 64 + (i % 6) * rh, x0 = 8 + col * (w / 2);
          ['dark', 'base', 'light', 'glow'].forEach((n, j) => { g.fillStyle = f[n]; g.fillRect(x0 + j * 18, y, 16, rh - 3); });
          g.font = '600 10px ' + font.ui; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = CREAM; g.fillText(k, x0 + 78, y + rh / 2 - 1);
        });
      } },
    ];
    sheetGrid(canvas, params, cells, (g, cell, w, h) => cell.fn(g, w, h), { cols: 5, bg: '#2a1c55', cellBg: false, title: 'Candy helpers: ART.tk (t = ' + t.toFixed(2) + 's)' });
  });

  return A;
})();

window.RJ = window.RJ || {chars:{}, ids:[]};
// kit.js: the shared chibi kit for the RoxorLoops and Jasmin cast. Loaded after util.js, data.js, art.js (it builds on ART.tk) and before
// the character files (roxor.js, jasmin.js, crew.js). Classic script, one global scope: it extends the global RJ made by index.html.
//
// ======================================================================================================================================
// QUICK START FOR A NEW CHARACTER (read roxor.js and jasmin.js, they are the worked examples)
// ======================================================================================================================================
//   RJ.register(id, RJ.rig({ id, accent, skel, base, poses, face, arm, legs, mic, layers, bust, bounds }))
//   RJ.rig builds {draw, bust, bounds, points} for you: whole-body transform, ground shadow, pose maths with idle life, arms with two-bone IK,
//   the mic, legs and shoes, blinking, effects and the bust crop. You only draw what is unique: hair, head, torso/outfit, in LAYERS.
//
//   FIGURE SPACE (s = 1): feet centre at (0, 0), y negative is up, +x is the way the character faces (slight 3/4 view to the viewer's right;
//   o.flip mirrors the whole figure about x = 0). Whole figure about 262 px tall to the top of the skull (hair, a mohawk or a ponytail may
//   rise past that: spec.bounds is the box of the whole silhouette INCLUDING hair and the widest pose reach, not the effects, and it may be lopsided
//   with x0 and x1), head about 118 px tall.
//   STAGING A DUO: put Roxor on the party's left facing right (the default) and Jasmin on the right with o.flip = true, as on the owners' duo card. Jasmin's own
//   card faces left, so her asymmetric features (clip, ear, tail side) are right when she is flipped. The key light stays on the upper right of the screen for a
//   flipped figure too (RJ.frame sets RJ._flip, RJ.cel, RJ.lock, RJ.blob and the legs read RJ.lightAngle(), and a hand-written shadow offset in a character
//   file goes through RJ.lx(dx)). Only fixed highlight polygons (hair gloss bands) simply mirror with the figure.
//   A taller character overrides spec.skel (RoxorLoops raises neck, head, shoulders and leg tops by 12). Rest skeleton RJ.SKEL (override with spec.skel): waist/torso
//   pivot (0,-78), neck pivot (0,-146), head centre (2,-204), shoulders (+-26,-131), leg tops (+-15,-72), arm bones 23 + 21, ankles at y = -12 (sneaker sole at y = 0).
//   Layers (spec.layers, every one optional, each is fn(g, S)): in draw order
//     backHair  head space   drawn FIRST, behind the back arm and the torso (ponytails, long hair hanging behind)
//     torso     rest space   (the torso rotates about the hip with the pose; neck, clothes, belt: draw in the rest skeleton coordinates)
//     mid       head space   after the torso, before the head (a mullet tail that lies on the shoulders, a hood back)
//     head      head space   skull, face (call RJ.drawFace(g, S)), hair, hat. Origin = HEAD CENTRE, y up is negative, face turned +x
//     over      rest space   after the FRONT arm, in the torso's space (a dress strap or jacket shoulder that must cover the arm's shoulder joint:
//                            re-draw that piece clipped to a small region)
//     top       head space   after the front arm (rarely needed: a hand-held thing in front of the face)
//   S (given to every layer): S.g, S.t, S.P (the resolved pose numbers), S.spec, S.C (RJ.C), S.A (your accent colours), S.face (eyes, mouth,
//   brow, blush, look, open (blink 0..1)), S.sway (a -1..1 slow wave for hair and cloth), S.beat (0..1 pulse on beat poses), S.pt (live
//   positions in figure space: mouth, micHead, hand, head, shF, shB), S.k (always 1; the bust scales the whole ctx instead).
//   The face: spec.face = {eyes:[near, far] each {x,y,w,h}, brows, nose, mouth:[x,y,w], blush, eye:{...}, ...} (see RJ.drawFace) in head space.
//   Poses: spec.poses = {idle, sing, attack, hurt, cheer, bust?: tables of the numbers in RJ.BASE_POSE (only the ones that differ)}. A 'bust' table is the
//   portrait pose (spec.bust.pose names it): keep hands low so no stray hand or mic ball shows at the crop's edge.
//   Portrait: spec.bust = {rect: [x0, y0, x1, y1] the preferred head-and-shoulders crop (covers the box), face: [x0, y0, x1, y1] the rectangle that must stay fully
//   visible, pose}. For a box that is short or wide the zoom is reduced until the face fits and the crop is centred on it instead of cutting through it.
//   Anything the pose table does not set comes from spec.base, then RJ.BASE_POSE. Idle life (breathing, sway, blink) is added by RJ.resolve.
//
// ======================================================================================================================================
// THE HELPER API (everything hangs off RJ; all drawing helpers take the canvas context first and never throw for odd numbers)
// ======================================================================================================================================
//   Registry      RJ.register(id, impl) -> impl   RJ.draw(ctx, id, o)   RJ.bust(ctx, id, w, h, o)   RJ.point(id, name, o) -> {x,y} | null
//                 (names: head mouth hand mic feet chest)   RJ.bake(id, o) -> {canvas, draw(ctx, x, y, s)} offscreen copy for static uses
//                 RJ.norm(o) sanitises {x,y,s,pose,t,flip,expr} (s 0 stays a tiny 0.001 so a scale-in tween starts invisible; negative or NaN s is 1)   RJ.frame(ctx, o, fn) save/translate/scale/flip then fn(ctx)   RJ.POSES
//   Palette       RJ.C (ink, skin, skinSh, skinHi, blush, white, teeth, mouthIn, tongue, mic...)   RJ.ACCENT[id] = {main, dark, light, glow}
//                 RJ.accent(id)   RJ.LINE {main, mid, fine} outline widths   RJ.shade(hex, dl?) the warm cel shadow   RJ.tint(hex, k?)
//   Cel/ink       RJ.cel(g, pts, base, opts) celFill with the house defaults (dark brown line, warm shadow)   RJ.ink(g, pts, opts) inkPath with
//                 house defaults   RJ.fillPts(g, pts, col, alpha)   RJ.blob(g, items, {fill, shade, rot}) union of capsules/ellipses with ONE
//                 outline (hands and small round things)   RJ.lock(g, spine, base, opts) tk.ribbon with hair defaults (warm shadow, soft gloss)
//                 TIP for hair: a hand-shaped closed polygon with sharp corners ([x, y, 1]) plus ink lines inside (see roxor.js HAIR_OUTLINE and
//                 jasmin.js TAIL_OUTLINE) gives crisper cartoon silhouettes than ribbons; ribbons are good for thin, flowing, tapering locks.
//   Face          RJ.drawFace(g, S) whole face from spec.face   RJ.eyeCel(g, e, side, st, E, preset) the flat cartoon eye   RJ.eye(...) picks it
//                 (arcs for closed/happy/hurt come from ART.tk.eye)   RJ.brow(g, x, y, w, o)   RJ.mouth(g, x, y, w, kind, o) kinds: smile smirk
//                 smirkTeeth sing grin happyOpen beat ow flat frown tiny   RJ.EXPR (named expressions)   RJ.blinkOpen(t, seed) -> 0..1
//                 RJ.SKULL / RJ.skullPts({w, h, chin}) / RJ.skinHead(g, o) / RJ.ear(g, x, y, o) / RJ.neck(g, x, y, o) / RJ.fxSweat
//   Body          RJ.hand(g, kind, x, y, ang, o) kinds: fist point open relaxed   RJ.fistOnMic(g, x, y, axis, o)   RJ.mic(g, x, y, ang, o)
//                 RJ.drawArm(g, A) two-bone IK sausage arm (capsules in ONE outline, round elbow at any bend; a free hand of the arm's own colour is folded into
//                 the same outline) + sleeve + cuff + hand   RJ.handParts(kind, o) the hand as blob items   RJ.hurtEye / RJ.noseTick   RJ.drawLeg(g, L) leg + sock + shoe   RJ.shoe(g, x, y, ang, o)
//                 RJ.ik2(...) two-bone IK   RJ.sleeve(...) a short sleeve polygon
//   Effects       RJ.fx.sweat RJ.fx.notes RJ.fx.arcs RJ.fx.burst RJ.fx.sparkles RJ.fx.hearts RJ.fx.stars  and RJ.fxDraw(g, S, name) which maps the
//                 names a pose lists in P.fx: notes arcs burst sparkles sparkleMic hearts stars sweat
//   Pose system   RJ.BASE_POSE (every key a pose table may set)   RJ.LIFE (idle motion per pose)   RJ.resolve(spec, pose, t, expr) -> P
//                 RJ.layout(spec, P) -> matrices and live points   RJ.rig(spec) -> impl
//   House style: dark warm brown line (RJ.C.ink) of even width with a slight taper, flat cel colours with ONE hard shadow, a thin highlight,
//   large flat-cel eyes with catchlights, small blush marks. Everything is a pure function of its arguments (t seconds drives every loop, no
//   clock, no random). Cost: about 1 ms of script per figure, the rest is canvas raster (about 5 ms in a software-rendered headless browser, far
//   less on a GPU canvas); bake with RJ.bake when a figure is drawn many times without animating.
// ======================================================================================================================================
(function () {
  'use strict';
  const tk = ART.tk, mat = tk.mat;
  const RJ = (window.RJ = window.RJ || { chars: {}, ids: [] });
  const TAU = Math.PI * 2, PI = Math.PI;
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : (d === undefined ? 0 : d));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const fr = (v) => v - Math.floor(v);
  const has = (obj, k) => !!obj && typeof k === 'string' && Object.prototype.hasOwnProperty.call(obj, k);   // 'constructor' and '__proto__' are not poses or ids

  // ----------------------------------------------------------------------------------------------------------------------------------
  // palette and line weights
  // ----------------------------------------------------------------------------------------------------------------------------------
  const C = (RJ.C = {
    ink: '#2d170f',            // outline: warm near-black brown (the owners' cards use a brown line, never pure black)
    inkSoft: '#6b3a28',        // interior detail lines (eyelid creases, finger gaps)
    skin: '#fdd3b6', skinSh: '#f8b48e', skinHi: '#ffe9da', skinDeep: '#e59c7c',
    blush: '#ff8d98',
    white: '#fffaf1', teeth: '#fffdf6',
    mouthIn: '#9c2f45', tongue: '#ff8fa3',
    mic: '#1d1c22', micSh: '#0c0b0f', micHi: '#615f6d', micGrill: '#3a3942',
    gold: '#ffc94d', orange: '#ffb347',
  });
  RJ.ACCENT = {
    roxor: { main: '#78bd35', dark: '#3f7f18', light: '#d3edb0', glow: '#a9f060' },
    jasmin: { main: '#ff7fb2', dark: '#c93f78', light: '#ffc9de', glow: '#ffa6cc' },
  };
  RJ.accent = (id) => RJ.ACCENT[id] || RJ.ACCENT.jasmin;
  const LINE = (RJ.LINE = { main: 2.0, mid: 1.6, fine: 1.15 });

  const hslM = new Map();
  function toHsl(hex) {
    let v = hslM.get(hex);
    if (v) return v;
    const c = U.color.rgb(hex), r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    let h = 0, s = 0;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
    }
    v = [h, s, l];
    if (hslM.size > 600) hslM.clear();
    hslM.set(hex, v);
    return v;
  }
  // the warm cel shadow: a little darker, a little more saturated, hue nudged toward red (never the heavy indigo shade of ART.tk.shade)
  RJ.shade = (hex, dl) => { const v = toHsl(hex); return U.color.hsl(v[0] - 5, clamp(v[1] * 1.06, 0, 1), clamp(v[2] - (dl === undefined ? 0.13 : dl), 0, 1)); };
  RJ.tint = (hex, k) => U.color.mix(hex, '#ffffff', k === undefined ? 0.3 : k);

  // ----------------------------------------------------------------------------------------------------------------------------------
  // registry and dispatchers
  // ----------------------------------------------------------------------------------------------------------------------------------
  RJ.POSES = ['idle', 'sing', 'attack', 'hurt', 'cheer'];
  RJ.register = function (id, impl) {
    if (typeof id !== 'string' || !id || !impl) return impl;
    RJ.chars[id] = impl;
    if (RJ.ids.indexOf(id) < 0) RJ.ids.push(id);
    return impl;
  };
  // sanitised draw options: nothing downstream ever sees NaN, a missing pose or a negative scale
  RJ.norm = function (o) {
    o = o || {};
    const s = num(o.s, 1);
    return { x: num(o.x), y: num(o.y), s: s > 0 ? s : s === 0 ? 1e-3 : 1, pose: typeof o.pose === 'string' ? o.pose : 'idle', t: num(o.t), flip: !!o.flip, expr: typeof o.expr === 'string' ? o.expr : undefined };
  };
  // save, move to the feet centre, scale, mirror when flipped, call fn(ctx), restore (even when fn throws)
  // The key light stays on the upper right of the SCREEN for a flipped figure too: while a flipped figure is drawn RJ._flip is true, the shading helpers
  // (RJ.cel, RJ.lock, RJ.blob, the legs) read RJ.lightAngle(), and a hand-written light offset goes through RJ.lx(dx) (the x offset of a shadow shape is
  // negated, because the whole drawing is mirrored afterwards).
  RJ._flip = false;
  RJ.lx = (dx) => (RJ._flip ? -dx : dx);
  RJ.lightAngle = () => (RJ._flip ? -PI - tk.light : tk.light);
  RJ.frame = function (ctx, o, fn) {
    const n = RJ.norm(o), prev = RJ._flip;
    ctx.save(); RJ._flip = n.flip;
    try { ctx.translate(n.x, n.y); ctx.scale(n.s * (n.flip ? -1 : 1), n.s); fn(ctx, n); } finally { RJ._flip = prev; ctx.restore(); }
  };
  RJ.placeholder = function (ctx, id, o) {
    const n = RJ.norm(o);
    ART.placeholder(ctx, String(id), n.x - 40 * n.s, n.y - 200 * n.s, 80 * n.s, 200 * n.s, { color: '#8f5fe8' });
  };
  RJ.draw = function (ctx, id, o) {
    if (!ctx) return;
    const n = RJ.norm(o), impl = has(RJ.chars, id) ? RJ.chars[id] : null;
    ctx.save();
    try {
      if (impl && typeof impl.draw === 'function') impl.draw(ctx, n); else RJ.placeholder(ctx, id, n);
    } catch (e) { if (typeof console !== 'undefined') console.error('RJ.draw ' + id + ': ' + (e && e.stack || e)); }
    ctx.restore();
  };
  // portrait crop: fills the w x h box with the head and shoulders, no backdrop. o: {t, expr, pose}
  RJ.bust = function (ctx, id, w, h, o) {
    if (!ctx) return;
    w = num(w, 300); h = num(h, 400);
    if (!(w > 0 && h > 0)) return;
    const impl = has(RJ.chars, id) ? RJ.chars[id] : null;
    ctx.save();
    try {
      ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
      if (impl && typeof impl.bust === 'function') impl.bust(ctx, w, h, o || {});
      else ART.placeholder(ctx, String(id), 0, 0, w, h, { color: '#8f5fe8' });
    } catch (e) { if (typeof console !== 'undefined') console.error('RJ.bust ' + id + ': ' + (e && e.stack || e)); }
    ctx.restore();
  };
  // live stage position of a named point: 'head' 'mouth' 'hand' 'mic' 'feet' 'chest'. null for an unknown id or name.
  RJ.point = function (id, name, o) {
    const impl = has(RJ.chars, id) ? RJ.chars[id] : null;
    if (!impl || typeof impl.points !== 'function') return null;
    const p = impl.points(RJ.norm(o));
    return p && p[name] ? { x: p[name][0], y: p[name][1] } : null;
  };

  // Bake one frame of a figure to an offscreen canvas for static uses (cards, lists, thumbnails): RJ.bake(id, {pose, t, expr, flip, s}) returns
  // {canvas, w, h, draw(ctx, x, y, s?)} where (x, y) is the feet centre. Memoised (LRU of 24) by id, pose, expr, flip, t (to 0.01 s) and raster scale.
  // Without a DOM it returns a handle that draws live, so callers never need to branch.
  const BAKE = { map: new Map(), box: { x0: -170, x1: 150, y0: -345, y1: 24 } };   // wide enough for the widest silhouette (a swung ponytail, the monster mane)
  RJ.bake = function (id, o) {
    const n = RJ.norm(o), B = BAKE.box, q = clamp(Math.ceil(n.s * 2) / 2, 0.5, 3);
    const live = { canvas: null, w: B.x1 - B.x0, h: B.y1 - B.y0, draw(ctx, x, y, s) { RJ.draw(ctx, id, Object.assign({}, n, { x: num(x), y: num(y), s: s > 0 ? s : n.s })); } };
    const key = [id, n.pose, n.expr || '', n.flip ? 1 : 0, n.t.toFixed(2), q].join('|');
    let hit = BAKE.map.get(key);
    if (hit) { BAKE.map.delete(key); BAKE.map.set(key, hit); return hit; }
    try {
      if (typeof document === 'undefined' || !document.createElement) return live;
      const w = B.x1 - B.x0, h = B.y1 - B.y0, c = document.createElement('canvas');
      c.width = Math.ceil(w * q); c.height = Math.ceil(h * q);
      const g = c.getContext && c.getContext('2d');
      if (!g) return live;
      g.setTransform(q, 0, 0, q, 0, 0);
      const ox = n.flip ? -B.x1 : B.x0;
      RJ.draw(g, id, { x: -ox, y: -B.y0, s: 1, pose: n.pose, t: n.t, expr: n.expr, flip: n.flip });
      hit = { canvas: c, w, h, draw(ctx, x, y, s) { const k = s > 0 ? s : n.s; ctx.drawImage(c, num(x) + ox * k, num(y) + B.y0 * k, w * k, h * k); } };
      BAKE.map.set(key, hit);
      while (BAKE.map.size > 24) BAKE.map.delete(BAKE.map.keys().next().value);
      return hit;
    } catch (e) { return live; }
  };

  // ----------------------------------------------------------------------------------------------------------------------------------
  // cel / ink wrappers
  // ----------------------------------------------------------------------------------------------------------------------------------
  // celFill with the house defaults. opts as tk.celFill; shadow defaults to the warm shade of base, line to LINE.main in the ink colour.
  RJ.cel = function (g, pts, base, o) {
    const opt = Object.assign({ line: LINE.main, lineColor: C.ink, wobble: 0.05, weightVar: 0.45, hi: false, hiW: 1.8, hiAlpha: 0.8, light: RJ.lightAngle() }, o);
    if (opt.shadow === undefined) opt.shadow = RJ.shade(base);
    if (opt.hi === true) opt.hi = RJ.tint(base, 0.4);
    tk.celFill(g, pts, base, opt);
  };
  RJ.ink = function (g, pts, o) { tk.inkPath(g, pts, Object.assign({ w: LINE.mid, color: C.ink, taper: 0.3, wobble: 0.04 }, o)); };
  RJ.fillPts = function (g, pts, col, alpha) {
    g.save(); if (alpha !== undefined) g.globalAlpha *= clamp(alpha, 0, 1);
    g.beginPath(); tk.trace(g, pts); g.fillStyle = col; g.fill(); g.restore();
  };
  // a hair lock: tk.ribbon with the house hair look (warm shadow, soft highlight band, brown ink line). o as tk.ribbon.
  RJ.lock = function (g, spine, base, o) {
    o = o || {};
    tk.ribbon(g, spine, base, Object.assign({ light: RJ.lightAngle(), line: LINE.main, lineColor: C.ink, shadow: RJ.shade(base, 0.14), gloss: true, glossColor: RJ.tint(base, 0.38), glossAlpha: 0.7, strands: 1, seed: 3 }, o));
  };
  // A union of round shapes drawn with ONE outline, hand-painter style: an ink pass, a shade pass, then the skin shifted toward the light so
  // a thin shade crescent stays on the lower left and the line is thin on the lit side. items: {a:[x,y], b:[x,y], w} capsule, {e:[cx,cy,rx,ry,rot]}
  // ellipse. o: {fill, shade, ink, L (outline width), rot (rotation of the local frame, so the light shift stays upright), lit (1 = thin shade crescent, 2 to 3 = a wider shade band)}
  RJ.blob = function (g, items, o) {
    o = o || {};
    const fill = o.fill || C.skin, shade = o.shade || RJ.shade(fill), ink = o.ink || C.ink, L = o.L === undefined ? LINE.main : o.L;
    const rot = num(o.rot, 0), lit = o.lit > 0 ? o.lit : 1, lx = RJ.lx(0.5) * 0.95 * lit, ly = -0.87 * 0.95 * lit;   // key light from the upper right, in world space
    const c = Math.cos(-rot), s = Math.sin(-rot), dx = lx * c - ly * s, dy = lx * s + ly * c;
    const pass = (grow, col, ox, oy) => {
      g.save(); g.fillStyle = col; g.strokeStyle = col; g.lineCap = 'round'; g.lineJoin = 'round';
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.a) { g.lineWidth = Math.max(0.4, it.w + grow); g.beginPath(); g.moveTo(it.a[0] + ox, it.a[1] + oy); g.lineTo(it.b[0] + ox, it.b[1] + oy); g.stroke(); }
        else if (it.e) { const e = it.e; g.beginPath(); g.ellipse(e[0] + ox, e[1] + oy, Math.max(0.3, e[2] + grow / 2), Math.max(0.3, e[3] + grow / 2), e[4] || 0, 0, TAU); g.fill(); }
      }
      g.restore();
    };
    pass(L * 1.7, ink, 0, 0);
    pass(0, shade, 0, 0);
    pass(-1.3 * lit, fill, dx, dy);
  };

  // ----------------------------------------------------------------------------------------------------------------------------------
  // hands and the mic
  // ----------------------------------------------------------------------------------------------------------------------------------
  // A hand at (x, y) = the wrist, fingers pointing along ang. kind: 'fist' (a plain fist), 'point' (index finger out, thumb up), 'open' (fingers fanned,
  // o.spread 0..1.5), 'relaxed' (open, fingers soft and close). o: {skin, shade, k (size multiplier)}
  // RJ.handParts(kind, o) -> {items, detail(g), k}: the same hand as blob items in the wrist's local frame (+x along the fingers) plus a fn drawing the finger
  // gap lines, so RJ.drawArm can fold a free hand into the arm's own blob (ONE outline from shoulder to fingertips, no wrist seam).
  RJ.handParts = function (kind, o) {
    o = o || {};
    const k = (o.k || 1) * (kind === 'point' ? 1.3 : 1);
    const gaps = [];
    let items;
    if (kind === 'point') {                                // one long index finger out, a short thumb up, three curled fingers stacked under the index
      items = [{ e: [5, 2, 7.4, 7.4] }, { a: [9, -1.6], b: [24, -2.6], w: 4.8 }, { a: [3.5, -4], b: [7, -11.2], w: 4.4 },
        { e: [11.6, 3.4, 3.4, 3.1, 0.1] }, { e: [10.8, 6.8, 3.3, 2.9, 0.15] }, { e: [9.2, 10, 3.1, 2.6, 0.2] }];
      gaps.push([[8.8, 5.2], [13.4, 5.4]], [[7.8, 8.5], [12.4, 8.9]]);
    } else if (kind === 'open' || kind === 'relaxed') {
      const sp = kind === 'relaxed' ? 0.42 : (o.spread === undefined ? 1 : o.spread), len = [8.5, 10.5, 10, 7.5];
      items = [{ e: [4, 0.5, 7, 7.2] }];
      const tips = [];
      for (let i = 0; i < 4; i++) {
        const th = (i - 1.5) * 0.3 * sp + (kind === 'relaxed' ? 0.28 : 0), by = (i - 1.5) * 3.5, bx = 8;
        const tx = bx + Math.cos(th) * len[i], ty = by + Math.sin(th) * len[i];
        items.push({ a: [bx, by], b: [tx, ty], w: 4.3 });
        tips.push([bx, by, tx, ty]);
      }
      items.push({ a: [2, -5], b: [9.5, -10 + (kind === 'relaxed' ? 3 : 0)], w: 4.6 });
      for (let i = 0; i < 3; i++) { const a = tips[i], b = tips[i + 1]; gaps.push([[(a[0] + b[0]) / 2 + 1, (a[1] + b[1]) / 2], [(a[2] + b[2]) / 2 - 1.5, (a[3] + b[3]) / 2]]); }
    } else {                                               // fist
      items = [{ e: [6.5, 0, 8, 7.4] }, { a: [3, 5.2], b: [11, 5.6], w: 4.6 }];
      gaps.push([[8.5, -5.4], [13.6, -3.4]], [[8.5, -2], [14.2, -0.6]], [[8.5, 1.6], [13.6, 2.4]]);
    }
    return { items, k, detail(g) { gaps.forEach((pts) => RJ.ink(g, pts, { w: LINE.fine * 0.85, color: C.inkSoft, taper: 0.5 })); } };
  };
  RJ.hand = function (g, kind, x, y, ang, o) {
    o = o || {};
    const P = RJ.handParts(kind, o), k = P.k, sk = o.skin || C.skin, sh = o.shade || C.skinSh, fy = Math.cos(ang) < 0 ? -1 : 1;   // pointing left: mirror so the thumb stays on top
    g.save(); g.translate(x, y); g.rotate(ang); g.scale(k, k * fy);
    RJ.blob(g, P.items, { fill: sk, shade: sh, rot: ang, L: LINE.main * 0.82 / Math.sqrt(k) });
    P.detail(g);
    g.restore();
  };
  // A fist wrapped around a mic shaft: (x, y) is the grip, axis the mic's axis angle (head toward tail). The thumb lies toward the head.
  RJ.fistOnMic = function (g, x, y, axis, o) {
    o = o || {};
    const k = o.k || 1;
    g.save(); g.translate(x, y); g.rotate(axis); g.scale(k, k);
    RJ.blob(g, [{ e: [0, 0.5, 8.6, 7.8] }, { a: [-4.6, -4.6], b: [-10, -5.8], w: 4.8 }], { fill: o.skin || C.skin, shade: o.shade || C.skinSh, rot: axis, L: LINE.main * 0.82 / Math.sqrt(k) });
    for (let i = -1; i <= 1; i++) RJ.ink(g, [[i * 3.6 + 0.4, -0.2], [i * 3.6 + 0.9, 3.2], [i * 3.6 + 0.2, 6.2]], { w: LINE.fine * 0.85, color: C.inkSoft, taper: 0.5 });
    g.restore();
  };
  // A handheld mic: (x, y) = centre of the ball head, the shaft runs toward ang. o: {accent (band colour), headR (8.5), len (40), bands (2), k}
  RJ.mic = function (g, x, y, ang, o) {
    o = o || {};
    const A = o.accent || '#78bd35', R = o.headR || 9.5, len = o.len || 42, bands = o.bands === undefined ? 2 : o.bands;
    g.save(); g.translate(x, y); g.rotate(ang); if (o.k) g.scale(o.k, o.k);
    const x0 = R * 0.55, x1 = R * 0.55 + len, w0 = R * 1.02, w1 = R * 0.8;
    const bandAt = (u, th) => {
      const xa = lerp(x0, x1, u), w = lerp(w0, w1, u);
      RJ.cel(g, [[xa - th / 2, -w / 2 - 0.6], [xa + th / 2, -w / 2 - 0.6], [xa + th / 2, w / 2 + 0.6], [xa - th / 2, w / 2 + 0.6]], A, { line: LINE.fine + 0.2, tension: 0, shadow: RJ.shade(A, 0.12) });
    };
    RJ.cel(g, [[x0, -w0 / 2], [x1 - 2, -w1 / 2], [x1 + 1.6, 0], [x1 - 2, w1 / 2], [x0, w0 / 2]], C.mic, { shadow: C.micSh, line: LINE.mid + 0.2, tension: 0.3, rim: C.micHi, rimW: 1.4, rimSide: 'light', rimAlpha: 0.9 });
    RJ.ink(g, [[x0 + 5, -w0 / 2 + 1.5], [x1 - 7, -w1 / 2 + 1.4]], { w: 1.1, color: C.micHi, taper: 0.4, wobble: 0 });
    if (bands > 0) bandAt(clamp((R + 1.8 - x0) / len, 0.05, 0.5), 3.6);          // the ring just under the ball, clear of the hand
    if (bands > 1) bandAt(0.84, 2.6);
    // ball head: dark with a grille hint and a glossy catch
    RJ.cel(g, tk.circlePts(0, 0, R, 14), C.mic, { shadow: C.micSh, line: LINE.mid + 0.2, rim: C.micHi, rimW: 1.4, rimSide: 'light', rimAlpha: 0.9 });
    g.save(); g.beginPath(); g.arc(0, 0, R - 1, 0, TAU); g.clip();
    g.strokeStyle = C.micGrill; g.lineWidth = 0.8; g.globalAlpha = 0.7;
    for (let i = -1; i <= 1; i++) { g.beginPath(); g.ellipse(0, 0, Math.max(0.5, R * 0.34 * Math.abs(i) + 0.3), R, 0, 0, TAU); g.stroke(); }
    g.restore();
    RJ.ink(g, [[-R * 0.58, -R * 0.12], [-R * 0.36, -R * 0.58], [R * 0.06, -R * 0.74]], { w: 1.9, color: '#9b99a8', taper: 0.5, wobble: 0 });
    g.beginPath(); g.arc(-R * 0.42, -R * 0.4, Math.max(0.9, R * 0.1), 0, TAU); g.fillStyle = '#c9c7d4'; g.fill();
    g.restore();
  };

  // ----------------------------------------------------------------------------------------------------------------------------------
  // arms and legs
  // ----------------------------------------------------------------------------------------------------------------------------------
  // two-bone IK: shoulder s, target t, bone lengths l1 l2, bend +1 or -1 (which way the elbow bows). Returns {e: elbow, w: wrist (clamped)}.
  RJ.ik2 = function (s, t, l1, l2, bend) {
    let dx = t[0] - s[0], dy = t[1] - s[1], d = Math.hypot(dx, dy);
    const maxD = l1 + l2 - 0.4, minD = Math.abs(l1 - l2) + 1;
    if (d < 1e-6) { dx = 0; dy = minD; d = minD; }
    if (d > maxD) { dx *= maxD / d; dy *= maxD / d; d = maxD; } else if (d < minD) { dx *= minD / d; dy *= minD / d; d = minD; }
    const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1)), a1 = Math.atan2(dy, dx) + (bend < 0 ? -a : a);
    return { e: [s[0] + Math.cos(a1) * l1, s[1] + Math.sin(a1) * l1], w: [s[0] + dx, s[1] + dy] };
  };
  // a short sleeve (or any flared tube with a rounded shoulder end) from s along s->e: len 0..1 of the way, widths at the shoulder and at the cuff
  RJ.sleeve = function (s, e, len, w0, w1) {
    const dx = e[0] - s[0], dy = e[1] - s[1], d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, nx = -uy, ny = ux;
    const px = s[0] + dx * len, py = s[1] + dy * len, h0 = w0 / 2, h1 = w1 / 2;
    return [[s[0] + nx * h0, s[1] + ny * h0], [s[0] + nx * h0 * 0.7 - ux * h0 * 0.7, s[1] + ny * h0 * 0.7 - uy * h0 * 0.7], [s[0] - ux * h0 * 1.02, s[1] - uy * h0 * 1.02],
      [s[0] - nx * h0 * 0.7 - ux * h0 * 0.7, s[1] - ny * h0 * 0.7 - uy * h0 * 0.7], [s[0] - nx * h0, s[1] - ny * h0],
      [px - nx * h1, py - ny * h1, 1], [px + nx * h1, py + ny * h1, 1]];
  };
  // A whole arm. A: {s: shoulder, t: hand target, bend, l: [upper, fore], w: [shoulder width, wrist width], skin, skinSh,
  //   sleeve: {color, len (0.9), w0, w1, shade} or null, parts: {kind, rot, o} a free hand folded into the arm's own outline (instead of hand), lit (shade band width),
  //   mid: fn(g, wrist, elbow) drawn after the arm and sleeve but before the hand (the mic),
  //   hand: fn(g, wrist, ang, elbow) draws the hand}. Returns {e, w, ang}.
  RJ.drawArm = function (g, A) {
    const l = A.l || [23, 21], w = A.w || [15, 11], r = RJ.ik2(A.s, A.t, l[0], l[1], A.bend || 1);
    const skin = A.skin || C.skin, sh = A.skinSh || C.skinSh;
    // The limb is a chain of overlapping round capsules drawn as ONE blob (one ink outline, a hard shade band on the lower left): the elbow is always
    // rounded and the outline cannot fold over itself at a sharp bend the way an offset ribbon does. The width eases from the shoulder to the wrist.
    const items = [], wAt = (u) => w[0] + (w[1] - w[0]) * u + 1.2 * Math.sin(PI * u);
    const chain = (p, q, u0, u1) => {
      const n = Math.max(2, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 4));
      for (let i = 0; i < n; i++) {
        const f0 = i / n, f1 = (i + 1) / n;
        items.push({ a: [lerp(p[0], q[0], f0), lerp(p[1], q[1], f0)], b: [lerp(p[0], q[0], f1), lerp(p[1], q[1], f1)], w: wAt(lerp(u0, u1, (f0 + f1) / 2)) });
      }
    };
    chain(A.s, r.e, 0, 0.5); chain(r.e, r.w, 0.5, 1);
    // A.parts = {kind, ang offset, o} folds a free hand into the same blob (one outline from shoulder to fingertips, no bracelet-like seam at the wrist)
    let hp = null, hang = 0;
    if (A.parts && !A.mid) {
      hp = RJ.handParts(A.parts.kind, A.parts.o);
      hang = Math.atan2(r.w[1] - r.e[1], r.w[0] - r.e[0]) + num(A.parts.rot);
      const ca = Math.cos(hang), sa = Math.sin(hang), k = hp.k, fy = ca < 0 ? -1 : 1;                // a hand pointing left is mirrored so the thumb stays on top
      const tf = (p) => [r.w[0] + (p[0] * ca - p[1] * fy * sa) * k, r.w[1] + (p[0] * sa + p[1] * fy * ca) * k];
      hp.items.forEach((it) => { if (it.e) { const c = tf(it.e); items.push({ e: [c[0], c[1], it.e[2] * k, it.e[3] * k, fy * (it.e[4] || 0) + hang] }); } else items.push({ a: tf(it.a), b: tf(it.b), w: it.w * k }); });
    }
    RJ.blob(g, items, { fill: skin, shade: sh, L: LINE.main * 0.95, lit: A.lit || 2.4 });
    if (hp) { g.save(); g.translate(r.w[0], r.w[1]); g.rotate(hang); g.scale(hp.k, hp.k * (Math.cos(hang) < 0 ? -1 : 1)); hp.detail(g); g.restore(); }
    if (A.sleeve) {
      const sl = A.sleeve, poly = RJ.sleeve(A.s, r.e, sl.len === undefined ? 0.88 : sl.len, sl.w0 || 20, sl.w1 || 23);
      RJ.cel(g, poly, sl.color, { shadow: sl.shade || RJ.shade(sl.color), hi: sl.hi || false, line: sl.line || LINE.main, depth: 5, decor: sl.decor });
    }
    const ang = Math.atan2(r.w[1] - r.e[1], r.w[0] - r.e[0]);
    if (A.cuff) {                                          // a ribbed cuff band across the wrist (onesies, jackets)
      const cu = A.cuff, ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux, hw = (w[1] + 4) / 2, cx = r.w[0] - ux * 5, cy = r.w[1] - uy * 5;
      RJ.cel(g, [[cx - nx * hw - ux * 4, cy - ny * hw - uy * 4], [cx + nx * hw - ux * 4, cy + ny * hw - uy * 4], [cx + nx * hw + ux * 5, cy + ny * hw + uy * 5], [cx - nx * hw + ux * 5, cy - ny * hw + uy * 5]], cu.color, { shadow: cu.light || RJ.shade(cu.color), line: LINE.main, tension: 0.35, depth: 3 });
      RJ.ink(g, [[cx - nx * hw * 0.8, cy - ny * hw * 0.8], [cx + nx * hw * 0.8, cy + ny * hw * 0.8]], { w: 1, color: cu.light || RJ.shade(cu.color), taper: 0.2, wobble: 0 });
    }
    if (A.mid) A.mid(g, r.w, r.e);
    if (A.hand && !hp) A.hand(g, r.w, ang, r.e);
    return { e: r.e, w: r.w, ang };
  };
  // A sneaker with the ankle at (x, y) and the toe toward +x (rotated by ang). o: {color, sole, accent, toeCap, heel, shade, k, paw (a round furry foot with
  // toe lines instead of a sneaker)}
  RJ.shoe = function (g, x, y, ang, o) {
    o = o || {};
    const col = o.color || '#e0f07a', sole = o.sole || RJ.tint(col, 0.55), shd = o.shade || RJ.shade(col, 0.15);
    g.save(); g.translate(x, y); g.rotate(ang || 0); if (o.k) g.scale(o.k, o.k);
    const pts = o.paw ? [[-11, -5], [-13.5, 4], [-11, 12.2, 1], [22, 12.2, 1], [28, 7], [25, -1], [14, -4], [2, -8]] : [[-10, -5], [-11.5, 3, 0], [-9.5, 12.2, 1], [21, 12.2, 1], [25.5, 8], [24, 3], [15, -0.5], [7, -4], [-1, -7.5]];
    RJ.cel(g, pts, col, { shadow: shd, line: LINE.main, depth: 5, hi: o.hi === undefined ? RJ.tint(col, 0.35) : o.hi, hiW: 1.6, decor: (gg) => {
      if (o.paw) { [[14, 2], [19, 3], [23, 4]].forEach((t) => RJ.ink(gg, [[t[0], t[1]], [t[0] + 1.5, t[1] + 9]], { w: 1.3, color: o.pawLine || C.inkSoft, taper: 0.5, wobble: 0 })); return; }
      gg.beginPath(); gg.rect(-14, 8.2, 44, 8); gg.fillStyle = sole; gg.fill();                   // the sole
      RJ.ink(gg, [[-14, 8.2], [30, 8.2]], { w: 1.2, color: C.inkSoft, taper: 0, wobble: 0 });
      if (o.toeCap) { gg.beginPath(); gg.moveTo(15, -4); gg.quadraticCurveTo(21, 2, 18, 9); gg.lineTo(30, 9); gg.lineTo(30, -4); gg.closePath(); gg.fillStyle = o.toeCap; gg.fill(); RJ.ink(gg, [[15, -3], [19.5, 3], [17.5, 8.5]], { w: 1.2, color: C.inkSoft, taper: 0.3, wobble: 0 }); }
      if (o.heel) { gg.beginPath(); gg.rect(-14, -2, 7, 11); gg.fillStyle = o.heel; gg.fill(); }
      if (o.accent) { gg.beginPath(); gg.moveTo(-14, 5.2); gg.lineTo(30, 5.2); gg.lineTo(30, 7.2); gg.lineTo(-14, 7.2); gg.closePath(); gg.fillStyle = o.accent; gg.fill(); }
    } });
    if (!o.paw) {
      RJ.ink(g, [[0.5, -3.6], [4.6, -0.4]], { w: 1.1, color: C.inkSoft, taper: 0.5, wobble: 0 });                     // lace ticks
      RJ.ink(g, [[3.4, -5.6], [7.2, -2.2]], { w: 1.1, color: C.inkSoft, taper: 0.5, wobble: 0 });
    }
    g.restore();
  };
  // A leg from the hip to the ankle plus its shoe. L: {hip, ankle, w: [hip width, ankle width], color (pants) or skin, shade, bow (knee bow px, +x forward),
  //   sock: {color, len (px up from the ankle), shade}, shoe: opts of RJ.shoe, rot (toe angle), pantsHem (draw the pants over the shoe), cuff: color}
  RJ.drawLeg = function (g, L) {
    const hip = L.hip, an = L.ankle, w = L.w || [18, 14], bow = L.bow === undefined ? 2 : L.bow;
    const mid = [(hip[0] + an[0]) / 2 + bow, (hip[1] + an[1]) / 2];
    const col = L.color || C.skin, shd = L.shade || (L.color ? RJ.shade(L.color) : C.skinSh);
    const prof = L.profile || ((u) => 1 - (1 - w[1] / w[0]) * u);
    const limb = () => tk.ribbon(g, [hip, mid, an], col, { light: RJ.lightAngle(), wMax: w[0], w0: w[0], w1: w[1], profile: prof, cap: 'flat', gloss: false, strands: 0, shadow: shd, shadowW: 0.36, line: LINE.main, lineColor: C.ink, wobble: 0.05, weightVar: 0.45 });
    if (L.pantsOver) { RJ.shoe(g, an[0], an[1], L.rot || 0, L.shoe); limb(); if (L.decor) L.decor(g, hip, an, mid); }
    else {
      limb();
      if (L.decor) L.decor(g, hip, an, mid);
      if (L.sock) {
        const sl = L.sock.len || 18, u = clamp(1 - sl / Math.max(1, Math.hypot(hip[0] - an[0], hip[1] - an[1])), 0, 0.98);
        const a = [lerp(hip[0], an[0], u) + (mid[0] - lerp(hip[0], an[0], 0.5)) * 0.3, lerp(hip[1], an[1], u)];
        tk.ribbon(g, [a, [(a[0] + an[0]) / 2, (a[1] + an[1]) / 2 + 1], [an[0], an[1] + 2]], L.sock.color, { light: RJ.lightAngle(), wMax: w[1] + 2.6, w0: w[1] + 2.6, w1: w[1] + 2.4, profile: () => 1, cap: 'flat', gloss: false, strands: 0, shadow: L.sock.shade || RJ.shade(L.sock.color, 0.1), line: LINE.main, lineColor: C.ink });
      }
      RJ.shoe(g, an[0], an[1], L.rot || 0, L.shoe);
    }
  };

  // ----------------------------------------------------------------------------------------------------------------------------------
  // head parts: skull, ear, neck
  // ----------------------------------------------------------------------------------------------------------------------------------
  // The default chibi skull in head space (origin = head centre, face turned +x): 14 control points, closed Catmull-Rom. About 118 wide, 118 tall.
  RJ.SKULL = [[-2, -58], [30, -53], [52, -34], [60, -4], [56, 24], [40, 46], [22, 57], [4, 60], [-16, 56], [-36, 44], [-54, 24], [-62, -3], [-58, -33], [-40, -52]];
  // a scaled copy: o.w, o.h multipliers (1 = default), o.chin pulls the chin point (px, + = longer)
  RJ.skullPts = function (o) {
    o = o || {};
    const sx = o.w || 1, sy = o.h || 1, chin = num(o.chin);
    return RJ.SKULL.map((p) => [p[0] * sx, p[1] * sy + (p[1] > 40 ? chin * ((p[1] - 40) / 20) : 0)]);
  };
  // plain skin skull cel (hair is drawn over it by the character). o: {pts, skin, shade, line}
  RJ.skinHead = function (g, o) {
    o = o || {};
    RJ.cel(g, o.pts || RJ.SKULL, o.skin || C.skin, { shadow: o.shade || C.skinSh, line: o.line || LINE.main + 0.2, depth: 9, hi: o.hi === undefined ? C.skinHi : o.hi, hiW: 2 });
  };
  // an ear at (x, y), radius about r, on the -x side by default (o.side = 1 puts it on +x)
  RJ.ear = function (g, x, y, o) {
    o = o || {};
    const r = o.r || 13, sd = o.side === 1 ? 1 : -1, sk = o.skin || C.skin, sh = o.shade || C.skinSh;
    // a round-topped ear: the rim bulges away from the head (toward sd), the lobe is soft
    const pts = [[r * 0.45 * sd, -r * 0.92], [r * 0.2 * sd, -r * 1.08], [r * 0.82 * sd, -r * 0.82], [r * 1.0 * sd, -r * 0.2], [r * 0.82 * sd, r * 0.52], [r * 0.34 * sd, r * 0.98], [-r * 0.1 * sd, r * 0.86], [-r * 0.3 * sd, r * 0.2], [-r * 0.2 * sd, -r * 0.6]];
    pts.splice(1, 1);
    g.save(); g.translate(x, y);
    RJ.cel(g, pts, sk, { shadow: sh, line: LINE.main, depth: 3, hi: false });
    RJ.ink(g, [[r * 0.62 * sd, -r * 0.42], [r * 0.7 * sd, r * 0.1], [r * 0.42 * sd, r * 0.52]], { w: LINE.fine, color: C.inkSoft, taper: 0.4 });
    RJ.ink(g, [[r * 0.3 * sd, -r * 0.5], [r * 0.12 * sd, -r * 0.05], [r * 0.22 * sd, r * 0.28]], { w: LINE.fine * 0.85, color: C.inkSoft, taper: 0.5 });
    g.restore();
  };
  // a neck block in rest space, centred at x with its top at y. o: {skin, shade, w, h}
  RJ.neck = function (g, x, y, o) {
    o = o || {};
    const w = o.w || 24, h = o.h || 16;
    RJ.cel(g, [[x - w / 2, y], [x + w / 2, y], [x + w / 2 + 2, y + h], [x - w / 2 - 2, y + h]], o.skin || C.skin, { shadow: o.shade || C.skinSh, line: LINE.main, tension: 0.2, shadowShape: { poly: [[x - w, y - 2], [x + w, y - 2], [x + w, y + h * 0.55], [x - w, y + h * 0.55]] } });
  };

  // ----------------------------------------------------------------------------------------------------------------------------------
  // the face
  // ----------------------------------------------------------------------------------------------------------------------------------
  // named expressions: partial face states (RJ.resolve applies one when o.expr names it, over the pose's own face)
  RJ.EXPR = {
    neutral: { eyes: 'open', mouth: 'smile', brow: 0 },
    happy: { eyes: 'happy', mouth: 'happyOpen', brow: -0.1 },
    smirk: { eyes: 'open', mouth: 'smirkTeeth', brow: 0.35 },
    sing: { eyes: 'half', mouth: 'sing', brow: -0.1 },
    hurt: { eyes: 'hurt', mouth: 'ow', brow: -0.6, sweat: 1 },
    angry: { eyes: 'angry', mouth: 'ow', brow: 1 },
    wow: { eyes: 'wide', mouth: 'sing', brow: -0.4, browY: -3 },
    shy: { eyes: 'open', mouth: 'smile', brow: -0.4, blush: 1.6 },
    sleepy: { eyes: 'sleepy', mouth: 'flat', brow: -0.2 },
  };
  // blink: 1 = open, dips to 0 and back over 0.16 s about every 4 to 5.5 s. A pure function of t and a per-character seed.
  RJ.blinkOpen = function (t, seed) {
    const per = 3.7 + 1.8 * tk.vary(seed, 'bp'), ph = ((num(t) + tk.vary(seed, 'bo') * per) % per + per) % per;
    return ph < 0.16 ? Math.abs(ph / 0.08 - 1) : 1;
  };

  // Mouths. (x, y) = centre of the mouth line, w its width. kind: smile smirk smirkTeeth sing grin happyOpen beat ow flat frown tiny. Unknown = smile.
  // o: {ink, lineW, inner, tongue, teeth (bool: show teeth in open mouths), puff}
  RJ.mouth = function (g, x, y, w, kind, o) {
    o = o || {};
    w = w > 0 ? w : 14;
    const ink = o.ink || C.ink, lw = o.lineW || Math.max(1.3, w * 0.115), inner = o.inner || C.mouthIn, tongue = o.tongue || C.tongue;
    const line = (pts, ww, seed) => tk.inkPath(g, pts, { w: ww || lw, color: ink, taper: 0.42, wobble: 0.04, seed: seed | 0 });
    const closedShape = (pts, opt) => {
      opt = opt || {};
      g.save();
      g.beginPath(); tk.trace(g, pts); g.fillStyle = opt.inner || inner; g.fill(); g.clip();
      if (opt.tongue !== false) { g.beginPath(); g.ellipse(x + (opt.tx || 0), y + w * (opt.ty === undefined ? 0.36 : opt.ty), w * (opt.trx || 0.3), w * (opt.try || 0.16), 0, 0, TAU); g.fillStyle = tongue; g.fill(); }
      if (opt.teeth) {
        const th = w * opt.teeth;
        g.beginPath(); g.rect(x - w, y - w * 0.3, w * 2, th + w * 0.3); g.fillStyle = C.teeth; g.fill();
        g.strokeStyle = 'rgba(120,70,60,0.5)'; g.lineWidth = 0.8;
        for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(x + i * w * 0.14 + (opt.tx || 0), y - w * 0.1); g.lineTo(x + i * w * 0.14 + (opt.tx || 0), y + th * 0.9); g.stroke(); }
        g.beginPath(); g.moveTo(x - w, y + th); g.lineTo(x + w, y + th); g.strokeStyle = 'rgba(120,70,60,0.35)'; g.stroke();
      }
      g.restore();
      tk.inkPath(g, pts, { closed: true, w: lw * 1.2, color: ink, align: 0, wobble: 0.02 });
    };
    if (kind === 'smirk') {
      line([[x - w / 2, y + w * 0.06], [x - w * 0.1, y + w * 0.14], [x + w * 0.3, y + w * 0.04], [x + w / 2, y - w * 0.17]]);
      line([[x + w * 0.5, y - w * 0.14], [x + w * 0.6, y - w * 0.26]], lw * 0.9, 2);
    } else if (kind === 'smirkTeeth') {
      closedShape([[x - w * 0.5, y + w * 0.02], [x - w * 0.1, y - w * 0.03], [x + w * 0.3, y - w * 0.1], [x + w * 0.54, y - w * 0.24], [x + w * 0.44, y + w * 0.08], [x + w * 0.14, y + w * 0.3], [x - w * 0.22, y + w * 0.24]], { teeth: 0.3, ty: 0.34, trx: 0.2, try: 0.1, tx: 0.08 * w });
      line([[x + w * 0.54, y - w * 0.22], [x + w * 0.64, y - w * 0.32]], lw * 0.9, 2);
    } else if (kind === 'sing') {
      closedShape(tk.ellipsePts(x, y + w * 0.16, w * 0.3, w * 0.4, 12), { ty: 0.42, trx: 0.2, try: 0.14, teeth: o.teeth ? 0.12 : 0 });
    } else if (kind === 'grin') {
      closedShape([[x - w * 0.52, y - w * 0.08], [x - w * 0.2, y - w * 0.02], [x + w * 0.2, y - w * 0.02], [x + w * 0.52, y - w * 0.1], [x + w * 0.38, y + w * 0.32], [x, y + w * 0.5], [x - w * 0.38, y + w * 0.32]], { teeth: 0.19, ty: 0.38, try: 0.15 });
    } else if (kind === 'happyOpen') {
      closedShape([[x - w * 0.5, y - w * 0.04], [x - w * 0.2, y + w * 0.01], [x + w * 0.2, y + w * 0.01], [x + w * 0.5, y - w * 0.06], [x + w * 0.36, y + w * 0.3], [x, y + w * 0.46], [x - w * 0.36, y + w * 0.3]], { ty: 0.34, trx: 0.28, try: 0.15 });
    } else if (kind === 'beat') {
      // a beatbox mouth: a wide D (flat top lip, round bottom) with a strip of upper teeth and a dark interior; the mic usually covers its right half
      closedShape([[x - w * 0.47, y - w * 0.05, 1], [x - w * 0.1, y - w * 0.09], [x + w * 0.28, y - w * 0.1], [x + w * 0.48, y - w * 0.06, 1], [x + w * 0.4, y + w * 0.22], [x + w * 0.12, y + w * 0.42], [x - w * 0.2, y + w * 0.4], [x - w * 0.42, y + w * 0.2]],
        { teeth: 0.2, inner: o.innerBeat || '#6f2036', ty: 0.36, trx: 0.2, try: 0.09 });
      if (o.puff) { g.save(); g.globalAlpha *= 0.55; [-1, 1].forEach((sd) => line([[x + sd * w * 0.64, y - w * 0.04], [x + sd * w * 0.78, y + w * 0.1], [x + sd * w * 0.78, y + w * 0.22], [x + sd * w * 0.64, y + w * 0.36]], lw * 0.5, 3)); g.restore(); }
    } else if (kind === 'ow') {
      // a yelp: a rounded open mouth with a dark interior, a white strip of upper teeth and a little tongue
      closedShape([[x - w * 0.44, y + w * 0.02, 1], [x - w * 0.14, y - w * 0.05], [x + w * 0.16, y - w * 0.05], [x + w * 0.44, y + w * 0.01, 1], [x + w * 0.38, y + w * 0.26], [x + w * 0.1, y + w * 0.44], [x - w * 0.16, y + w * 0.44], [x - w * 0.4, y + w * 0.26]],
        { teeth: 0.15, ty: 0.4, trx: 0.22, try: 0.12 });
    } else if (kind === 'grit') {                          // gritted teeth: a white bow-tie with tooth lines
      const sh = [[x - w * 0.5, y + w * 0.12], [x - w * 0.3, y - w * 0.04], [x, y + w * 0.06], [x + w * 0.3, y - w * 0.04], [x + w * 0.5, y + w * 0.12], [x + w * 0.3, y + w * 0.3], [x, y + w * 0.22], [x - w * 0.3, y + w * 0.3]];
      g.save(); g.beginPath(); tk.trace(g, sh, 0, 0, 0.5); g.fillStyle = C.teeth; g.fill(); g.restore();
      tk.inkPath(g, sh, { closed: true, w: lw * 1.2, color: ink, align: 0, tension: 0.5 });
      line([[x - w * 0.1, y + w * 0.04], [x - w * 0.1, y + w * 0.24]], lw * 0.6, 4); line([[x + w * 0.12, y + w * 0.04], [x + w * 0.12, y + w * 0.24]], lw * 0.6, 5);
    } else if (kind === 'flat') line([[x - w / 2, y], [x, y + w * 0.04], [x + w / 2, y - w * 0.02]]);
    else if (kind === 'frown') line([[x - w / 2, y + w * 0.1], [x - w * 0.2, y - w * 0.02], [x + w * 0.2, y - w * 0.02], [x + w / 2, y + w * 0.1]]);
    else if (kind === 'tiny') closedShape(tk.ellipsePts(x, y + w * 0.05, w * 0.13, w * 0.12, 8), { tongue: false });
    else {
      line([[x - w / 2, y - w * 0.02], [x - w * 0.22, y + w * 0.14], [x + w * 0.2, y + w * 0.14], [x + w / 2, y - w * 0.08]]);
      line([[x + w * 0.5, y - w * 0.06], [x + w * 0.58, y - w * 0.16]], lw * 0.9, 2);
    }
  };
  // a drop of sweat (a teardrop with a catchlight)
  RJ.fxSweat = function (g, x, y, r) {
    r = r || 5;
    RJ.cel(g, [[x, y - r * 1.5, 1], [x + r * 0.85, y + r * 0.1], [x, y + r * 0.95], [x - r * 0.85, y + r * 0.1]], '#9fdcff', { shadow: '#6bb4ee', line: LINE.mid, depth: r * 0.4 });
    RJ.ink(g, [[x - r * 0.4, y - r * 0.1], [x - r * 0.35, y + r * 0.4]], { w: 1.2, color: '#ffffff', taper: 0.5, wobble: 0 });
  };

  // Eyebrow: a thick brush stroke, fullest around the middle, with a slight arch. side -1 = near (left) brow. tilt > 0 lowers the inner end (cocky,
  // angry), < 0 raises it (worried). o: {thick, arch, color, alpha}
  RJ.brow = function (g, x, y, w, o) {
    o = o || {};
    const side = o.side === 1 ? 1 : -1, tilt = num(o.tilt), arch = num(o.arch, 0.3), th = o.thick || Math.max(2, w * 0.14);
    const ang = -tilt * 0.55, c = Math.cos(ang), s = Math.sin(ang);
    const raw = [[-w / 2, 0], [-w * 0.2, -arch * w * 0.13], [w * 0.15, -arch * w * 0.16], [w / 2, w * 0.04]];
    const pts = raw.map((p) => [x + side * (p[0] * c - p[1] * s), y + (p[0] * s + p[1] * c)]);
    tk.inkPath(g, pts, { w: th, color: o.color || C.ink, pressure: (u) => 0.28 + 0.72 * Math.pow(Math.sin(PI * clamp(u * 0.85 + 0.06, 0, 1)), 0.9), taperStart: 0.04, taperEnd: 0.12, wobble: 0.03, seed: o.seed | 0, alpha: o.alpha, weightVar: 0 });
  };
  // Eye presets for the cel eye (inner corner drop, lid drop, size): same idea as ART.tk.eyePresets.
  const CEL_EYE = { open: {}, neutral: {}, half: { drop: 0.38 }, sleepy: { drop: 0.5, tilt: -0.12 }, wide: { wide: 1.12 }, determined: { tilt: 0.3, drop: 0.14 }, angry: { tilt: 0.6, drop: 0.2 }, sad: { tilt: -0.5, drop: 0.1 }, smirk: { tilt: 0.22, drop: 0.3 } };
  // The cartoon cel eye of the owners' cards: a round almond of sclera with visible white, a FLAT iris (dark top, lighter lens below with a hard edge, thin dark
  // ring), a big round catchlight and a small one, a thick tapered upper lid with an outer flick, an optional crease and lashes. (x, y) = eye centre in head
  // space, w and h the eye size, side -1 = near (left) eye, outer corner at -x. E: {iris: [top, bottom], ring, sclera, ink, irisW (0.72 of half width), irisH
  // (0.92 of half height), hl: [[dx, dy, r], ...] catchlights in iris radii, lid (line weight), wing 0..1, crease (bool), lashes (0..3), tilt, drop, lowerLine,
  // onEye(g, e, side, st, geom) called with the iris geometry in head space}
  RJ.eyeCel = function (g, e, side, st, E, preset) {
    const w = e.w, h = e.h, pr = CEL_EYE[preset] || CEL_EYE.open;
    const wide = pr.wide || 1, a = w / 2 * wide, b = h / 2 * wide;
    const open = clamp(num(st.open, 1), 0, 1);
    const tilt = pr.tilt !== undefined ? pr.tilt : num(E.tilt), drop = pr.drop !== undefined ? pr.drop : num(E.drop);
    const ink = E.ink || C.ink, lw = E.lid || Math.max(1.4, w * 0.075);
    const yb = (x) => 0.1 * b + 0.9 * b * (1 - (x / a) * (x / a));
    const topPts = [[-a * 0.62, -b * 0.8], [-a * 0.12, -b * 1.0], [a * 0.5, -b * 0.92]];
    const cutY = -b + 2 * b * drop;
    const top = topPts.map((p) => {
      let y = Math.max(p[1], cutY);
      y += tilt * b * 0.5 * (-p[0] / a);
      y = lerp(yb(p[0]), y, open);
      return [p[0], Math.min(y, yb(p[0]) - 0.05 * b)];
    });
    const I = [-a, b * 0.12, 1], O = [a * 1.02, -b * 0.05 - tilt * b * 0.1, 1];
    const shape = [I, top[0], top[1], top[2], O, [a * 0.58, b * 0.68], [0, b * 0.98], [-a * 0.6, b * 0.8]];
    const look = st.look || [0, 0];
    const rx = a * (E.irisW || 0.72), ry = b * (E.irisH || 0.92), icx = num(look[0]) * a * 0.22, icy = b * 0.06 + num(look[1]) * b * 0.16;
    const iris = E.iris || ['#3a2210', '#704520'];
    g.save();
    g.translate(e.x, e.y); if (side < 0) g.scale(-1, 1);
    g.save();
    g.beginPath(); tk.trace(g, shape); g.clip();
    g.fillStyle = E.sclera || '#fffdfa'; g.fillRect(-a * 1.3, -b * 1.3, a * 2.6, b * 2.6);
    // the lid's soft shade across the top of the white
    g.fillStyle = 'rgba(205,160,150,0.30)'; g.beginPath(); g.rect(-a * 1.3, -b * 1.4, a * 2.6, b * 1.4 + top[1][1] + b * 0.5); g.fill();
    // iris: flat dark, lighter lens below with a hard edge
    g.beginPath(); g.ellipse(icx, icy, rx, ry, 0, 0, TAU); g.fillStyle = iris[0]; g.fill();
    g.save(); g.beginPath(); g.ellipse(icx, icy, rx, ry, 0, 0, TAU); g.clip();
    g.beginPath(); g.ellipse(icx, icy + ry * 0.62, rx * 1.08, ry * 0.62, 0, 0, TAU); g.fillStyle = iris[1]; g.fill();
    g.restore();
    g.lineWidth = Math.max(0.8, w * 0.04); g.strokeStyle = E.ring || ink; g.beginPath(); g.ellipse(icx, icy, rx, ry, 0, 0, TAU); g.stroke();
    // catchlights (in iris radii, the big round one then a small one); world-space left, so the sign is flipped for the mirrored eye
    const hl = E.hl || [[-0.38, -0.46, 0.26], [-0.34, -0.1, 0.12]], hs = E.hlSide === undefined ? -1 : E.hlSide;
    g.fillStyle = '#ffffff';
    for (let i = 0; i < hl.length; i++) { g.beginPath(); g.arc(icx + hl[i][0] * rx * (side < 0 ? -1 : 1) * (hs < 0 ? 1 : -1), icy + hl[i][1] * ry, Math.max(0.6, hl[i][2] * rx), 0, TAU); g.fill(); }
    g.restore();
    // ink: heavy upper lid with the outer flick, a crease, lashes, a fine lower lid
    const wing = E.wing === undefined ? 0.6 : E.wing;
    const wx = O[0] + wing * w * 0.3, wy = O[1] - wing * h * 0.22 + tilt * b * -0.05;
    const lashK = E.lash || 1;
    tk.inkPath(g, [[I[0] + a * 0.03, I[1] - b * 0.04], top[0], top[1], top[2], [O[0], O[1]], [wx, wy]], { w: lw * 2.3 * lashK, color: ink, taperStart: 0.2, taperEnd: 0.16, pressure: (u) => 0.4 + 0.75 * Math.pow(u, 0.7), wobble: 0.04, seed: 7, weightVar: 0 });
    if (E.crease) tk.inkPath(g, [[-a * 0.35, top[0][1] - b * 0.38], [a * 0.15, top[1][1] - b * 0.42], [a * 0.62, top[2][1] - b * 0.3]], { w: lw * 0.75, color: E.creaseColor || ink, alpha: 0.9, taper: 0.45, wobble: 0.03, weightVar: 0 });
    const nl = E.lashes | 0;
    for (let i = 0; i < nl; i++) {
      const u = 0.62 + i * 0.17, px = lerp(top[1][0], O[0], u) + a * 0.04, py = lerp(top[1][1], O[1], u) - b * 0.04;
      tk.inkPath(g, [[px, py], [px + a * 0.2, py - b * (0.22 + 0.06 * i)]], { w: lw * 0.8, color: ink, taper: 0.6, wobble: 0, weightVar: 0 });
    }
    if (E.lowerLine !== false) tk.inkPath(g, [[a * 0.7, b * 0.62], [a * 0.3, b * 0.94], [-a * 0.15, b * 1.0], [-a * 0.55, b * 0.84]], { w: lw * 0.55, color: ink, alpha: 0.75, taper: 0.4, wobble: 0.03, weightVar: 0 });
    g.restore();
    if (E.onEye && open > 0.45) E.onEye(g, e, side, st, { cx: e.x + (side < 0 ? -icx : icx), cy: e.y + icy, rx, ry, a, b });
  };
  // the '> <' hurt eye: a slightly curved chevron with round ends, kept inside the eye box (thin like the lids of the other eyes, not a slab)
  RJ.hurtEye = function (g, e, side, E) {
    E = E || {};
    const a = e.w / 2, b = e.h / 2, lw = E.hurtLine || Math.max(2.2, e.w * 0.1);
    g.save(); g.translate(e.x, e.y); if (side < 0) g.scale(-1, 1);
    g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = E.ink || C.ink; g.lineWidth = lw;
    g.beginPath(); g.moveTo(a * 0.78, -b * 0.6); g.quadraticCurveTo(a * 0.12, -b * 0.38, -a * 0.58, b * 0.02); g.quadraticCurveTo(a * 0.12, b * 0.4, a * 0.78, b * 0.62); g.stroke();
    g.restore();
  };
  // One eye. e = {x, y, w, h}, side -1 = near (left) eye, +1 far. Closed, happy and hurt use the toolkit's inked arcs; the rest use the cel eye above
  // (set F.eye.style = 'tk' to force ART.tk.eye's glossy gradient eye instead).
  RJ.eye = function (g, e, side, st, F) {
    const E = F.eye || {};
    let preset = st.eyes === 'open' || !st.eyes ? (E.expr || 'neutral') : st.eyes;
    if (preset === 'closed' && E.closedExpr) preset = E.closedExpr;
    const isArc = preset === 'happy' || preset === 'closed' || preset === 'hurt';
    if (preset === 'hurt') { RJ.hurtEye(g, e, side, E); return; }
    if (!isArc && E.style !== 'tk') { RJ.eyeCel(g, e, side, st, E, preset); return; }
    const o = {
      expr: preset, side, open: st.eyes === 'open' || !st.eyes || preset === (E.expr || 'neutral') ? st.open : 1, look: st.look,
      iris: E.iris, pupil: E.pupil, ring: E.ring, sclera: E.sclera || '#fffaf4', ink: E.ink || C.ink, lineW: E.lineW || (isArc ? Math.max(1.1, e.w * 0.085) * 0.78 : undefined), lash: E.lash,
      wing: E.wing, catch: E.catch, catchSide: E.catchSide === undefined ? -1 : E.catchSide, star: E.star, lashes: E.lashes,
    };
    if (preset === (E.expr || 'neutral')) { if (E.tilt !== undefined) o.tilt = E.tilt; if (E.drop !== undefined) o.drop = E.drop; }
    tk.eye(g, e.x, e.y, e.w, e.h, o);
    if (!isArc && E.onEye && o.open > 0.45) E.onEye(g, e, side, st, null);
  };
  // the nose: a tiny curved ink tick on the face centreline (the cards draw nothing more), s = face size hint
  RJ.noseTick = function (g, x, y, s) {
    const k = clamp(num(s, 60) / 60, 0.5, 2);
    tk.inkPath(g, [[x - 0.6 * k, y - 2.6 * k], [x + 1.5 * k, y + 0.2 * k], [x + 0.3 * k, y + 2.3 * k]], { w: 1.25 * k, color: C.ink, alpha: 0.7, taper: 0.5, wobble: 0, weightVar: 0 });
  };
  // The whole face from spec.face, in head space. F: {eyes: [near {x,y,w,h}, far {x,y,w,h}], brows: [[x,y,w], [x,y,w]], browStyle: {color, thick, arch},
  //   nose: [x,y,size], mouth: [x,y,w], mouthStyle: {...}, blush: [[x,y,w],[x,y,w]], blushColor, eye: {iris, pupil, ring, sclera, expr, tilt, drop,
  //   lineW, lash, wing, catch, catchSide, closedExpr, onEye(g, e, side, st)}}. Draws blush, nose, eyes, brows, mouth in that order.
  RJ.drawFace = function (g, S) {
    const F = S.spec.face, st = S.face;
    if (!F) return;
    const bl = F.blush || [];
    for (let i = 0; i < bl.length; i++) tk.blush(g, bl[i][0], bl[i][1], bl[i][2] * clamp(st.blush, 0.2, 1.8), { color: F.blushColor || C.blush, alpha: clamp(0.22 * st.blush + 0.06, 0.04, 0.5) });
    if (F.nose) RJ.noseTick(g, F.nose[0], F.nose[1], F.nose[2] || 60);
    const es = F.eyes || [];
    if (es[0]) RJ.eye(g, es[0], -1, st, F);
    if (es[1]) RJ.eye(g, es[1], 1, st, F);
    const br = F.brows || [], bs = F.browStyle || {};
    for (let i = 0; i < br.length; i++) {
      const sd = i === 0 ? -1 : 1;
      RJ.brow(g, br[i][0], br[i][1] + st.browY + (F.browLift || 0), br[i][2], { side: sd, tilt: st.brow * (bs.tiltK === undefined ? 1 : bs.tiltK) + (bs.tilt || 0), arch: bs.arch === undefined ? 0.4 : bs.arch, thick: bs.thick, color: bs.color || C.ink, seed: i });
    }
    if (F.mouth) RJ.mouth(g, F.mouth[0], F.mouth[1], F.mouth[2], st.mouth, F.mouthStyle);
    if (st.sweat > 0.3 && F.sweat) RJ.fxSweat(g, F.sweat[0], F.sweat[1], F.sweat[2] || 5);
  };

  // ----------------------------------------------------------------------------------------------------------------------------------
  // effects (figure space, drawn last)
  // ----------------------------------------------------------------------------------------------------------------------------------
  const FX = (RJ.fx = {});
  FX.sweat = RJ.fxSweat;
  // rising music notes from (x, y): t seconds, col fill colour, n notes
  FX.notes = function (g, x, y, t, col, n) {
    n = n || 3;
    for (let i = 0; i < n; i++) {
      const u = fr(num(t) * 0.55 + i / n), a = Math.sin(PI * u), px = x + 34 + i * 10 + Math.sin(u * 5 + i * 2) * 5 + u * 16, py = y - 6 - u * 44 - i * 5, sz = 11 + (i % 2) * 3;
      const kind = i % 2 ? 'beamed' : 'eighth', rot = Math.sin(u * 4 + i) * 0.25;
      tk.note(g, px, py, sz * 1.22, { kind, color: C.ink, alpha: a * 0.95, rot, line: Math.max(2.6, sz * 0.26) });
      tk.note(g, px, py, sz, { kind, color: col, alpha: a, rot });
    }
  };
  // directional sound arcs from (x, y) toward ang: three arcs that expand and fade
  FX.arcs = function (g, x, y, ang, t, col, n) {
    n = n || 3;
    g.save(); g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const u = fr(num(t) * 1.3 + i / n), r = 14 + u * 36, a = Math.sin(PI * Math.min(1, u * 1.15)) * 0.95, sp = 0.62 - u * 0.12;
      g.globalAlpha = a; g.strokeStyle = C.ink; g.lineWidth = 6.2 - u * 2; g.beginPath(); g.arc(x, y, r, ang - sp, ang + sp); g.stroke();
      g.strokeStyle = col; g.lineWidth = 3.4 - u * 1.4; g.beginPath(); g.arc(x, y, r, ang - sp, ang + sp); g.stroke();
    }
    g.restore();
  };
  // a comic impact burst: jagged star in col with a light core, centre (x, y), radius r, rotation by t for a little life
  FX.burst = function (g, x, y, r, col, light, t) {
    const n = 11, pts = [], rot = 0.2 + Math.sin(num(t) * 9) * 0.05;
    for (let i = 0; i < n * 2; i++) { const a = rot + (i / (n * 2)) * TAU, rr = i % 2 ? r * 0.55 : r * (0.92 + 0.14 * Math.sin(i * 2.3)); pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr, 1]); }
    RJ.cel(g, pts, col, { shadow: RJ.shade(col, 0.1), line: LINE.main, tension: 0, depth: r * 0.14 });
    RJ.cel(g, tk.circlePts(x, y, r * 0.38, 10), light, { shadow: false, line: false });
  };
  // star sparkles around (x, y): list of [dx, dy, r, rot], colour, t twinkle
  FX.sparkles = function (g, x, y, list, col, t) {
    for (let i = 0; i < list.length; i++) {
      const p = list[i], tw = 0.75 + 0.25 * Math.sin(num(t) * 4.2 + i * 1.9);
      tk.sparkle(g, x + p[0], y + p[1], p[2] * tw, { color: col || '#ffffff', rot: p[3] || 0, glow: 0.35, thin: 0.2 });
    }
  };
  FX.hearts = function (g, x, y, t, col) {
    for (let i = 0; i < 3; i++) {
      const u = fr(num(t) * 0.5 + i / 3), a = Math.sin(PI * u), px = x + (i - 1) * 14 + Math.sin(u * 4 + i) * 4, py = y - u * 40, s = 5 + i;
      g.save(); g.globalAlpha = a;
      RJ.cel(g, [[px, py + s * 1.1, 1], [px - s * 1.2, py - s * 0.1], [px - s * 0.6, py - s * 0.9], [px, py - s * 0.4], [px + s * 0.6, py - s * 0.9], [px + s * 1.2, py - s * 0.1]], col, { line: LINE.fine + 0.3, depth: 2 });
      g.restore();
    }
  };
  // little 'hit' stars (hurt): three four-point stars orbiting (x, y)
  FX.stars = function (g, x, y, t, col) {
    for (let i = 0; i < 3; i++) { const a = num(t) * 3 + i * TAU / 3; tk.sparkle(g, x + Math.cos(a) * 24, y + Math.sin(a) * 8, 5.5, { color: col || '#ffe45e', glow: 0.2 }); }
  };
  RJ.fxDraw = function (g, S, name) {
    const A = S.A, pt = S.pt, t = S.t;
    if (name === 'notes') FX.notes(g, pt.micHead[0], pt.micHead[1] - 6, t, A.main, 3);
    else if (name === 'arcs') FX.arcs(g, pt.micHead[0], pt.micHead[1], S.P.micFace, t, A.main, 3);
    else if (name === 'burst') FX.burst(g, pt.micHead[0] + 46, pt.micHead[1] + 2, 18 + 8 * S.beat, A.main, A.light, t);   // clear of the far eye even when the mic sits at the mouth
    else if (name === 'sparkles') FX.sparkles(g, pt.head[0], pt.head[1], [[58, -52, 7, 0.3], [78, -12, 5, 0], [64, 28, 4, 0.4], [-60, -44, 5, 0.2]], A.glow, t);
    else if (name === 'sparkleMic') FX.sparkles(g, pt.micHead[0], pt.micHead[1], [[22, -18, 7, 0.2], [34, 6, 4.5, 0], [16, 22, 4, 0.5], [44, -26, 4, 0.1]], '#ffffff', t);
    else if (name === 'hearts') FX.hearts(g, pt.head[0] + 80, pt.head[1] - 36, t, A.main);
    else if (name === 'stars') FX.stars(g, pt.head[0], pt.head[1] - 74, t, '#ffe45e');
    else if (name === 'sweat') { /* drawn inside the face */ }
  };

  // ----------------------------------------------------------------------------------------------------------------------------------
  // the pose system
  // ----------------------------------------------------------------------------------------------------------------------------------
  // Skeleton at rest (figure space). Override per character with spec.skel.
  RJ.SKEL = { hip: [0, -78], neck: [0, -146], headC: [2, -204], shF: [26, -131], shB: [-26, -131], hipF: [15, -72], hipB: [-15, -72], arm: [23, 21] };
  // Every number or name a pose table may set. Angles are radians, + is clockwise on screen, px are at s = 1.
  RJ.BASE_POSE = {
    bx: 0, by: 0, lean: 0, squash: 1, legDy: 0,                  // whole body offset, lean about the feet, vertical squash, legs bob
    torsoDx: 0, torsoDy: 0, torsoRot: 0, breath: 1,
    headRot: 0, headDx: 0, headDy: 0, headScale: 1,
    // the front (mic) arm. mic: 'mouth' (mic head near the mouth: micDx/micDy offset in head space), 'hand' (hand target fHand relative to the
    // front shoulder, the mic hangs from it) or 'none'. micAng = direction head -> tail. micGrip = px from the head centre to the grip.
    mic: 'mouth', micAng: 1.05, micDx: 14, micDy: 8, micGrip: 24, micFace: 0,
    fHand: [14, 40], fBend: 1, fKind: 'fist', fRot: 0, fSpread: 1,
    // the back (free) arm. bFront 1 draws it over the torso.
    bHand: [-12, 40], bBend: 1, bKind: 'relaxed', bRot: 0, bSpread: 1, bFront: 0,
    // feet: ankle targets in figure space (y -12 = standing), toe rotation
    fFoot: [24, -12], bFoot: [-22, -12], fFootRot: 0, bFootRot: 0,
    eyes: 'open', mouth: 'smile', brow: 0, browY: 0, blush: 1, sweat: 0, look: [0.3, 0],
    fx: [], flare: 0, hair: 0,
  };
  // idle motion per pose (added on top of the table by RJ.resolve): bob px at period s, sway rad, head rad, beat (0..1 amplitude) at beatHz, shake px, jump px at hz
  RJ.LIFE = {
    idle: { bob: 1.1, per: 3.2, sway: 0.012, head: 0.016 },
    sing: { bob: 1.6, per: 2.0, sway: 0.03, head: 0.035 },
    attack: { bob: 0.8, per: 1.2, sway: 0.01, head: 0.01, beat: 1, beatHz: 2.6 },
    hurt: { bob: 0.5, per: 1.6, shake: 1.6, head: 0.02 },
    cheer: { bob: 0.8, per: 0.9, sway: 0.02, head: 0.025, jump: 14, jumpHz: 1.7 },
  };
  // The final numbers for (pose, t, expr): base + table + idle life + expression override. Returns a fresh object plus {sway, beat, open, face}.
  RJ.resolve = function (spec, pose, t, expr) {
    const poses = spec.poses || {}, pn = has(poses, pose) && poses[pose] ? pose : 'idle';
    const P = Object.assign({}, RJ.BASE_POSE, spec.base, poses[pn]);
    P.pose = pn;
    const m = tk.motion(), ph = tk.vary(spec.id, 'life') * TAU, L = Object.assign({}, has(RJ.LIFE, pn) ? RJ.LIFE[pn] : RJ.LIFE.idle, has(spec.life, pn) ? spec.life[pn] : null);
    t = num(t);
    const w = TAU * t;
    P.sway = Math.sin(w / 2.6 + ph) * m;
    const breath = Math.sin(w / (L.per || 3.2) + ph);
    P.torsoDy += (L.bob || 0) * breath * m;
    P.legDy += (L.bob || 0) * breath * 0.25 * m;
    P.breath *= 1 + 0.006 * breath * m;
    P.lean += (L.sway || 0) * Math.sin(w / 4.1 + ph + 1) * m;
    P.headRot += (L.head || 0) * Math.sin(w / 3.7 + ph + 2) * m;
    P.headDy += 0.5 * breath * m;
    P.beat = 0;
    if (L.beat) {
      const b = Math.pow(Math.abs(Math.sin(PI * t * (L.beatHz || 2))), 3);       // sharp pulses on the beat
      P.beat = b * m;
      P.torsoDy += 3.6 * b * L.beat * m; P.headDy += 3 * b * L.beat * m; P.headRot += 0.05 * b * L.beat * m; P.lean += 0.02 * b * L.beat * m;
      P.fHand = [P.fHand[0] + 2.5 * b * m, P.fHand[1]]; P.micDx += 1.5 * b * m;
    }
    if (L.shake) { P.bx += L.shake * Math.sin(t * 46) * m; P.headRot += 0.025 * Math.sin(t * 38) * m; }
    if (L.jump) {
      const j = Math.abs(Math.sin(PI * t * (L.jumpHz || 1.6))) * L.jump * m;
      P.by -= j; P.fFoot = [P.fFoot[0], P.fFoot[1] - 0.6 * j]; P.bFoot = [P.bFoot[0], P.bFoot[1] - 0.6 * j];     // ankles tuck up in the air
      P.squash *= 1 - 0.03 * (1 - j / (L.jump * m || 1)) * m;                                                  // and squash a little on landing
    }
    P.hairSwing = P.sway + P.lean * -6 + (P.beat || 0) * -0.4;
    // face
    const ex = expr && (has(spec.exprs, expr) ? spec.exprs[expr] : has(RJ.EXPR, expr) ? RJ.EXPR[expr] : null);
    if (ex) for (const k in ex) P[k] = ex[k];
    P.open = P.eyes === 'open' ? RJ.blinkOpen(t, spec.id) : 1;
    return P;
  };

  // matrices and live points for a resolved pose
  RJ.layout = function (spec, P) {
    const SK = spec.skel, F = spec.face || {};
    const root = mat.local(0, 0, P.bx, P.by, P.lean, 1, P.squash);
    const hips = mat.mul(root, mat.local(0, 0, 0, P.legDy, 0, 1, 1));
    const torso = mat.mul(root, mat.local(SK.hip[0], SK.hip[1], P.torsoDx, P.torsoDy, P.torsoRot, 1, P.breath));
    const neck = mat.mul(torso, mat.local(SK.neck[0], SK.neck[1], P.headDx, P.headDy, P.headRot, P.headScale, P.headScale));
    const head = mat.mul(neck, [1, 0, 0, 1, SK.headC[0], SK.headC[1]]);
    const mo = F.mouth || [10, 38, 20];
    const pt = {
      head: mat.pt(head, 0, 0), mouth: mat.pt(head, mo[0], mo[1]), shF: mat.pt(torso, SK.shF[0], SK.shF[1]), shB: mat.pt(torso, SK.shB[0], SK.shB[1]),
      hipF: mat.pt(hips, SK.hipF[0], SK.hipF[1]), hipB: mat.pt(hips, SK.hipB[0], SK.hipB[1]), feet: [P.bx, P.by], chest: mat.pt(torso, 0, -112),
    };
    // front hand and mic head
    const M = spec.mic || {}, grip = P.micGrip, dir = [Math.cos(P.micAng), Math.sin(P.micAng)];
    if (P.mic === 'mouth') {
      pt.micHead = mat.pt(head, mo[0] + P.micDx, mo[1] + P.micDy);
      pt.hand = [pt.micHead[0] + dir[0] * grip, pt.micHead[1] + dir[1] * grip];
    } else {
      pt.hand = [pt.shF[0] + P.fHand[0], pt.shF[1] + P.fHand[1]];
      pt.micHead = [pt.hand[0] - dir[0] * grip, pt.hand[1] - dir[1] * grip];
    }
    pt.mic = pt.micHead;
    return { root, hips, torso, neck, head, pt, M };
  };

  // ----------------------------------------------------------------------------------------------------------------------------------
  // the rig: turns a spec into {draw, bust, bounds, points}
  // ----------------------------------------------------------------------------------------------------------------------------------
  // spec: {id, accent (key of RJ.ACCENT), skel, base, poses, life, exprs, face, arm: {l, w, skin, skinSh, sleeve, hand: {skin, shade}},
  //   legs: {w, color, shade, skin, sock, shoe, pantsOver, bow, profile(u), decor(g, hip, ankle, mid)}, mic: {accent, headR, len, bands}, layers, bust: {rect: [x0, y0, x1, y1], pose},
  //   bounds: {w, h}, shadow: false to skip the ground shadow}
  RJ.rig = function (spec) {
    spec.skel = Object.assign({}, RJ.SKEL, spec.skel);
    spec.poses = spec.poses || { idle: {} };
    spec.layers = spec.layers || {};
    const A = RJ.accent(spec.accent || spec.id);
    const bounds = Object.assign({ w: 150, h: 300 }, spec.bounds);
    // a centred box by default; x0 and x1 may be given for a figure whose reach is lopsided (a long ponytail), then w is x1 - x0
    if (!(typeof bounds.x0 === 'number' && typeof bounds.x1 === 'number' && bounds.x1 > bounds.x0)) { bounds.x0 = -bounds.w / 2; bounds.x1 = bounds.w / 2; } else bounds.w = bounds.x1 - bounds.x0;
    bounds.y0 = -bounds.h; bounds.y1 = 0;

    // draw one layer in the space of matrix M (null = figure space), balanced even on error
    function layer(g, M, fn, S) {
      if (!fn) return;
      g.save();
      try { if (M) g.transform(M[0], M[1], M[2], M[3], M[4], M[5]); fn(g, S); } finally { g.restore(); }
    }
    function makeS(g, t, P, Lay) {
      return {
        g, t, P, spec, C, A, k: 1, M: Lay, pt: Lay.pt, sway: P.sway, beat: P.beat || 0,
        face: { eyes: P.eyes, mouth: P.mouth, brow: P.brow, browY: P.browY, blush: P.blush, look: P.look, open: P.open, sweat: P.sweat },
      };
    }
    function arm(g, S, front) {
      const P = S.P, pt = S.pt, ar = spec.arm || {}, hs = ar.hand || {}, ml = spec.mic || {};
      const sh = front ? pt.shF : pt.shB;
      const A2 = { s: sh, t: front ? pt.hand : [pt.shB[0] + P.bHand[0], pt.shB[1] + P.bHand[1]], bend: front ? P.fBend : P.bBend, l: ar.l, w: ar.w, skin: ar.skin, skinSh: ar.skinSh, sleeve: ar.sleeve, cuff: ar.cuff };
      if (front && P.mic !== 'none') {
        A2.mid = (gg) => RJ.mic(gg, pt.micHead[0], pt.micHead[1], P.micAng, { accent: ml.accent || A.main, headR: ml.headR, len: ml.len, bands: ml.bands });
        A2.hand = (gg, w) => RJ.fistOnMic(gg, w[0], w[1], P.micAng, hs);
      } else {
        const kind = front ? P.fKind : P.bKind, rot = front ? P.fRot : P.bRot, spread = front ? P.fSpread : P.bSpread;
        A2.hand = (gg, w, ang) => RJ.hand(gg, kind, w[0], w[1], ang + rot, Object.assign({ spread }, hs));
        if (!ar.noFold && !ar.cuff && (hs.skin || C.skin) === (ar.skin || C.skin)) A2.parts = { kind, rot, o: Object.assign({ spread }, hs) };   // folded into the arm only when the hand matches the arm's colour
      }
      return RJ.drawArm(g, A2);
    }
    function legs(g, S) {
      const P = S.P, pt = S.pt, lg = spec.legs || {};
      const one = (hip, ankle, rot, sign) => RJ.drawLeg(g, { hip, ankle, rot, w: lg.w, color: lg.color, shade: lg.shade, sock: lg.sock, shoe: lg.shoe, pantsOver: lg.pantsOver, decor: lg.decor, profile: lg.profile, bow: lg.bow === undefined ? 2 : lg.bow * sign });
      one(pt.hipB, [P.bx + P.bFoot[0], P.by + P.bFoot[1]], P.bFootRot, 0.8);
      one(pt.hipF, [P.bx + P.fFoot[0], P.by + P.fFoot[1]], P.fFootRot, 1);
    }
    function render(g, n, o) {
      o = o || {};
      const P = RJ.resolve(spec, n.pose, n.t, n.expr), Lay = RJ.layout(spec, P), S = makeS(g, n.t, P, Lay), L = spec.layers;
      if (!o.noShadow && spec.shadow !== false) {
        const j = clamp(-P.by / 40, 0, 1), rx = 40 * (1 - 0.22 * j), ry = 7.5 * (1 - 0.2 * j);
        g.save(); g.fillStyle = 'rgba(20,6,40,' + (0.3 - 0.1 * j).toFixed(3) + ')'; g.beginPath(); g.ellipse(P.bx * 0.9 + 2, 1.5, rx, ry, 0, 0, TAU); g.fill(); g.restore();
      }
      layer(g, Lay.head, L.backHair, S);
      if (!P.bFront) arm(g, S, false);
      legs(g, S);
      layer(g, Lay.torso, L.torso, S);
      if (P.bFront) arm(g, S, false);
      layer(g, Lay.head, L.mid, S);
      layer(g, Lay.head, L.head, S);
      arm(g, S, true);
      layer(g, Lay.torso, L.over, S);
      layer(g, Lay.head, L.top, S);
      if (!o.noFx) {
        const fxs = Array.isArray(P.fx) ? P.fx : [];
        for (let i = 0; i < fxs.length; i++) { g.save(); try { RJ.fxDraw(g, S, fxs[i]); if (L.fx) L.fx(g, S, fxs[i]); } finally { g.restore(); } }
      }
    }
    const impl = {
      bounds,
      draw(ctx, o) { RJ.frame(ctx, o, (g, n) => render(g, n)); },
      // portrait crop. Sizes are validated and the box is clipped here too, so calling RJ.chars[id].bust(ctx, w, h) directly is safe. spec.bust.rect is the
      // preferred crop (head and shoulders, covers the box). spec.bust.face is the rectangle that must stay fully visible (the head): when the box is short or
      // wide the zoom is reduced until the face fits with 10% to spare, centred on the face, instead of cutting through it.
      bust(ctx, w, h, o) {
        if (!ctx) return;
        w = num(w, 300); h = num(h, 400);
        if (!(w > 0 && h > 0)) return;
        o = o || {};
        const bs = spec.bust || {}, R = bs.rect || [-80, -300, 80, -80], rw = R[2] - R[0], rh = R[3] - R[1], F = bs.face;
        let k = Math.max(w / rw, h / rh), tx = w / 2 - (R[0] + R[2]) / 2 * k, ty = -R[1] * k;
        if (F) {
          const fw = F[2] - F[0], fh = F[3] - F[1];
          k = Math.min(k, Math.min(w / fw, h / fh) / 1.1);
          const fcx = (F[0] + F[2]) / 2, fcy = (F[1] + F[3]) / 2, hx = fw / 2 * k * 1.05, hy = fh / 2 * k * 1.05;
          const x0 = hx - fcx * k, x1 = w - hx - fcx * k, y0 = hy - fcy * k, y1 = h - hy - fcy * k;
          tx = clamp(tx, Math.min(x0, x1), Math.max(x0, x1));                                  // keeps the face inside the box horizontally
          ty = h < rh * k - 0.5 ? h * 0.46 - fcy * k : ty;                                     // a short box: face centre near 46% of the height
          ty = clamp(ty, Math.min(y0, y1), Math.max(y0, y1));                                  // and vertically (top anchored when it all fits)
        }
        ctx.save();
        try {
          ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
          ctx.translate(tx, ty); ctx.scale(k, k);
          render(ctx, RJ.norm({ pose: o.pose || bs.pose || 'idle', t: o.t, expr: o.expr || bs.expr }), { noShadow: true, noFx: true });
        } finally { ctx.restore(); }
      },
      points(o) {
        const n = RJ.norm(o), P = RJ.resolve(spec, n.pose, n.t, n.expr), Lay = RJ.layout(spec, P), out = {};
        for (const k in Lay.pt) { const p = Lay.pt[k]; out[k] = [n.x + p[0] * n.s * (n.flip ? -1 : 1), n.y + p[1] * n.s]; }
        return out;
      },
    };
    return impl;
  };
})();

// roxor.js: RoxorLoops (id 'roxor', accent GREEN) and his monster-onesie variant ('roxor_monster'). Built on kit.js (RJ.rig).
// Beatbox and support hero. Identity: tall swooping mohawk pushed up and forward, shaved stubble sides, a short mullet tail, pale blue-grey
// cheeky eyes, smirk with a flash of teeth, black tee with an orange smiley, olive pants, lime sneakers, black mic with a green band.
// The face, the stubble, the mohawk and the mullet are shared by both variants (makeRoxor(variant)); the variant swaps outfit and hood.
(function () {
  'use strict';
  const tk = ART.tk, C = RJ.C, LINE = RJ.LINE;
  const TAU = Math.PI * 2;

  const H = {
    hair: '#6b3a22', hairSh: '#3a1d0f', streak: '#a0522d', hairHi: '#8f4b2a',
    stub: '#9a6a50', stubDk: '#7a4e38',
    tee: '#463a32', teeSh: '#2c241f', teeHi: '#6a5b4f',
    orange: '#ffb44d', orangeSh: '#f19a2d',
    pants: '#7fa631', pantsSh: '#5a7f20',
    shoe: '#d6ed6b', shoeSole: '#f2f9b4', shoeSh: '#a9c24a',
    iris: ['#4c5d7e', '#7f93b8'],
    fur: '#41741f', furSh: '#2c5014', furLt: '#5b9230', furDk: '#27470f', horn: '#f6d5a2', hornSh: '#dba56a',
  };

  // ---- shapes in head space (origin = head centre, face turned +x). Measured against the owners' card, one unit = 1/118 of the head width. ----
  // the hairline between the face and the shaved side (the stubble crescent lies to the left of it)
  const HAIRLINE = [[-17, -50], [-22.5, -45], [-27.5, -39], [-31.5, -32], [-35, -25], [-38, -15], [-40.2, -6], [-41.3, 3], [-41.5, 12], [-40.5, 22]];
  function polyFrom(curve, tail) {
    const f = tk.flatten(curve, { closed: false, step: 2.5 }), out = [];
    for (let i = 0; i < f.length; i += 2) out.push([f[i], f[i + 1]]);
    return { poly: out.concat(tail) };
  }
  // the skin region: everything to the right of the hairline (extends past the skull, which clips it)
  const FACE_REGION = polyFrom(HAIRLINE, [[-72, 30], [-72, 94], [94, 94], [94, -84], [-17, -84]]);
  // the hair's lower edge: the stubble's top edge, the dome peak at x = -16, the long slope down to the front tongue (28, -31), then up the right side
  const MASS_LOW = [[47, -46], [44, -43.5], [40, -42.5], [36, -40.5], [32.5, -38.5], [31.2, -34], [30, -32.5], [28.5, -31.8, 1], [24, -31.8], [20, -32.7], [16.5, -34.2], [12, -35.4], [8, -37], [4, -40], [0, -43.5], [-3, -45.5], [-6, -48], [-10, -47.8], [-14, -48.4], [-17, -50], [-20, -51.2], [-26, -52.4], [-35, -51.6], [-44.5, -48.8], [-54, -41]];
  // the swept-up quiff, measured on the owners' card: a back swoosh that hooks up at the left, then four tall flame locks that each rise with a long convex
  // right edge and curl their tip back to the left, and a front lock that hangs in a curled point at the forehead. Points [x, y, 1] are sharp corners (tips and
  // the V-notches between the locks). The base runs straight out of the shaved side's top edge, so there is no step on the left. Closed by MASS_LOW.
  const CREST_TOP = [
    [-56.5, -38.5], [-55.5, -45], [-52, -52], [-46, -58.5], [-39.5, -63.5], [-33, -67.5], [-28.5, -71.5], [-26.8, -76.5], [-27.2, -80.8], [-29.2, -83.4, 1],   // back swoosh and its hooked tip
    [-25.2, -83.6], [-22, -80.5], [-19.5, -76.5], [-17.3, -72.5, 1],                                                                                          // the hook's inner curl, first valley
    [-18.6, -79], [-19.6, -85], [-18.8, -88.6, 1],                                                                                                            // lock A rising to its tip
    [-14.3, -91.4], [-10.4, -92.5], [-6.3, -92.1], [-2.7, -89.6], [0.2, -86, 1],                                                                              // lock A top, valley
    [1.8, -90.5], [0.6, -94.5], [-1.4, -97.8, 1],                                                                                                             // lock B (tallest) left edge to its tip
    [3.7, -96.9], [8.9, -93.7], [14.8, -89], [19, -84], [20.8, -82, 1],                                                                                       // lock B top, valley
    [21.2, -91], [19.2, -95.5], [17.2, -98.5, 1],                                                                                                             // lock C
    [24.3, -96.4], [29.5, -90.5], [33.3, -85], [35.6, -79.5], [36, -77, 1],                                                                                   // lock C top, valley
    [36.2, -83], [36.4, -88], [36.6, -89.8, 1],                                                                                                               // lock D
    [41, -89.2], [45.6, -84.6], [49.2, -76], [50.8, -66], [50.2, -57], [48.5, -51],                                                                           // lock D top and the crest's front edge
  ];
  // stretch the crest upward a little (above the mass) so the silhouette survives thumbnail sizes
  const STRETCH = (p) => (p[1] < -62 ? [p[0], -62 + (p[1] + 62) * 1.06].concat(p.slice(2)) : p);
  const HAIR_OUTLINE = CREST_TOP.map(STRETCH).concat(MASS_LOW);
  // the hard shadow of the hair: the swoosh's underside and a flank on the left of each lock
  const SHADOW_FLAMES = [
    [[-56.5, -38.5], [-55.5, -45], [-52, -52], [-46, -58.5], [-39.5, -63.5], [-33, -67.5], [-28.5, -71.5], [-26, -62], [-32, -56], [-43, -50], [-52, -43]],
    [[-19.6, -85], [-18.8, -88.6], [-14.3, -91.4], [-16.5, -80], [-17.3, -72.5], [-18.6, -79]],
    [[0.2, -86], [1.8, -90.5], [0.6, -94.5], [-1.4, -97.8], [3.7, -96.9], [2, -88], [-2, -76], [-5, -64], [-3, -52], [-6, -58], [-8, -70], [-4, -80]],
    [[20.8, -82], [21.2, -91], [19.2, -95.5], [17.2, -98.5], [22, -96], [24, -86], [21, -72], [17, -60], [14, -68], [18, -78]],
    [[36, -77], [36.2, -83], [36.6, -89.8], [39, -88], [40, -80], [36, -66], [30, -58], [33, -70]],
  ];
  // the thin highlight bands along the upper third of each lock's top edge
  const HAIR_LIGHT = [
    [[-14.3, -91.4], [-10.4, -92.5], [-6.3, -92.1], [-2.7, -89.6], [-5, -87.5], [-9.5, -89.5], [-14, -88.5]],
    [[3.7, -96.9], [8.9, -93.7], [14.8, -89], [13, -86], [8, -90], [3, -93.5]],
    [[24.3, -96.4], [29.5, -90.5], [33.3, -85], [31, -83], [27.5, -88], [23, -93.5]],
    [[41, -89.2], [45.6, -84.6], [49.2, -76], [47, -76], [44, -83], [40, -86]],
  ];
  // the lock separation lines: they start at the valleys and flow down into the hair mass in S curves
  const VALLEYS = [
    [[-17.3, -72.5], [-19.5, -65], [-20, -57], [-17.5, -51]],
    [[0.2, -86], [-2.5, -77], [-6.5, -68], [-8.5, -60], [-5.5, -53], [-3, -47.5]],
    [[20.8, -82], [14.5, -77], [9, -69], [6, -60], [7, -51], [11, -43], [14, -37.5]],
    [[36, -77], [30, -70], [25.5, -62], [22, -53], [20, -45], [21, -39]],
    [[-9, -75], [-12.5, -66], [-13, -58]],
    [[27, -86], [24, -72], [20, -62], [16, -56]],
    [[-1, -66], [3, -58], [4, -49]],
  ];
  // the mullet: four wavy locks that drop from behind the ear to the collar, each with a sideways S-bend and a tip flicked outward to the left
  const MULLET = [
    { sp: [[-44, 20], [-54, 31], [-55, 43], [-61, 53], [-69, 56]], w: 17 },
    { sp: [[-40, 25], [-49, 37], [-46, 51], [-53, 63], [-61, 68]], w: 16 },
    { sp: [[-34, 28], [-41, 40], [-36, 53], [-41, 64], [-49, 68]], w: 15 },
    { sp: [[-27, 31], [-34, 42], [-28, 52], [-25, 60], [-18, 60]], w: 13 },
  ];

  function lockDraw(g, L, base, sw, o) {
    // the mullet locks use the ribbon's default taper: wide root, rounded swell, a tip that flicks out
    RJ.lock(g, L.sp, base, Object.assign({ wMax: L.w, w0: L.w * 0.7, w1: 0, tipPow: 1.5, bend: sw, strands: 1, shadow: H.hairSh, glossColor: H.streak, glossAlpha: 0.55, line: LINE.main }, o));
  }
  function mohawk(g, S, col, sh, scale, hi, streak) {
    g.save();
    if (scale) g.scale(scale, scale);
    RJ.cel(g, HAIR_OUTLINE, col, { shadow: false, line: LINE.main, tension: 0.7, weightVar: 0.4, decor: (gg) => {
      SHADOW_FLAMES.forEach((f, i) => RJ.fillPts(gg, f.map(STRETCH), sh, i === 0 ? 0.95 : 0.55));
      HAIR_LIGHT.forEach((f) => RJ.fillPts(gg, f.map(STRETCH), hi || H.hairHi, 0.7));
      VALLEYS.forEach((v, i) => RJ.ink(gg, v.map(STRETCH), { w: LINE.main * (i < 4 ? 1.2 : 0.85), color: C.ink, taper: 0.4, pressure: 'head', wobble: 0.03, seed: i }));
      // the card's orange-brown hatching: short light strokes clustered on the middle of each lock
      const hat = [[-9, -80, -8, -75], [-7, -82, -6, -77], [-5, -80, -4, -74], [3, -75, 5, -69], [6, -77, 8, -70], [9, -79, 11, -72], [17, -74, 18, -67], [20, -76, 22, -69], [24, -72, 25, -65],
        [31, -72, 32, -65], [34, -70, 35, -63], [46, -66, 47, -58], [-8, -66, -7, -60], [1, -60, 2, -54], [13, -60, 14, -54], [-38, -60, -33, -56]];
      hat.forEach((h, i) => RJ.ink(gg, [STRETCH([h[0], h[1]]), STRETCH([h[2], h[3]])], { w: 1.3, color: streak || H.streak, taper: 0.5, wobble: 0, alpha: 0.85, seed: i }));
    } });
    RJ.ink(g, MASS_LOW, { w: LINE.main + 0.2, color: C.ink, taper: 0.1, pressure: 'flat', wobble: 0.03 });
    g.restore();
  }

  // Roxor's own skull: leaner than the default round one, an egg with the chin pulled toward the front (+x) and a lighter jaw
  const ROX_SKULL = [[-2, -58], [30, -53], [52, -34], [60, -4], [57, 24], [45, 45], [29, 57], [12, 60], [-6, 56], [-26, 46], [-47, 29], [-61, -1], [-58, -33], [-40, -52]];

  // the shaved skull, face and features. mon = monster variant: no stubble (the hood covers the sides).
  function faceBase(g, S, mon) {
    const skull = mon ? RJ.SKULL : ROX_SKULL;
    g.save();
    g.beginPath(); tk.trace(g, skull); g.clip();
    g.fillStyle = H.stub; g.fillRect(-90, -100, 180, 200);          // the shaved side: one flat tan, no texture (the cards use none)
    g.beginPath(); tk.trace(g, mon ? skull : FACE_REGION); g.fillStyle = C.skin; g.fill();
    // skin shadow: lower-left crescent of the skull and of the hairline edge, plus the fringe's cast shadow on the forehead
    g.save();
    g.beginPath(); tk.trace(g, mon ? skull : FACE_REGION); g.clip();
    g.fillStyle = C.skinSh;
    g.beginPath(); g.rect(-100, -100, 200, 200); tk.trace(g, skull, RJ.lx(4.5), -8); g.fill('evenodd');
    if (!mon) { g.beginPath(); g.rect(-100, -100, 200, 200); tk.trace(g, FACE_REGION, RJ.lx(3.2), -4); g.fill('evenodd'); }
    g.beginPath(); tk.trace(g, { poly: MASS_LOW.concat([[-60, -100], [60, -100]]) }, RJ.lx(1.5), 7); g.fill();
    g.restore();
    if (!mon) {                                                    // the stubble side only: a thin darker lower-left edge and a few short stubble ticks
      g.save();
      g.beginPath(); g.rect(-100, -100, 200, 200); tk.trace(g, FACE_REGION); g.clip('evenodd');
      g.globalAlpha = 0.7; g.fillStyle = H.stubDk;
      g.beginPath(); g.rect(-100, -100, 200, 200); tk.trace(g, skull, RJ.lx(4), -7); g.fill('evenodd');
      g.globalAlpha = 1;
      [[-52, -18, -49, -15], [-50, -4, -47, -1], [-53, 8, -50, 11], [-47, -28, -44, -25], [-55, -30, -52, -27], [-47, 12, -45, 15], [-52, 17, -49, 19], [-45, 2, -42, 4]].forEach((t, i) =>
        RJ.ink(g, [[t[0], t[1]], [t[2], t[3]]], { w: 0.9, color: H.stubDk, taper: 0.5, wobble: 0, alpha: 0.5, seed: i }));
      g.restore();
    }
    g.restore();
    RJ.drawFace(g, S);
    RJ.ink(g, skull, { closed: true, w: LINE.main + 0.4, color: C.ink, align: 0.2, weightVar: 0.5 });
    if (!mon) {
      RJ.ink(g, HAIRLINE.slice(0, 5), { w: LINE.main, color: C.ink, taper: 0.15, pressure: 'flat', wobble: 0.03 });
      RJ.ear(g, -51, 23, { r: 15.5, side: -1 });
    }
  }

  function faceSpec() {
    return {
      // narrow, half-lidded almond eyes (the card's cool, cheeky look), slate-blue irises, thick brown brows at about 20 degrees close above the lids
      eyes: [{ x: -16, y: 16, w: 31, h: 21 }, { x: 40, y: 15, w: 27, h: 20 }],
      brows: [[-16.5, -5.5, 27], [45, -5, 25]],
      browStyle: { thick: 5.8, arch: 0.5, tilt: 0.32, color: '#5a2c18' },
      nose: [18, 29, 60],
      mouth: [12, 41, 18],
      mouthStyle: { teeth: true, lineW: 1.4, puff: true },
      blush: [[-8, 29, 17], [42, 29, 15]],
      sweat: [56, -14, 5],
      eye: { iris: H.iris, ring: '#1c2636', sclera: '#f2eadf', expr: 'neutral', irisW: 0.5, irisH: 0.86, lid: 2.1, wing: 0.55, lash: 1.15, crease: true, lashes: 0, tilt: 0.2, drop: 0.2, hl: [[-0.38, -0.5, 0.3], [-0.3, -0.12, 0.14]] },
    };
  }

  // poses: numbers from RJ.BASE_POSE. Facing +x; the front arm (right of the screen) carries the mic, the back arm is the free one.
  // Brow numbers are added to the face's base tilt (0.32, about 20 degrees on the card): idle 0.3 is the cocky smirk, nothing goes past 0.5 so attack stays
  // fierce but friendly instead of a snarl.
  function poses() {
    const smirk = { eyes: 'open', mouth: 'smirkTeeth', brow: 0.22 };
    return {
      idle: Object.assign({
        mic: 'hand', fHand: [16, 36], fBend: -1, micAng: 1.3, micGrip: 22,
        bHand: [-42, 10], bBend: -1, bKind: 'point', bRot: 0.28, fx: [], headRot: 0.04, torsoRot: -0.02,
      }, smirk),
      sing: { mic: 'mouth', micDx: 5, micDy: 6, micAng: 1.0, fBend: 1, bHand: [-44, -2], bBend: -1, bKind: 'point', bRot: 0.12, eyes: 'open', mouth: 'beat', brow: 0.1, headRot: -0.03, fx: ['notes'], look: [0.4, 0] },
      attack: { mic: 'mouth', micDx: 6, micDy: 5, micAng: 0.95, fBend: 1, lean: 0.1, torsoRot: 0.07, headRot: 0.07, headDx: 3, bHand: [-34, -30], bBend: -1, bKind: 'fist', bRot: -0.3,
        fFoot: [34, -12], bFoot: [-26, -12], eyes: 'determined', mouth: 'beat', brow: 0.5, fx: ['burst'], look: [0.5, 0] },
      hurt: { mic: 'hand', fHand: [4, 38], fBend: -1, micAng: 1.9, micGrip: 22, lean: -0.13, torsoRot: -0.08, headRot: -0.14, headDx: -3, bHand: [-34, -8], bBend: -1, bKind: 'open', bSpread: 1.3, bFront: 1,
        fFoot: [12, -12], bFoot: [-20, -12], eyes: 'hurt', mouth: 'ow', brow: -0.7, sweat: 1, blush: 0.6, fx: ['stars'] },
      cheer: { mic: 'hand', fHand: [46, -34], fBend: 1, micAng: 1.45, micGrip: 22, bHand: [-46, -34], bBend: -1, bKind: 'fist', bRot: -0.2, eyes: 'happy', mouth: 'grin', brow: -0.2, headRot: 0.04,
        fFoot: [20, -12], bFoot: [-18, -12], fx: ['sparkles'] },
    };
  }

  // the portrait pose: both hands low so no stray hand or mic ball shows at the edge of the head-and-shoulders crop
  function bustPose() {
    return Object.assign({ mic: 'hand', fHand: [12, 56], fBend: -1, micAng: 1.5, micGrip: 22, bHand: [-14, 56], bBend: 1, bKind: 'relaxed', fx: [], headRot: 0.04, torsoRot: -0.02 }, { eyes: 'open', mouth: 'smirkTeeth', brow: 0.2 });
  }
  // the monster keeps the same poses but points with the free hand in idle (as in the artist's costume picture)
  function monsterPoses() {
    const p = poses();
    p.idle = Object.assign({}, p.idle, { bHand: [-42, 8], bBend: -1, bKind: 'point', bRot: 0.3 });
    return p;
  }

  function makeRoxor(monster) {
    const hair = monster ? '#2f6a1c' : H.hair, hairSh = monster ? '#1c4510' : H.hairSh;
    const fur = H.fur;
    const spec = {
      id: monster ? 'roxor_monster' : 'roxor',
      accent: 'roxor',
      // normal Roxor is the taller of the pair: head and shoulders raised 12 units (the monster keeps the default chunky skeleton)
      skel: monster ? {} : { neck: [0, -158], headC: [2, -216], shF: [26, -143], shB: [-26, -143], hip: [0, -76], hipF: [15, -76], hipB: [-15, -76] },
      base: {},
      poses: Object.assign(monster ? monsterPoses() : poses(), { bust: bustPose() }),
      face: faceSpec(),
      arm: { l: [26, 24], w: monster ? [20, 16] : [18, 14], skin: monster ? fur : C.skin, skinSh: monster ? H.furSh : C.skinSh,
        sleeve: monster ? null : { color: H.tee, shade: H.teeSh, len: 0.78, w0: 24, w1: 28, hi: false, line: 1.5 },
        cuff: monster ? { color: H.furDk, light: H.furSh } : null, hand: { skin: C.skin, shade: C.skinSh } },
      legs: monster ? {
        w: [38, 30], color: fur, shade: H.furSh, pantsOver: true, bow: 2,
        shoe: { color: fur, sole: fur, shade: H.furSh, hi: H.furLt, k: 1.35, paw: true, pawLine: H.furDk },
        decor(g, hip, an) { furTufts(g, [[(hip[0] + an[0]) / 2 - 3, (hip[1] + an[1]) / 2 - 4], [an[0] + 4, an[1] - 6]]); },
      } : {
        w: [37, 26], color: H.pants, shade: H.pantsSh, pantsOver: true, bow: 2, profile: (u) => 1 - 0.28 * u + 0.1 * Math.sin(Math.PI * Math.min(1, u * 1.15)),
        shoe: { color: H.shoe, sole: H.shoeSole, shade: H.shoeSh, toeCap: '#e8f5a0', k: 1.25 },
        decor(g, hip, an) {                                              // ankle cuff and a knee crease
          const dx = an[0] - hip[0], dy = an[1] - hip[1], d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, nx = -uy, ny = ux;
          const qx = an[0] - ux * 8, qy = an[1] - uy * 8;
          RJ.ink(g, [[qx - nx * 10, qy - ny * 10], [qx + nx * 10, qy + ny * 10]], { w: 1.6, color: C.ink, taper: 0.2, wobble: 0 });
          const mx = (hip[0] + an[0]) / 2 - ux * 1, my = (hip[1] + an[1]) / 2;
          RJ.ink(g, [[mx - nx * 4, my - ny * 4], [mx - nx * 11 + ux * 2, my - ny * 11 + uy * 2]], { w: 1.4, color: H.pantsSh, taper: 0.5, wobble: 0 });
          RJ.ink(g, [[mx + nx * 5, my + ny * 5 + 5], [mx + nx * 10, my + ny * 10 + 7]], { w: 1.3, color: H.pantsSh, taper: 0.5, wobble: 0 });
        },
      },
      mic: { accent: RJ.ACCENT.roxor.main, headR: 10.5, len: 44, bands: 2 },
      bounds: monster ? { w: 240, h: 318, x0: -150, x1: 90 } : { w: 212, h: 332, x0: -122, x1: 90 },     // hair, mane and the widest pose reach (not effects)
      bust: { rect: monster ? [-100, -322, 100, -108] : [-92, -338, 92, -126], face: monster ? [-78, -310, 78, -150] : [-70, -322, 64, -152], pose: 'bust' },
      layers: {},
    };
    const L = spec.layers;

    if (!monster) {
      L.mid = (g, S) => {                                              // the mullet tail, lying over the shoulder behind the ear
        const sw = S.P.hairSwing * 0.5;
        MULLET.forEach((m, i) => lockDraw(g, m, i === 0 ? hair : RJ.shade(hair, 0.02), sw * (1 + i * 0.3), { shadow: '#522a17', wMax: m.w, strands: 1, glossAlpha: 0.7 }));
      };
      L.head = (g, S) => { faceBase(g, S, false); mohawk(g, S, hair, hairSh); };
      L.torso = (g, S) => teeAndPants(g, S);
    } else {
      L.backHair = (g, S) => hoodBack(g, S);
      L.head = (g, S) => {
        faceBase(g, S, true);
        hoodFront(g, S);
        mohawk(g, S, hair, hairSh, 0.92, '#5aa634', '#7cc24a');
        horns(g, S);
      };
      L.torso = (g, S) => onesie(g, S);
    }
    return spec;
  }

  // ---- the normal outfit ----
  const TEE = [[-13, -154], [13, -154], [33, -147], [38, -130], [38, -104], [41, -77, 1], [24, -73], [0, -71.5], [-24, -73], [-41, -77, 1], [-38, -104], [-38, -130], [-33, -147]];
  function teeAndPants(g, S) {
    RJ.neck(g, 2, -166, { w: 22, h: 20 });
    RJ.cel(g, TEE, H.tee, { shadow: H.teeSh, line: LINE.main, depth: 8, hi: H.teeHi, hiW: 1.6, hiAlpha: 0.7, rim: '#85756a', rimW: 1.6, rimSide: 'light', rimAlpha: 0.75 });
    // a wide scoop neckline that shows the neck, with a thin lighter rim of tee colour
    RJ.cel(g, [[-17, -155, 1], [-13, -145.5], [0, -139.5], [13, -145.5], [17, -155, 1], [15.5, -155], [11.5, -148], [0, -142.5], [-11.5, -148], [-15.5, -155]], '#5a4e44', { shadow: H.teeSh, line: LINE.fine + 0.3, depth: 1.5, tension: 0.7 });
    RJ.cel(g, [[-15.5, -156, 1], [15.5, -156, 1], [11.5, -148], [0, -142.5], [-11.5, -148]], C.skin, { shadow: C.skinSh, line: false, depth: 3, tension: 0.7 });
    // fold lines
    RJ.ink(g, [[-30, -130], [-22, -118], [-24, -104]], { w: 1.4, color: H.teeHi, taper: 0.5, wobble: 0.02, alpha: 0.8 });
    RJ.ink(g, [[26, -134], [20, -120], [24, -106]], { w: 1.4, color: H.teeHi, taper: 0.5, wobble: 0.02, alpha: 0.8 });
    // the round orange smiley (as big as the card's), slightly right of centre (3/4 view)
    const cx = 6, cy = -111, r = 16.5, f = r / 13;
    RJ.cel(g, tk.circlePts(cx, cy, r, 18), H.orange, { shadow: H.orangeSh, line: LINE.mid, depth: 5, hi: '#ffd08a', hiW: 1.5 });
    RJ.ink(g, [[cx - 5.5 * f, cy - 5 * f], [cx - 5.5 * f, cy - 1.8 * f]], { w: 1.9, color: '#4d2c10', taper: 0.3, wobble: 0 });
    RJ.ink(g, [[cx + 4.5 * f, cy - 5 * f], [cx + 4.5 * f, cy - 1.8 * f]], { w: 1.9, color: '#4d2c10', taper: 0.3, wobble: 0 });
    RJ.ink(g, [[cx - 8.5 * f, cy + 1.2 * f], [cx - 4 * f, cy + 6.4 * f], [cx + 2 * f, cy + 7.6 * f], [cx + 7.5 * f, cy + 4.6 * f], [cx + 9 * f, cy + 1 * f]], { w: 2, color: '#4d2c10', taper: 0.3, wobble: 0 });
  }

  // ---- the monster onesie ----
  function furTufts(g, pts) {                                           // small curly 'u' tufts, the cartoon's fur marks
    for (let i = 0; i < pts.length; i++) {
      const x = pts[i][0], y = pts[i][1];
      RJ.ink(g, [[x - 3.5, y - 2], [x - 2, y + 1.6], [x, y - 0.6], [x + 1.6, y + 1.8], [x + 3.4, y - 1.6]], { w: 1.4, color: H.furDk, taper: 0.4, wobble: 0, alpha: 0.9 });
    }
  }
  // a scalloped, fluffy closed outline of an ellipse: n soft rounded bumps (quadratic-like arcs, amp = bump height as a share of the radius) with a little cusp
  // between neighbours, like the plush hood on the artist's costume. dir -1 turns the bumps inward (the face opening).
  function furRing(cx, cy, rx, ry, n, amp, phase, dir) {
    const pts = [], sd = dir === -1 ? -1 : 1, steps = 4;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < steps; j++) {
        const t = j / steps, a = (phase || 0) + ((i + t) / n) * TAU, k = 1 + sd * amp * Math.pow(Math.sin(Math.PI * t), 0.85);
        pts.push(j === 0 ? [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, 1] : [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
      }
    }
    return pts;
  }
  const HOOD_OUT = () => furRing(-2, -3, 76, 73, 16, 0.05, 0.2), HOOD_IN = () => furRing(4, 6, 55, 58, 20, 0.034, 0.1, -1);
  function hoodBack(g, S) {
    const sw = S.P.hairSwing;
    // the dark fur mane hanging at the back of the hood (left): five soft hair tufts that droop and curl, as on the artist's costume
    const tufts = [[[-62, -34], [-78, -42], [-94, -36]], [[-68, -14], [-86, -19], [-101, -9]], [[-70, 6], [-88, 10], [-101, 22]], [[-66, 26], [-82, 34], [-92, 48]], [[-58, 42], [-71, 53], [-77, 68]]];
    tufts.forEach((s2, i) => RJ.lock(g, s2, H.furDk, { wMax: 14, w0: 13, w1: 0, tipPow: 1.25, bend: sw * 0.15 * (i + 1), gloss: false, strands: 1, shadow: '#1a350a', line: LINE.main }));
    RJ.cel(g, HOOD_OUT(), H.fur, { shadow: H.furSh, line: LINE.main, depth: 9, hi: H.furLt, hiW: 2, tension: 0.9 });
  }
  function hoodFront(g, S) {
    const outer = HOOD_OUT(), inner = HOOD_IN();
    g.save();
    g.beginPath(); tk.trace(g, outer); tk.trace(g, inner); g.fillStyle = H.fur; g.fill('evenodd');
    // hard shadow band on the lower-left of the ring (key light from the upper right)
    g.save(); g.beginPath(); tk.trace(g, outer); tk.trace(g, inner); g.clip('evenodd');
    g.fillStyle = H.furSh; g.beginPath(); g.rect(-100, -100, 200, 200); tk.trace(g, outer, RJ.lx(6), -9); g.fill('evenodd');
    g.restore();
    g.restore();
    RJ.ink(g, outer, { closed: true, w: LINE.main + 0.3, color: C.ink, align: 0.3 });
    RJ.ink(g, inner, { closed: true, w: LINE.main, color: C.ink, align: -0.3 });
    furTufts(g, [[-62, -22], [-66, 6], [-52, 38], [58, -40], [66, -4], [60, 30], [-30, 64], [22, 66], [-6, -66], [40, -62], [-42, -58]]);
  }
  function horns(g, S) {
    // two short thick cream horns with ridges, sitting close to the face on the top of the hood, a darker ring band at the base
    [[-1, [[-55, -60], [-58, -72], [-56, -84], [-50, -95, 1], [-47, -84], [-44, -72], [-38, -61]]], [1, [[59, -60], [62, -72], [60, -84], [54, -95, 1], [51, -84], [48, -72], [42, -61]]]].forEach((h) => {
      const sd = h[0], pts = h[1], b0 = sd < 0 ? -55 : 59;
      RJ.cel(g, pts, H.horn, { shadow: H.hornSh, line: LINE.main, depth: 5, hi: '#fff0d2', hiW: 1.3, tension: 0.8, decor: (gg) => {
        const bx = sd < 0 ? [-57, -37] : [43, 63];
        RJ.fillPts(gg, [[bx[0], -58], [bx[1], -58], [bx[1], -66], [bx[0], -67]], '#d29a62', 0.9);                       // the darker ring band at the base
        RJ.ink(gg, [[bx[0], -66.5], [(bx[0] + bx[1]) / 2, -68], [bx[1], -66]], { w: 1.2, color: H.hornSh, taper: 0.3, wobble: 0 });
        [[-58, -74, -45, -76], [-57, -83, -48, -85]].forEach((r) => {
          const x0 = sd < 0 ? r[0] : 4 - r[0], x1 = sd < 0 ? r[2] : 4 - r[2];
          RJ.ink(gg, [[x0, r[1]], [(x0 + x1) / 2, r[1] - 2.5], [x1, r[3]]], { w: 1.2, color: H.hornSh, taper: 0.3, wobble: 0 });
        });
      } });
    });
  }
  const ONESIE_BODY = [[-30, -142], [30, -142], [42, -130], [44, -108], [42, -84], [38, -60], [34, -44], [8, -40], [0, -47], [-8, -40], [-34, -44], [-38, -60], [-42, -84], [-44, -108], [-42, -130]];
  function onesie(g, S) {
    RJ.neck(g, 2, -154, { w: 22, h: 20 });
    RJ.cel(g, ONESIE_BODY, H.fur, { shadow: H.furSh, line: LINE.main, depth: 9, hi: H.furLt, hiW: 1.8, tension: 0.9 });
    // the orange smiley on the belly, big
    const cx = 5, cy = -92, r = 21;
    RJ.cel(g, tk.circlePts(cx, cy, r, 18), H.orange, { shadow: H.orangeSh, line: LINE.mid, depth: 6, hi: '#ffd08a', hiW: 1.6 });
    RJ.ink(g, [[cx - 8, cy - 8], [cx - 8, cy - 3]], { w: 2.2, color: '#4d2c10', taper: 0.3, wobble: 0 });
    RJ.ink(g, [[cx + 7, cy - 8], [cx + 7, cy - 3]], { w: 2.2, color: '#4d2c10', taper: 0.3, wobble: 0 });
    RJ.ink(g, [[cx - 13, cy + 1], [cx - 6, cy + 10], [cx + 2, cy + 12], [cx + 10, cy + 8], [cx + 13, cy + 1]], { w: 2.4, color: '#4d2c10', taper: 0.3, wobble: 0 });
    // the zip pull cord hanging from the neck down over the belly with a little knob at the end, as on the card
    RJ.ink(g, [[-9, -141], [-14, -128], [-13, -112], [-15, -97]], { w: 3.4, color: C.ink, taper: 0, wobble: 0 });
    RJ.ink(g, [[-9, -141], [-14, -128], [-13, -112], [-15, -97]], { w: 1.8, color: '#b8d96a', taper: 0, wobble: 0 });
    RJ.cel(g, tk.ellipsePts(-15, -95, 2.8, 3.6, 8), '#b8d96a', { shadow: '#7fa83a', line: LINE.fine + 0.2, depth: 1 });
    furTufts(g, [[-28, -120], [28, -122], [-30, -80], [32, -76], [-18, -58], [20, -56], [-6, -130]]);
  }

  RJ.register('roxor', RJ.rig(makeRoxor(false)));
  RJ.register('roxor_monster', RJ.rig(makeRoxor(true)));
})();

// jasmin.js: Jasmin (id 'jasmin', accent PINK) and her unicorn onesie skin ('jasmin_unicorn'). The attack hero, an angelic soft singer (not a belter).
// Built on kit.js (RJ.rig). Both skins share ONE face, built on an explicit grid (see FG below) and drawn by this file's own face code (jFace).
// Identity: glossy brown hair in a HIGH PONYTAIL with a pink scrunchie and a pink hair clip, big warm brown eyes with a pink flower sparkle in each iris, long
// lashes, a hoop earring, a pearl necklace with a pink heart, a pink sleeveless dress with a fitted waist and pleated flared skirt, white socks, white
// and pink sneakers, a black mic with a pink band, a happy open smile. Faces slightly to the viewer's right (the card is mirrored).
(function () {
  'use strict';
  const tk = ART.tk, C = RJ.C, LINE = RJ.LINE;
  const TAU = Math.PI * 2, PI = Math.PI;
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : (d === undefined ? 0 : d));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };

  const J = {
    hair: '#5c321b', hairSh: '#3a1d0f', hairLt: '#85502d', streak: '#bd7246',
    dress: '#fd9bb4', dressSh: '#ea7897', dressLt: '#ffbccb', pleat: '#f58aa6',
    pink: '#ff7fb2', pinkDk: '#d9457f', scrunchie: '#ff9bc0',
    white: '#fffaf4', whiteSh: '#ead9d6', pearl: '#fffdf8', pearlSh: '#d9cfd0',
    flower: '#ff8fb9', flowerCore: '#ffd9e6',
    silver: '#cfd5de',
    brow: '#5a3321', lash: '#2d170f',
  };

  // ==================================================================================================================================
  // THE FACE GRID (head space: origin = head centre, y up is negative, the face turned to +x by the card's slight 3/4 view)
  // ==================================================================================================================================
  //   face width     the skull is x -62 .. 59.5 (121.5 wide, about 4.2 mean eye widths) and y -58 .. 60.3 (a soft rounded jaw that tapers to a small round chin whose lowest point is ON the centre line)
  //   centre line    x = cx = 9: nose, mouth and chin sit exactly on it. The 3/4 turn moves it about +10 from the skull centre (x -1).
  //   eye line       y = eyeY = 7: the vertical middle of the face oval (hairline about -50 at the centre line, chin 60.3, middle 5; the iris sits on the line)
  //   eyes           both 31 high on the same line. Near eye 31 wide, far eye 27.3 (88%, the card's only 3/4 concession). One eye width (29, the mean of the two)
  //                  between the inner corners, split evenly by the centre line: inner corners at cx -+ 14.5, outer corners at cx - 45.5 and cx + 41.7.
  //   brows          mirrored arches 31 above the eye line (lifted), inner ends at cx -+ 15.5, 84% of their eye's width
  //   nose           tip y = eyeY + 17, mouth line y = eyeY + 30 (23.5 wide), blushes y = eyeY + 21 centred under each eye
  //   ears           near ear centre y = 8, r 15.5: the top level with the upper lid line (y -9), the lobe level with the nose tip (y 23); the far ear mirrors it, smaller
  const FG = (() => {
    const cx = 9, eyeY = 7, eyeH = 31, wN = 31, wF = 27.3, gap = 29;
    const nearX = cx - gap / 2 - wN / 2, farX = cx + gap / 2 + wF / 2;
    return {
      cx, eyeY, eyeH, wN, wF, gap,
      near: { x: nearX, y: eyeY, w: wN, h: eyeH }, far: { x: farX, y: eyeY, w: wF, h: eyeH },
      browWn: 26, browWf: 23, browY: eyeY - 31, noseY: eyeY + 17, mouthY: eyeY + 30, mouthW: 23.5, blushY: eyeY + 21,
      earY: 8, earR: 15.5,
    };
  })();

  // ---- the skull: a smooth outline, soft rounded jaw with a gentle taper, the small chin at x = cx ----
  const SKULL = [[-2, -58], [30, -54], [51, -36], [59.5, -8], [59, 11], [53.5, 28], [42, 43], [27, 55.2], [9, 60.4], [-9, 56.4], [-24, 51.5], [-38, 41], [-52, 25], [-60.5, 6], [-62, -10], [-58, -33], [-40, -52]];

  // ---- hair in head space ----
  // Measured on the owners' card, which draws her facing LEFT: MX mirrors card coordinates (card x, y in head units) to our right-facing figure.
  const MX = (list) => list.map((p) => [-p[0] - 4, p[1]]);
  // the hair cap: a ring around the forehead dome. Outer edge = the glossy crown, inner edge = the hairline: a smooth arc with a tiny part and a downward
  // hair tip at x = 4 (a little right of the centre line toward the near side, "centre-ish"), the side bangs sweeping down to the near ear; on the far side the
  // hair ends high at the temple.
  const CAP_OUTER = [[59, -10], [60, -24], [57, -38], [52, -50], [44, -60], [34, -67], [22, -72], [8, -76], [-7, -77], [-22, -76], [-36, -70], [-52, -60], [-64, -44], [-69, -24], [-69.5, -4], [-67.5, 12], [-61, 24]];
  const HAIRLINE = [[-45.5, 12], [-44.5, 3], [-42, -6], [-38, -14], [-32.5, -22.5], [-26, -29.5], [-18.5, -35.5], [-11, -40], [-4, -43.6], [1, -45.6], [3, -47.2], [4.4, -43.6, 1], [6.4, -48.4], [11, -50.6], [20, -52], [30, -50.6], [40, -46.8], [48.5, -40], [54.5, -29.5], [58, -17], [59, -8]];
  const CAP = CAP_OUTER.concat(HAIRLINE);
  const CAP_SOFT = CAP_OUTER.concat(HAIRLINE.filter((p, i) => i < 10 || i > 12));            // the same ring without the part tip, for the cast shadow on the forehead

  function capDecor(g) {
    // lit band along the crown from the part toward the ponytail, then long dark flow lines and light hatch streaks
    RJ.fillPts(g, [[34, -66], [14, -74], [-8, -75], [-30, -70], [-40, -62], [-28, -62], [-8, -67], [14, -65], [30, -58]], J.hairLt, 0.8);
    const lines = [[[-3, -44], [10, -58], [30, -69], [48, -72]], [[12, -47], [28, -58], [46, -63]], [[28, -50], [42, -56], [54, -52]], [[-50, -46], [-42, -62], [-28, -72]], [[-36, -52], [-26, -66]], [[-20, -50], [-12, -64], [0, -72]], [[40, -30], [52, -34], [60, -24]]];
    lines.forEach((l, i) => RJ.ink(g, MX(l), { w: 1.4, color: J.hairSh, taper: 0.5, wobble: 0.02, alpha: 0.95, seed: i }));
    const hatch = [[[-14, -70], [-8, -62]], [[-10, -72], [-4, -64]], [[-4, -73], [2, -66]], [[4, -70], [9, -62]], [[10, -66], [14, -59]], [[28, -62], [33, -54]], [[32, -58], [37, -50]], [[-42, -64], [-37, -56]], [[-50, -56], [-46, -48]], [[40, -50], [43, -44]]];
    hatch.forEach((h, i) => RJ.ink(g, MX(h), { w: 1.2, color: J.streak, taper: 0.5, wobble: 0, alpha: 0.95, seed: i }));
  }

  // the ponytail: one chunky mass that rises from the scrunchie on the crown (card (36,-72)), arches up and back, then cascades down behind her and ends in
  // an S-curl. Silhouette measured on the card; the inner edge runs behind the head. Card coordinates, mirrored by MX.
  const TAIL_UNM = [[20, -78], [28, -85], [38, -92], [50, -96], [63, -95], [75, -90], [86, -80], [93, -66], [97, -48], [99, -28], [98, -6], [96, 16], [93, 34], [89, 44], [84, 53, 1], [79, 59], [74, 69], [70, 78], [68, 86], [71, 90], [77, 89], [82, 84, 1],
    [80, 92], [75, 97], [67, 99], [58, 96], [49, 91], [40, 83], [33, 72], [30, 60], [33, 47], [42, 35], [52, 22], [58, 6], [63, -14], [56, -36], [44, -56], [34, -64]];
  const TAIL_OUTLINE = MX(TAIL_UNM);
  // the one hard shadow: a band along the side that faces the head (where the hair tucks behind the skull)
  const TAIL_SHADOW = MX([[46, -62], [58, -38], [66, -14], [64, 8], [58, 24], [48, 38], [38, 50], [33, 62], [35, 74], [42, 85], [52, 93], [64, 99], [68, 92], [56, 84], [47, 74], [46, 62], [52, 50], [60, 38], [68, 22], [76, 2], [78, -22], [72, -46], [62, -68], [50, -78]]);
  const TAIL_LINES = [[[34, -86], [48, -90], [63, -85], [76, -70]], [[40, -74], [54, -82], [68, -74], [76, -54]], [[78, -62], [86, -42], [88, -12], [85, 18], [79, 40], [75, 52]], [[72, -34], [78, -6], [76, 26], [68, 50], [58, 70], [52, 86]], [[90, -14], [91, 12], [88, 32]], [[64, 70], [63, 82], [66, 92], [72, 95]]];
  const TAIL_HATCH = [[[52, -92], [58, -87]], [[58, -93], [64, -88]], [[64, -91], [70, -85]], [[86, -44], [88, -32]], [[88, -30], [90, -16]], [[80, 28], [81, 40]], [[84, 22], [85, 32]], [[66, 58], [67, 70]], [[71, 60], [72, 72]], [[72, -66], [76, -58]]];
  // two light bands: along the crown of the arc and on the curl at the tip (the lit side, upper right)
  const TAIL_LIGHT = [[[40, -86], [54, -92], [68, -89], [80, -79], [87, -66], [83, -66], [75, -76], [64, -82], [52, -85], [42, -81]], [[88, 38], [84, 52], [78, 66], [74, 80], [73, 87], [76, 84], [80, 70], [86, 56], [90, 42]]];
  function ponytail(g, S) {
    g.save();
    g.translate(-39, -72); g.rotate(0.09 + S.P.hairSwing * 0.05); g.translate(39, 72);        // a gentle sway of the whole tail about the scrunchie
    RJ.cel(g, TAIL_OUTLINE, J.hair, { shadow: false, line: LINE.main + 0.2, tension: 0.85, weightVar: 0.3, decor: (gg) => {
      RJ.fillPts(gg, TAIL_SHADOW, J.hairSh, 0.55);
      TAIL_LIGHT.forEach((l) => RJ.fillPts(gg, MX(l), J.hairLt, 0.75));
      TAIL_LINES.forEach((l, i) => RJ.ink(gg, MX(l), { w: 1.5, color: J.hairSh, taper: 0.45, wobble: 0.03, alpha: 0.95, seed: i }));
      TAIL_HATCH.forEach((h, i) => RJ.ink(gg, MX(h), { w: 1.3, color: J.streak, taper: 0.5, wobble: 0, alpha: 0.95, seed: i }));
    } });
    g.restore();
  }

  function scrunchie(g, pal) {
    // one smooth band wrapped round the root of the tail, as on the card: a curved strip across the root (about (22,-82) to (49,-67) in card coordinates), fuller
    // in the middle, with one outline, a lighter sheen along its top and a single darker fold line
    const P = pal || { base: J.scrunchie, shade: J.pink, hi: '#ffd3e2', fold: J.pinkDk };
    const cx = 35.5, cy = -75, an = 0.46, ca = Math.cos(an), sa = Math.sin(an), top = [], bot = [];
    for (let i = 0; i <= 8; i++) {
      const s = -1 + i / 4, lx = s * 16, ly = -3 * (1 - s * s), hw = 5.5 - 1.7 * s * s;
      top.push([cx + lx * ca - (ly - hw) * sa, cy + lx * sa + (ly - hw) * ca]);
      bot.push([cx + lx * ca - (ly + hw) * sa, cy + lx * sa + (ly + hw) * ca]);
    }
    RJ.cel(g, MX(top.concat(bot.reverse())), P.base, { shadow: P.shade, line: LINE.main, depth: 3, hi: P.hi, hiW: 1.4, tension: 0.9 });
    RJ.ink(g, MX([[cx + 4.2 * ca + 4.5 * sa, cy + 4.2 * sa - 4.4 * ca], [cx + 5.2 * ca - 4 * sa, cy + 5.2 * sa + 4.1 * ca]]), { w: 1.3, color: P.fold, taper: 0.4, wobble: 0, alpha: 0.75 });
  }
  function hairClip(g) {
    // a snap clip: solid pink with a lighter pink core and a thin darker slit
    g.save(); g.translate(-57, -25); g.rotate(0.38);
    RJ.cel(g, [[0, -14.5], [4.6, -12], [5.8, -4], [4.2, 6], [1.6, 14], [-1.6, 14], [-4.2, 6], [-5.8, -4], [-4.6, -12]], J.pink, { shadow: J.pinkDk, line: LINE.mid, depth: 3, hi: '#ffc2d9', hiW: 1.3, tension: 0.9 });
    RJ.cel(g, [[0, -10], [2.8, -7], [3.4, -1], [2.2, 5], [0.6, 9.5], [-0.6, 9.5], [-2.2, 5], [-3.4, -1], [-2.8, -7]], '#ffb3cd', { shadow: false, line: LINE.fine, lineColor: J.pinkDk, tension: 0.9 });
    RJ.ink(g, [[0, -6.5], [0.2, 0], [0, 6.5]], { w: 1.0, color: J.pinkDk, taper: 0.5, wobble: 0, alpha: 0.85 });
    g.restore();
  }
  // the hoop hangs from the near ear lobe (ear centre x, y)
  function hoop(g, ex, ey) {
    const x = ex + 1, y = ey + 27;
    g.save(); g.lineWidth = 3.6; g.strokeStyle = C.ink; g.beginPath(); g.ellipse(x, y, 6.2, 8.8, 0.1, 0, TAU); g.stroke();
    g.lineWidth = 1.9; g.strokeStyle = J.silver; g.beginPath(); g.ellipse(x, y, 6.2, 8.8, 0.1, 0, TAU); g.stroke();
    g.lineWidth = 0.9; g.strokeStyle = '#ffffff'; g.beginPath(); g.ellipse(x, y, 6.2, 8.8, 0.1, 3.6, 4.6); g.stroke();
    g.restore();
  }

  // ==================================================================================================================================
  // THE FACE (jFace): blush, nose, eyes, brows, mouth, all from the grid above, mirrored about x = FG.cx
  // ==================================================================================================================================
  const bezP = (P, t) => {
    const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return [a * P[0][0] + b * P[1][0] + c * P[2][0] + d * P[3][0], a * P[0][1] + b * P[1][1] + c * P[2][1] + d * P[3][1]];
  };
  const bezT = (P, t) => {                                              // the unit tangent
    const u = 1 - t;
    const dx = 3 * u * u * (P[1][0] - P[0][0]) + 6 * u * t * (P[2][0] - P[1][0]) + 3 * t * t * (P[3][0] - P[2][0]);
    const dy = 3 * u * u * (P[1][1] - P[0][1]) + 6 * u * t * (P[2][1] - P[1][1]) + 3 * t * t * (P[3][1] - P[2][1]);
    const l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  };
  const bezPts = (P, a, b, n) => { const o = []; for (let i = 0; i <= n; i++) o.push(bezP(P, lerp(a, b, i / n))); return o; };
  const rgba = (hex, a) => U.color.rgba(hex, clamp(num(a), 0, 1).toFixed(3));
  const canGrad = (g) => typeof g.createLinearGradient === 'function' && typeof g.createRadialGradient === 'function';

  // eye presets for the open eye: o = how far the lids open (1 full), tilt = inner corner drop (+ angry, - sad), wide = size multiplier
  const EYE_PRE = {
    open: { o: 1 }, neutral: { o: 1 }, half: { o: 0.56, tilt: 0.1 }, sleepy: { o: 0.36, tilt: -0.16 }, wide: { o: 1, wide: 1.1 },
    determined: { o: 0.86, tilt: 0.45 }, angry: { o: 0.78, tilt: 0.85 }, sad: { o: 0.92, tilt: -0.6 }, smirk: { o: 0.74, tilt: 0.26 },
  };

  // The two lid curves of an eye in its local frame (inner corner at -a, outer corner at +a, up is -y). k.open blends the upper lid toward the lower one.
  function eyeCurves(a, b, k) {
    const o = clamp(num(k.open, 1), 0, 1), tl = num(k.tilt);
    const I = [-a, 0.2 * b + tl * b * 0.22], O = [a, -0.08 * b - tl * b * 0.16];
    const chord = (x) => I[1] + ((x + a) / (2 * a)) * (O[1] - I[1]);
    const yc = (x) => chord(x) + 0.5 * b * (1 - (x / a) * (x / a));            // where both lids meet when the eye is shut: a soft downward bow, like the closed eye
    const ux1 = -0.72 * a, ux2 = 0.62 * a, lx1 = 0.66 * a, lx2 = -0.5 * a, lo = Math.sqrt(o);
    const U1 = [ux1, lerp(yc(ux1), -1.4 * b + tl * b * 0.5 * 0.72, o)], U2 = [ux2, lerp(yc(ux2), -1.32 * b - tl * b * 0.5 * 0.62, o)];
    const L1 = [lx1, lerp(yc(lx1), 1.12 * b, lo)], L2 = [lx2, lerp(yc(lx2), 1.2 * b, lo)];
    return { I, O, up: [I, U1, U2, O], lo: [O, L1, L2, I] };
  }
  function lash(g, p, dir, len, w, col, alpha) {
    tk.inkPath(g, [[p[0], p[1]], [p[0] + dir[0] * len * 0.55 + dir[1] * len * 0.06, p[1] + dir[1] * len * 0.55 - dir[0] * len * 0.06], [p[0] + dir[0] * len, p[1] + dir[1] * len]],
      { w, color: col, taper: 0.55, wobble: 0, weightVar: 0, alpha });
  }

  // the open eye: sclera, a graduated brown iris, two catchlights, the pink flower sparkle, lid shade, a refined upper lash line with a wing, a floating crease, lashes
  function openEye(g, e, side, st, pre) {
    const wide = pre.wide || 1, a = e.w / 2 * wide, b = e.h / 2 * wide, sx = side < 0 ? -1 : 1;   // sx: local x -> figure x
    const ss = sx * (RJ._flip ? -1 : 1);                                                         // ss: local x -> screen x (a flipped figure keeps the card's light sides on screen)
    const open = clamp(num(st.open, 1), 0, 1) * clamp(pre.o, 0, 1);
    const cv = eyeCurves(a, b, { open, tilt: pre.tilt });
    const look = st.look || [0, 0];
    const rx = a * 0.74, ry = b * 0.9, icx = (num(look[0]) * 0.06 * sx - 0.07) * a, icy = b * 0.03 + num(look[1]) * b * 0.14;
    const W = a * 0.22, lashCol = J.lash;
    g.save();
    g.translate(e.x, e.y); if (side < 0) g.scale(-1, 1);
    const shape = () => { g.beginPath(); g.moveTo(cv.up[0][0], cv.up[0][1]); g.bezierCurveTo(cv.up[1][0], cv.up[1][1], cv.up[2][0], cv.up[2][1], cv.up[3][0], cv.up[3][1]); g.bezierCurveTo(cv.lo[1][0], cv.lo[1][1], cv.lo[2][0], cv.lo[2][1], cv.lo[3][0], cv.lo[3][1]); g.closePath(); };
    g.save();
    shape(); g.clip();
    g.fillStyle = '#fffdfa'; g.fillRect(-a * 1.4, -b * 1.5, a * 2.8, b * 3);
    // the lid's soft shade across the top of the white
    g.fillStyle = 'rgba(214,166,158,0.34)'; g.fillRect(-a * 1.4, -b * 1.5, a * 2.8, b * 1.5 + b * lerp(0.2, -0.46, clamp(open, 0, 1)) );
    // iris: a vertical oval, graduated from a deep brown top to a warm amber bottom
    g.save();
    g.beginPath(); g.ellipse(icx, icy, rx, ry, 0, 0, TAU); g.clip();
    if (canGrad(g)) {
      const gr = g.createLinearGradient(0, icy - ry, 0, icy + ry);
      gr.addColorStop(0, '#26130a'); gr.addColorStop(0.34, '#3d2210'); gr.addColorStop(0.62, '#62401c'); gr.addColorStop(1, '#8e5b2b');
      g.fillStyle = gr;
    } else g.fillStyle = '#4c2b14';
    g.fillRect(icx - rx - 1, icy - ry - 1, rx * 2 + 2, ry * 2 + 2);
    g.fillStyle = 'rgba(214,150,84,0.34)'; g.beginPath(); g.ellipse(icx, icy + ry * 0.66, rx * 0.8, ry * 0.36, 0, 0, TAU); g.fill();       // the lower glow
    g.strokeStyle = 'rgba(255,222,168,0.42)'; g.lineWidth = Math.max(0.7, a * 0.06); g.beginPath(); g.ellipse(icx, icy, rx * 0.86, ry * 0.88, 0, 0.18 * PI, 0.78 * PI); g.stroke();   // reflected light low in the iris
    g.fillStyle = 'rgba(24,10,4,0.38)'; g.beginPath(); g.ellipse(icx, icy - ry * 0.02, rx * 0.4, ry * 0.42, 0, 0, TAU); g.fill();             // the pupil
    g.restore();
    g.lineWidth = Math.max(0.8, a * 0.05); g.strokeStyle = '#2a1408'; g.beginPath(); g.ellipse(icx, icy, rx, ry, 0, 0, TAU); g.stroke();
    // two catchlights, on the viewer's left of the iris on screen (as on the card, flipped or not): a big round one and a small one under it
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(icx + ss * -0.4 * rx, icy - 0.42 * ry, Math.max(1.3, 0.25 * rx), 0, TAU); g.fill();
    g.beginPath(); g.arc(icx + ss * -0.22 * rx, icy - 0.05 * ry, Math.max(0.8, 0.11 * rx), 0, TAU); g.fill();
    g.restore();
    // the pink flower sparkle (upper right of the iris on screen) and two small pink dashes low left
    if (open > 0.45) {
      const fr = Math.max(2.2, rx * 0.33), fx = icx + ss * 0.34 * rx, fy = icy - 0.3 * ry;
      g.save();
      for (let i = 0; i < 5; i++) { const an = -PI / 2 + (i / 5) * TAU; g.beginPath(); g.ellipse(fx + Math.cos(an) * fr * 0.62, fy + Math.sin(an) * fr * 0.62, fr * 0.6, fr * 0.45, an, 0, TAU); g.fillStyle = J.flower; g.fill(); }
      g.beginPath(); g.arc(fx, fy, fr * 0.3, 0, TAU); g.fillStyle = J.flowerCore; g.fill();
      tk.inkPath(g, [[icx + ss * -0.5 * rx, icy + ry * 0.4], [icx + ss * -0.34 * rx, icy + ry * 0.52]], { w: 1.4, color: J.flower, taper: 0.4, wobble: 0, weightVar: 0 });
      tk.inkPath(g, [[icx + ss * -0.44 * rx, icy + ry * 0.6], [icx + ss * -0.28 * rx, icy + ry * 0.72]], { w: 1.1, color: J.flower, taper: 0.4, wobble: 0, weightVar: 0 });
      g.restore();
    }
    // the sclera's thin lower outline
    tk.inkPath(g, bezPts(cv.lo, 0, 1, 12), { w: 1.0, color: '#4a2a1c', alpha: 0.85 * smooth(open / 0.4), taper: 0.4, wobble: 0, weightVar: 0, step: 1.5 });
    // the upper lash line: thin at the inner corner, fullest across the outer half, ending in a small wing; one even stroke
    const up = bezPts(cv.up, 0, 1, 16);
    const wing = [[a * 1.1, cv.O[1] + b * 0.05], [a * 1.25, cv.O[1] - b * 0.1 * (0.4 + 0.6 * open)]];
    const stroke = up.concat(wing);
    tk.inkPath(g, stroke, { w: W, color: lashCol, taper: 0, pressure: (u) => (u < 0.55 ? 0.2 + 0.8 * Math.pow(smooth(u / 0.55), 1.2) : u < 0.8 ? 1 : 1 - 0.88 * smooth((u - 0.8) / 0.2)), wobble: 0, weightVar: 0, step: 1.5 });
    if (open > 0.5) {
      // three small lashes fanning out of the outer end, each a little shorter, and a floating crease line above the lid
      [[0.7, a * 0.2, 1.5], [0.83, a * 0.18, 1.3], [0.95, a * 0.15, 1.1]].forEach((l) => {
        const p = bezP(cv.up, l[0]), tg = bezT(cv.up, l[0]), nrm = [tg[1], -tg[0]];
        lash(g, p, [nrm[0] * 0.8 + tg[0] * 0.6, nrm[1] * 0.8 + tg[1] * 0.6], l[1], l[2], lashCol, 1);
      });
      const cr = []; for (let i = 0; i <= 8; i++) { const t = lerp(0.24, 0.74, i / 8), p = bezP(cv.up, t); cr.push([p[0] + a * 0.02, p[1] - b * 0.3 - b * 0.05 * Math.sin(PI * i / 8)]); }
      tk.inkPath(g, cr, { w: 0.95, color: J.hair, alpha: 0.62 * smooth((open - 0.5) / 0.4), taper: 0.5, wobble: 0, weightVar: 0, step: 1.5 });
    }
    // a thin lower lash hint at the outer end
    { const p = bezP(cv.lo, 0.04), tg = bezT(cv.lo, 0.04); lash(g, p, [tg[1] * 0.7 - tg[0] * 0.7, -tg[0] * 0.7 - tg[1] * 0.7], a * 0.2, 0.9, lashCol, 0.7); }
    g.restore();
  }

  // a closed eye: an arc with the same even lash line. happy = bowed up (smiling eyes), otherwise bowed down (a soft closed eye for singing)
  function closedEye(g, e, side, happy) {
    const a = e.w / 2, b = e.h / 2, W = a * 0.22;
    const P = happy ? [[-a, 0.3 * b], [-0.5 * a, -0.92 * b], [0.46 * a, -0.96 * b], [a, 0.24 * b]] : [[-a, -0.1 * b], [-0.46 * a, 0.7 * b], [0.5 * a, 0.7 * b], [a, -0.2 * b]];
    g.save();
    g.translate(e.x, e.y + (happy ? 0 : b * 0.12)); if (side < 0) g.scale(-1, 1);
    tk.inkPath(g, bezPts(P, 0, 1, 16), { w: W * 0.98, color: J.lash, taper: 0, pressure: (u) => (u < 0.5 ? 0.35 + 0.65 * smooth(u / 0.5) : 1 - 0.8 * smooth((u - 0.62) / 0.38)), wobble: 0, weightVar: 0, step: 1.5 });
    [[0.66, a * 0.2, 1.4], [0.8, a * 0.18, 1.25], [0.93, a * 0.15, 1.1]].forEach((l) => {
      const p = bezP(P, l[0]), tg = bezT(P, l[0]), nrm = happy ? [tg[1], -tg[0]] : [-tg[1], tg[0]];
      lash(g, p, [nrm[0] * 0.78 + tg[0] * 0.62, nrm[1] * 0.78 + tg[1] * 0.62], l[1], l[2], J.lash, 1);
    });
    g.restore();
  }

  function jEye(g, e, side, st) {
    const nm = st.eyes === 'open' || !st.eyes ? 'open' : st.eyes;
    if (nm === 'hurt') { RJ.hurtEye(g, e, side, { ink: J.lash, hurtLine: 2.3 }); return; }
    if (nm === 'closed' || nm === 'happy') { closedEye(g, e, side, nm === 'happy'); return; }
    openEye(g, e, side, st, Object.prototype.hasOwnProperty.call(EYE_PRE, nm) ? EYE_PRE[nm] : EYE_PRE.open);
  }

  // a soft arched brow: the arch peaks about 46% along from the inner end, the outer tail dips a little, thin and evenly tapered. side -1 near, +1 far.
  function jBrow(g, x, y, w, side, tilt, th) {
    const sx = side < 0 ? -1 : 1, arch = w * 0.17, pts = [];
    for (let i = 0; i <= 12; i++) {
      const u = i / 12, lx = (u - 0.5) * w, ly = -arch * Math.sin(PI * Math.pow(u, 0.9)) + w * 0.075 * u * u + tilt * w * 0.3 * (0.5 - u);
      pts.push([x + sx * lx, y + ly]);
    }
    tk.inkPath(g, pts, { w: th, color: J.brow, pressure: (u) => (u < 0.25 ? 0.55 + 0.45 * smooth(u / 0.25) : 1 - 0.8 * smooth((u - 0.45) / 0.55)), taperStart: 0.02, taperEnd: 0, wobble: 0, weightVar: 0, step: 1.5 });
  }

  // a small nose hint exactly on the centre line: a tiny curved tick whose middle is on x = cx, and a soft shade dab under it
  function jNose(g) {
    const x = FG.cx, y = FG.noseY;
    g.save(); g.globalAlpha *= 0.28; g.fillStyle = C.skinDeep; g.beginPath(); g.ellipse(x, y + 2.4, 2.3, 1.1, 0, 0, TAU); g.fill(); g.restore();
    tk.inkPath(g, [[x - 0.9, y - 2.4], [x + 0.7, y - 0.1], [x + 0.2, y + 1.9]], { w: 1.25, color: J.hair, alpha: 0.7, taper: 0.5, wobble: 0, weightVar: 0, step: 1 });
  }

  // blush: a soft rose glow with three short slanting marks, mirrored about the centre line (the far one a little smaller)
  function jBlush(g, x, y, w, side, k) {
    const al = clamp(0.28 * k + 0.14, 0.08, 0.6), ww = w * clamp(k, 0.4, 1.7) ** 0.5, sx = side < 0 ? -1 : 1;
    g.save(); g.translate(x, y); g.scale(1, 0.6);
    if (canGrad(g)) {
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, ww * 0.58);
      gr.addColorStop(0, rgba(C.blush, al)); gr.addColorStop(0.5, rgba(C.blush, al * 0.8)); gr.addColorStop(1, rgba(C.blush, 0));
      g.fillStyle = gr;
    } else g.fillStyle = rgba(C.blush, al * 0.6);
    g.beginPath(); g.arc(0, 0, ww * 0.58, 0, TAU); g.fill();
    g.restore();
    g.save(); g.strokeStyle = '#e8707e'; g.globalAlpha *= clamp(0.16 + 0.26 * k, 0.12, 0.6); g.lineWidth = 0.85; g.lineCap = 'round';
    g.beginPath();
    for (let i = 0; i < 3; i++) { const bx = x + sx * (i - 1) * ww * 0.16, by = y + 0.5; g.moveTo(bx - sx * ww * 0.045, by + ww * 0.13); g.lineTo(bx + sx * ww * 0.045, by - ww * 0.13); }
    g.stroke(); g.restore();
  }

  // ---- mouths: symmetric about the centre line, a defined upper lip with a cupid's bow dip, a rose inner mouth and a pink tongue ----
  const MOUTH_HAPPY = [[-0.5, 0.0], [-0.34, -0.045], [-0.17, -0.05], [0, -0.015], [0.17, -0.05], [0.34, -0.045], [0.5, 0.0], [0.48, 0.2], [0.41, 0.4], [0.27, 0.55], [0.1, 0.6], [0, 0.605], [-0.1, 0.6], [-0.27, 0.55], [-0.41, 0.4], [-0.48, 0.2]].map((p) => [p[0] * 1.1, p[1]]);       // a touch wider than tall, like the card's big D
  const MOUTH_SING = [[0, -0.045], [0.14, -0.06], [0.27, 0.02], [0.32, 0.19], [0.28, 0.39], [0.15, 0.53], [0, 0.57], [-0.15, 0.53], [-0.28, 0.39], [-0.32, 0.19], [-0.27, 0.02], [-0.14, -0.06]];
  const MOUTH_OW = [[-0.4, 0.0, 1], [-0.2, -0.05], [0, -0.015], [0.2, -0.05], [0.4, 0.0, 1], [0.38, 0.2], [0.2, 0.4], [0, 0.46], [-0.2, 0.4], [-0.38, 0.2]];
  function openMouth(g, x, y, w, shape, nTop, tongueY, tongueW) {
    const pts = shape.map((p) => [x + p[0] * w, y + p[1] * w, p[2]]);
    g.save();
    g.beginPath(); tk.trace(g, pts); g.clip();
    if (canGrad(g)) { const gr = g.createLinearGradient(0, y, 0, y + w * 0.6); gr.addColorStop(0, '#b94456'); gr.addColorStop(0.45, '#d9626f'); gr.addColorStop(1, '#e8737f'); g.fillStyle = gr; } else g.fillStyle = '#d9626f';
    g.fillRect(x - w, y - w * 0.3, w * 2, w * 1.2);
    g.fillStyle = '#f59aa6'; g.beginPath(); g.ellipse(x, y + w * tongueY, w * tongueW, w * 0.15, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,214,222,0.6)'; g.beginPath(); g.ellipse(x - w * 0.04, y + w * (tongueY - 0.03), w * tongueW * 0.5, w * 0.04, 0, 0, TAU); g.fill();
    g.restore();
    tk.inkPath(g, pts, { closed: true, w: 1.15, color: C.ink, align: 0, wobble: 0, weightVar: 0.2, step: 1 });
    // the upper lip line a little bolder, tapering at the corners
    if (nTop) { const top = pts.slice(0, nTop); tk.inkPath(g, top, { w: 1.75, color: C.ink, taper: 0.3, wobble: 0, weightVar: 0, step: 1.5 }); }
  }
  function jMouth(g, kind, x, y, w) {
    if (kind === 'happyOpen') openMouth(g, x, y, w * 1.2, MOUTH_HAPPY, 7, 0.4, 0.26);
    else if (kind === 'sing') openMouth(g, x, y, w * 0.96, MOUTH_SING, 0, 0.4, 0.2);
    else if (kind === 'ow') openMouth(g, x, y, w, MOUTH_OW, 5, 0.34, 0.22);
    else if (kind === 'smile' || !kind) {
      // a small closed smile: the line dips at the middle, a cupid's bow hint above it, a soft lower lip below
      tk.inkPath(g, [[x - w * 0.5, y - w * 0.04], [x - w * 0.27, y + w * 0.09], [x, y + w * 0.13], [x + w * 0.27, y + w * 0.09], [x + w * 0.5, y - w * 0.04]], { w: 1.5, color: C.ink, taper: 0.4, wobble: 0, weightVar: 0, step: 1.5 });
      tk.inkPath(g, [[x - w * 0.14, y + w * 0.27], [x, y + w * 0.3], [x + w * 0.14, y + w * 0.27]], { w: 0.95, color: C.inkSoft, alpha: 0.55, taper: 0.5, wobble: 0, weightVar: 0 });
      tk.inkPath(g, [[x - w * 0.51, y - w * 0.04], [x - w * 0.55, y - w * 0.09], [x - w * 0.575, y - w * 0.15]], { w: 0.9, color: C.ink, alpha: 0.5, taper: 0.5, wobble: 0, weightVar: 0, step: 1 });
      tk.inkPath(g, [[x + w * 0.51, y - w * 0.04], [x + w * 0.55, y - w * 0.09], [x + w * 0.575, y - w * 0.15]], { w: 0.9, color: C.ink, alpha: 0.5, taper: 0.5, wobble: 0, weightVar: 0, step: 1 });
    } else RJ.mouth(g, x, y, w, kind, { lineW: 1.4, inner: '#d9626f', tongue: '#f29aa0' });
  }

  // the whole face for one frame. S.face = {eyes, mouth, brow, browY, blush, look, open, sweat}
  function jFace(g, S) {
    const st = S.face, F = S.spec.face;
    if (!F) return;
    const k = clamp(num(st.blush, 1), 0.2, 1.8);
    jBlush(g, F.blush[0][0], F.blush[0][1], F.blush[0][2], -1, k);
    jBlush(g, F.blush[1][0], F.blush[1][1], F.blush[1][2], 1, k);
    jNose(g);
    jEye(g, F.eyes[0], -1, st);
    jEye(g, F.eyes[1], 1, st);
    const tl = num(st.brow), by = num(st.browY);
    jBrow(g, F.brows[0][0] + 1.5, F.brows[0][1] + by + 1.5, F.brows[0][2] - 2, -1, tl, 5.2);
    jBrow(g, F.brows[1][0], F.brows[1][1] + by + 1.5, F.brows[1][2], 1, tl, 4.8);
    jMouth(g, st.mouth, F.mouth[0], F.mouth[1], F.mouth[2]);
    if (num(st.sweat) > 0.3 && F.sweat) RJ.fxSweat(g, F.sweat[0], F.sweat[1], F.sweat[2] || 5);
  }

  function faceSpec() {
    const nx = FG.near.x, fx = FG.far.x;
    return {
      eyes: [FG.near, FG.far],
      brows: [[FG.cx - FG.gap / 2 - 1 - FG.browWn / 2, FG.browY, FG.browWn], [FG.cx + FG.gap / 2 + 1 + FG.browWf / 2, FG.browY, FG.browWf]],
      browStyle: { thick: 3.2, arch: 0.62, tilt: 0.0, color: J.brow },
      nose: [FG.cx, FG.noseY, 60],
      mouth: [FG.cx, FG.mouthY, FG.mouthW],
      mouthStyle: { lineW: 1.4, inner: '#d9626f', tongue: '#f29aa0' },
      blush: [[nx, FG.blushY, 19], [fx, FG.blushY, 17]],
      sweat: [57, -12, 5],
      eye: { iris: ['#3a2010', '#744820'], ring: '#2a1408', sclera: '#fffdfa', expr: 'neutral' },
    };
  }

  // ==================================================================================================================================
  // the head
  // ==================================================================================================================================
  // skin skull with its soft shadow, the face and the outline: shared by both skins
  function faceBase(g, S, hairShadow) {
    g.save();
    g.beginPath(); tk.trace(g, SKULL); g.clip();
    g.fillStyle = C.skin; g.fillRect(-90, -100, 180, 200);
    g.fillStyle = C.skinSh;
    g.beginPath(); g.rect(-100, -100, 200, 200); tk.trace(g, SKULL, RJ.lx(2.6), -4.4); g.fill('evenodd');
    if (hairShadow) { g.beginPath(); tk.trace(g, CAP_SOFT, 0, 6.5); g.fill(); }          // the hair's cast shadow on the forehead
    g.restore();
    jFace(g, S);
    RJ.ink(g, SKULL, { closed: true, w: LINE.main + 0.2, color: C.ink, align: 0.2, weightVar: 0.5 });
  }
  function drawHead(g, S) {
    const ey = FG.earY;
    RJ.ear(g, 58, ey - 1, { r: 9, side: 1 });                              // the far ear peeks out behind the cheek
    faceBase(g, S, true);
    // hair cap over it
    RJ.cel(g, CAP, J.hair, { shadow: false, line: LINE.main + 0.2, decor: capDecor, tension: 0.9, weightVar: 0.35 });
    RJ.ink(g, HAIRLINE, { w: LINE.mid, color: C.ink, taper: 0.12, pressure: 'flat', wobble: 0.02 });
    RJ.ear(g, -54, ey, { r: FG.earR, side: -1 });
    hoop(g, -54, ey);
    hairClip(g);
    scrunchie(g);
  }

  function poses() {
    const happy = { eyes: 'open', mouth: 'happyOpen', brow: -0.15 };
    return {
      idle: Object.assign({
        mic: 'hand', fHand: [22, -4], fBend: 1, micAng: 1.0, micGrip: 22,
        bHand: [-38, 14], bBend: -1, bKind: 'open', bSpread: 0.85, bRot: 0.12, flare: 0, fx: [], headRot: -0.04,
      }, happy),
      sing: { mic: 'mouth', micDx: 18, micDy: 11, micAng: 1.1, fBend: 1, bHand: [-36, 8], bBend: -1, bKind: 'open', bSpread: 0.8, bRot: 0.1, eyes: 'closed', mouth: 'sing', brow: -0.5, headRot: 0.05, flare: 0.3, fx: ['notes'] },
      attack: { mic: 'hand', fHand: [46, -6], fBend: 1, micAng: 0.2, micGrip: 24, bHand: [-34, 20], bBend: -1, bKind: 'open', bRot: 0.2, lean: 0.05, torsoRot: 0.04, headRot: 0.05, headDx: 2,
        eyes: 'determined', mouth: 'sing', brow: 0.5, browY: -1, flare: 0.7, fFoot: [22, -12], bFoot: [-14, -12], fx: ['arcs', 'sparkleMic'] },
      hurt: { mic: 'hand', fHand: [8, 12], fBend: 1, micAng: 1.3, micGrip: 22, lean: -0.1, torsoRot: -0.06, headRot: -0.12, headDx: -3, bHand: [-34, -10], bBend: -1, bKind: 'open', bSpread: 1.3, flare: -0.2,
        eyes: 'hurt', mouth: 'ow', brow: -0.8, sweat: 1, blush: 0.5, fFoot: [12, -12], bFoot: [-18, -12], fx: ['stars'] },
      cheer: { mic: 'hand', fHand: [22, -4], fBend: 1, micAng: 1.0, micGrip: 22, bHand: [-40, -34], bBend: -1, bKind: 'open', bRot: 0.3, bSpread: 1.4, eyes: 'happy', mouth: 'happyOpen', brow: -0.2, headRot: 0.05, flare: 0.8,
        fFoot: [18, -12], bFoot: [-14, -12], fx: ['hearts'] },
    };
  }

  // ---- the dress ----
  const BODICE = [[-14, -142], [-30, -136], [-27, -120], [-23, -104], [-22, -93, 1], [22, -93, 1], [23, -104], [27, -120], [30, -136], [14, -142], [10, -133], [5, -126], [0, -123], [-5, -126], [-10, -133]];
  function skirtPts(P) {
    const f = 1 + P.flare * 0.12, w = 43 * f, y = -49 + P.flare * 1.5;
    // five soft scallops along the hem, one per pleat
    return [[-23, -91, 1], [23, -91, 1], [w * 0.6, -70], [w * 1.0, y - 2], [w * 0.8, y + 2.2], [w * 0.4, y - 0.6], [0, y + 2.4], [-w * 0.4, y - 0.6], [-w * 0.8, y + 2.2], [-w * 1.0, y - 2], [-w * 0.6, -70]];
  }
  function dress(g, S) {
    const P = S.P;
    RJ.neck(g, 2, -152, { w: 20, h: 22 });
    // chest skin inside the scoop neckline
    RJ.cel(g, [[-16, -142], [16, -142], [8, -128], [0, -122], [-8, -128]], C.skin, { shadow: C.skinSh, line: false, depth: 3 });
    // skirt first (the bodice and waistband overlap its top)
    const sk = skirtPts(P);
    RJ.cel(g, sk, J.dressLt, { shadow: J.dress, line: LINE.main, depth: 5, tension: 0.6, decor: (gg) => {
      const w = 43 * (1 + P.flare * 0.12);
      for (let i = -2; i <= 2; i++) {                                                // five pleats fanning from the waist; every other one is a darker fold
        const hx = i * 9, tx = i * (w / 2.7);
        if (i % 2) RJ.fillPts(gg, [[hx - 3.2, -91], [hx + 3.2, -91], [tx + 7, -44], [tx - 7, -44]], J.pleat, 0.5);
        RJ.ink(gg, [[hx, -90], [tx * 0.55 + hx * 0.45, -70], [tx * 1.02, -48]], { w: 1.2, color: J.dressSh, taper: 0.45, wobble: 0, alpha: 0.9 });
      }
    } });
    RJ.cel(g, BODICE, J.dress, { shadow: J.dressSh, line: LINE.main, depth: 6, hi: '#ffc3d7', hiW: 1.5, tension: 0.8 });
    // waistband
    RJ.cel(g, [[-23.5, -96], [23.5, -96], [24.5, -89], [-24.5, -89]], J.pleat, { shadow: J.dressSh, line: LINE.mid, tension: 0.2, depth: 2 });
    necklace(g);
  }
  // the near arm's round shoulder cap lies over the dress, so the strap and the armhole edge are drawn again on top of it (clipped to the strap region)
  function strapOver(g, S) {
    if (S.P.mic === 'mouth') return;                              // the mic at the mouth: the raised forearm crosses the strap, so the shoulder must stay on top
    g.save();
    g.beginPath(); g.rect(15, -150, 30, 21); g.clip();
    RJ.cel(g, BODICE, J.dress, { shadow: J.dressSh, line: LINE.main, depth: 6, hi: '#ffc3d7', hiW: 1.5, tension: 0.8 });
    g.restore();
  }
  function necklace(g) {
    const pts = [];
    for (let i = 0; i <= 11; i++) {                                                  // a sagging string of pearls from strap to strap
      const u = i / 11, x = -13 + u * 26, y = -141 + Math.sin(u * Math.PI) * 13 + (Math.abs(u - 0.5) < 0.1 ? 1 : 0);
      pts.push([x, y]);
    }
    RJ.ink(g, pts, { w: 1, color: C.inkSoft, taper: 0, wobble: 0, alpha: 0.5 });
    pts.forEach((p, i) => { if (i === 5 || i === 6) return; g.beginPath(); g.arc(p[0], p[1], 2.1, 0, TAU); g.fillStyle = J.pearl; g.fill(); g.lineWidth = 0.9; g.strokeStyle = C.ink; g.stroke(); });
    // heart pendant
    RJ.cel(g, [[0, -112, 1], [-6, -118], [-3.4, -123], [0, -120.5], [3.4, -123], [6, -118]], J.pink, { shadow: J.pinkDk, line: LINE.mid, depth: 2, hi: '#ffc2d9', hiW: 1 });
  }

  // ==================================================================================================================================
  // THE UNICORN ONESIE SKIN ('jasmin_unicorn'): the same face (same grid, same face code), a fluffy pink and white hood with small ears and a strip of her brown
  // fringe under the trim, a cream spiral horn with a gold tip, a pastel rainbow mane tail (pink, lilac, mint, yellow) in place of the ponytail running down the
  // back of the hood, a pink and white onesie, hoof boots, the same mic with a pink band.
  // ==================================================================================================================================
  const UN = {
    pink: '#ffb9d6', pinkSh: '#f594bd', pinkLt: '#ffdbea', pinkDk: '#e86fa5',
    white: '#fffafd', whiteSh: '#e9dcf2', whiteLn: '#cdbce0',
    rose: '#ff9fc6', lilac: '#c9a8f4', mint: '#9fe8cf', yellow: '#ffe888',
    horn: '#fff1d8', hornSh: '#efd2a6', gold: '#ffcb4f', goldSh: '#e19d1c',
    hoof: '#d9c2f5', hoofSh: '#b99ce6', hoofLn: '#8d6cc4',
  };

  // dense closed polylines: a Catmull-Rom control ring flattened, offset along its normals and scalloped (fluffy edges)
  const denseOf = (ctrl) => { const f = tk.flatten(ctrl, { closed: true, step: 3 }), o = []; for (let i = 0; i + 1 < f.length; i += 2) o.push([f[i], f[i + 1]]); return o; };
  const polyDir = (P) => { let a = 0; for (let i = 0; i < P.length; i++) { const j = (i + 1) % P.length; a += P[i][0] * P[j][1] - P[j][0] * P[i][1]; } return a > 0 ? 1 : -1; };
  const normalsOf = (P) => {
    const sg = polyDir(P);
    return P.map((p, i) => { const a = P[(i + P.length - 1) % P.length], b = P[(i + 1) % P.length]; let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l; return [ty * sg, -tx * sg]; });
  };
  const offsetPoly = (P, d) => { const N = normalsOf(P); return P.map((p, i) => [p[0] + N[i][0] * d, p[1] + N[i][1] * d]); };
  function scallop(P, seg, amp) {
    const n = P.length, N = normalsOf(P), L = [0];
    for (let i = 1; i <= n; i++) L.push(L[i - 1] + Math.hypot(P[i % n][0] - P[i - 1][0], P[i % n][1] - P[i - 1][1]));
    const total = L[n] || 1, m = Math.max(3, Math.round(total / seg)), out = [];
    for (let i = 0; i < n; i++) { const u = (L[i] / total) * m, t = u - Math.floor(u), off = amp * Math.pow(Math.sin(PI * t), 0.8); out.push([P[i][0] + N[i][0] * off, P[i][1] + N[i][1] * off]); }
    return out;
  }
  // the face window of the hood (hairline moved up 6 so a strip of her brown fringe shows under the trim), the pink hood body, the white trim ring
  const WIN_CTRL = [[-47, 14], [-46, 1], [-43.5, -9], [-39, -18], [-33.5, -27], [-27, -35], [-19, -41.5], [-10, -46.5], [-1, -50], [9, -54], [20, -56.5], [31, -55.5], [41, -51.5], [50, -44], [55, -33], [57.8, -21], [58.6, -8],
    [58, 10], [52.6, 27.4], [41.2, 42.2], [26.6, 54], [9, 59.3], [-8.8, 55.3], [-23.6, 50.5], [-37.6, 40], [-50, 26]];           // the lower half hugs the skull, a hair inside it, so no gap shows between face and trim
  const HOOD_CTRL = [[2, -83], [26, -81], [46, -72], [62, -52], [72, -26], [75, 2], [74, 28], [68, 50], [54, 68], [34, 77], [10, 80], [-14, 78], [-36, 70], [-54, 56], [-67, 38], [-74, 14], [-76, -12], [-72, -40], [-58, -64], [-36, -79], [-14, -84]];
  const WIN = { poly: denseOf(WIN_CTRL) };
  const HOOD_OUT = { poly: scallop(denseOf(HOOD_CTRL), 21, 3.4) };
  const TRIM_OUT = { poly: scallop(offsetPoly(WIN.poly, 6.4), 12.5, 2.5) };

  // little curly fur marks, the cartoon's fluff
  function fluffMarks(g, pts, col, alpha) {
    g.save(); g.strokeStyle = col; g.globalAlpha *= alpha === undefined ? 0.9 : alpha; g.lineWidth = 1.25; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath();
    pts.forEach((p, i) => { const r = ((i * 37) % 7 - 3) * 0.12; g.moveTo(p[0] - 3 * Math.cos(r), p[1] + 1.4 - 3 * Math.sin(r)); g.quadraticCurveTo(p[0], p[1] - 3.2, p[0] + 3 * Math.cos(r), p[1] + 1.4 + 3 * Math.sin(r)); });
    g.stroke(); g.restore();
  }
  // a pointed unicorn ear (pink outside, soft white inside) at base (x, y), leaning by rot, scaled k
  function unicornEar(g, x, y, rot, k) {
    g.save(); g.translate(x, y); g.rotate(rot); g.scale(k, k);
    RJ.cel(g, [[-10, 2], [-10, -10], [-6.5, -23], [0, -35, 1], [6.5, -22], [10, -9], [10, 2]], UN.pink, { shadow: UN.pinkSh, line: LINE.main, depth: 4, hi: UN.pinkLt, hiW: 1.4, tension: 0.8 });
    RJ.cel(g, [[-5.2, 0], [-5.2, -9], [-3, -19], [0, -26, 1], [3, -18], [5.2, -8], [5.2, 0]], '#ffeaf3', { shadow: UN.whiteSh, line: false, depth: 2, tension: 0.8 });
    g.restore();
  }
  // the cream spiral horn with a gold tip: base (x, y) on the crown, leaning forward by rot
  function unicornHorn(g, x, y, rot) {
    g.save(); g.translate(x, y); g.rotate(rot);
    const pts = [[-8.5, 3], [-6.3, -11], [-3.2, -26], [0.6, -39, 1], [4.6, -25], [7.2, -11], [9, 3]];
    RJ.cel(g, pts, UN.horn, { shadow: UN.hornSh, line: LINE.main, depth: 4, hi: '#ffffff', hiW: 1.2, tension: 0.8, decor: (gg) => {
      for (let i = 0; i < 5; i++) { const yy = 2 - i * 9; RJ.ink(gg, [[-10, yy + 6], [0, yy - 1.5], [10, yy - 8]], { w: 2.1, color: UN.hornSh, taper: 0.1, wobble: 0, pressure: 'flat' }); }
      gg.beginPath(); gg.moveTo(-10, -27); gg.lineTo(10, -34); gg.lineTo(10, -50); gg.lineTo(-10, -50); gg.closePath(); gg.fillStyle = UN.gold; gg.fill();     // the gold tip
      RJ.ink(gg, [[-10, -27], [0, -30.5], [10, -34]], { w: 1.3, color: UN.goldSh, taper: 0.1, wobble: 0, pressure: 'flat' });
      RJ.ink(gg, [[-1.4, -36], [0.2, -30]], { w: 1.3, color: '#fff3b8', taper: 0.5, wobble: 0 });
    } });
    // a fluffy collar where the horn leaves the hood
    [-5.5, 0, 5.5].forEach((dx, i) => RJ.cel(g, tk.circlePts(dx, 2.6, 4.9 - (i === 1 ? 0 : 0.5), 10), UN.white, { shadow: UN.whiteSh, line: LINE.fine + 0.3, depth: 1.5 }));
    g.restore();
  }
  function hoodHead(g, S) {
    // the ears first, a little higher, so the scalloped fur edge of the hood overlaps their bases
    unicornEar(g, 49, -68, 0.4, 0.92);
    unicornEar(g, -9, -81, -0.3, 1);
    // the strip of brown fringe under the trim (the classic hair cap clipped to the window)
    g.save();
    g.beginPath(); tk.trace(g, WIN); g.clip();
    RJ.cel(g, CAP, J.hair, { shadow: false, line: LINE.main + 0.2, decor: capDecor, tension: 0.9, weightVar: 0.35 });
    RJ.ink(g, HAIRLINE, { w: LINE.mid, color: C.ink, taper: 0.12, pressure: 'flat', wobble: 0.02 });
    g.restore();
    // the pink hood: scalloped outer edge, window cut out, one hard shadow band on the lower left
    g.save();
    g.beginPath(); tk.trace(g, HOOD_OUT); tk.trace(g, WIN); g.fillStyle = UN.pink; g.fill('evenodd');
    g.save(); g.beginPath(); tk.trace(g, HOOD_OUT); tk.trace(g, WIN); g.clip('evenodd');
    g.fillStyle = UN.pinkSh; g.beginPath(); g.rect(-120, -120, 240, 240); tk.trace(g, HOOD_OUT, RJ.lx(6), -9); g.fill('evenodd');
    g.restore();
    g.restore();
    RJ.ink(g, HOOD_OUT, { closed: true, w: LINE.main + 0.2, color: C.ink, align: 0.3 });
    fluffMarks(g, [[-62, -30], [-66, 0], [-58, 36], [-40, 62], [66, -34], [70, -2], [66, 34], [40, -70], [-24, -72], [-50, -52], [22, 70], [-12, 72], [52, 58]], UN.pinkDk, 0.85);
    // the white fluffy trim round the face window
    g.save();
    g.beginPath(); tk.trace(g, TRIM_OUT); tk.trace(g, WIN); g.fillStyle = UN.white; g.fill('evenodd');
    g.save(); g.beginPath(); tk.trace(g, TRIM_OUT); tk.trace(g, WIN); g.clip('evenodd');
    g.fillStyle = UN.whiteSh; g.beginPath(); g.rect(-120, -120, 240, 240); tk.trace(g, TRIM_OUT, RJ.lx(3.4), -5.2); g.fill('evenodd');
    g.restore();
    g.restore();
    RJ.ink(g, TRIM_OUT, { closed: true, w: LINE.main, color: C.ink, align: 0.3 });
    RJ.ink(g, WIN, { closed: true, w: LINE.main, color: C.ink, align: -0.3 });
    fluffMarks(g, [[-52, -2], [-50, 30], [-30, 52], [52, -42], [62, 8], [52, 40], [-4, 68]], UN.whiteLn, 0.9);
    // the horn and the scrunchie where the mane tail leaves the hood
    unicornHorn(g, 21, -76, 0.12);
    scrunchie(g, { base: UN.white, shade: UN.whiteSh, hi: '#ffffff', fold: UN.whiteLn });                     // a fluffy white scrunchie ties the mane tail
  }

  // the mane tail replaces the ponytail: the same silhouette in four pastel bands (pink at the root, then lilac, mint and yellow at the curl)
  const cutPoly = (a, b, far) => {                                         // the half plane on one side of the (softly waving) line a-b, in card coordinates
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, k = 10, nx = -dy / len, ny = dx / len, n = 48, pts = [];
    for (let i = 0; i <= n; i++) {
      const t = -k + (i / n) * (2 * k + 1), w = 2.8 * Math.sin(t * len / 5.5);
      pts.push([a[0] + dx * t + nx * w, a[1] + dy * t + ny * w]);
    }
    const f0 = pts[0], f1 = pts[n];
    pts.push([f1[0] + far[0], f1[1] + far[1]], [f0[0] + far[0], f0[1] + far[1]]);
    return pts.map((p) => [-p[0] - 4, p[1], 1]);                           // sharp corners everywhere: a plain polygon
  };
  const MANE_CUTS = [[[130, -66], [60, -38], [0, 900], UN.lilac], [[130, -8], [58, 10], [0, 900], UN.mint], [[130, 36], [60, 48], [0, 900], UN.yellow]];
  function maneTail(g, S) {
    g.save();
    g.translate(-39, -72); g.rotate(0.09 + S.P.hairSwing * 0.05); g.translate(39, 72);
    RJ.cel(g, TAIL_OUTLINE, UN.rose, { shadow: false, line: LINE.main + 0.2, tension: 0.85, weightVar: 0.3, decor: (gg) => {
      MANE_CUTS.forEach((c) => RJ.fillPts(gg, cutPoly(c[0], c[1], c[2]), c[3], 1));
      gg.save(); gg.globalCompositeOperation = 'multiply'; RJ.fillPts(gg, TAIL_SHADOW, '#f3e2fb', 0.6); gg.restore();                // the one hard shadow, tinted by the band under it
      TAIL_LIGHT.forEach((l) => RJ.fillPts(gg, MX(l), '#ffffff', 0.5));
      TAIL_LINES.forEach((l, i) => RJ.ink(gg, MX(l), { w: 1.5, color: '#9a63b8', taper: 0.45, wobble: 0.03, alpha: 0.5, seed: i }));
      TAIL_HATCH.forEach((h, i) => RJ.ink(gg, MX(h), { w: 1.3, color: '#ffffff', taper: 0.5, wobble: 0, alpha: 0.7, seed: i }));
    } });
    g.restore();
  }

  // ---- the onesie ----
  const ONESIE = [[-17, -146], [-30, -141], [-35, -128], [-35, -106], [-33, -88], [-35, -70], [-31, -60], [-15, -54], [0, -59], [15, -54], [31, -60], [35, -70], [33, -88], [35, -106], [35, -128], [30, -141], [17, -146]];
  function onesie(g, S) {
    RJ.neck(g, 2, -152, { w: 20, h: 22 });
    RJ.cel(g, ONESIE, UN.pink, { shadow: UN.pinkSh, line: LINE.main, depth: 8, hi: UN.pinkLt, hiW: 1.6, hiAlpha: 0.8, tension: 0.9 });
    // the white fluffy tummy panel with the zip running down the front (a little right of centre, the 3/4 view)
    RJ.cel(g, tk.ellipsePts(6, -92, 16, 21, 16), UN.white, { shadow: UN.whiteSh, line: LINE.mid, depth: 5, hi: '#ffffff', hiW: 1.3 });
    RJ.ink(g, [[6, -128], [6.4, -108], [6, -88], [6.4, -66]], { w: 3.2, color: C.ink, taper: 0, wobble: 0 });
    RJ.ink(g, [[6, -128], [6.4, -108], [6, -88], [6.4, -66]], { w: 1.5, color: '#f3dbe8', taper: 0, wobble: 0 });
    RJ.cel(g, [[6, -121], [10.4, -117], [9, -110.5], [6, -108.5], [3, -110.5], [1.6, -117]], UN.gold, { shadow: UN.goldSh, line: LINE.fine + 0.3, depth: 1.5, tension: 0.7 });       // the zip pull
    fluffMarks(g, [[-24, -122], [-26, -96], [24, -118], [27, -92], [-22, -70], [24, -68]], UN.pinkDk, 0.8);
    fluffMarks(g, [[-4, -82], [14, -100]], UN.whiteLn, 0.9);
    // a little gold star patch on the chest, on the near side
    tk.sparkle(g, -17, -112, 5.5, { color: UN.gold, glow: 0.15, thin: 0.35 });
  }
  // a hoof boot at the ankle (drawn over the leg): a cream fluffy boot with a lilac hoof and its cleft, and a scalloped white cuff
  function hoofBoot(g, hip, an) {
    g.save(); g.translate(an[0], an[1]);
    RJ.cel(g, [[-11, -4], [-13.5, 4], [-11, 12.4, 1], [22, 12.4, 1], [28.4, 7], [25.4, -1], [14, -4], [2, -8]], UN.white, { shadow: UN.whiteSh, line: LINE.main, depth: 5, hi: '#ffffff', hiW: 1.4, tension: 0.9 });
    // the hoof: a rounded lilac cap over the toe with a darker lower wall, a lighter rim and the cleft
    RJ.cel(g, [[7, -2.5], [16, -3.5], [25, -1.2], [28.6, 6], [27, 12.4, 1], [7, 12.4, 1]], UN.hoof, { shadow: UN.hoofSh, line: LINE.main, depth: 4.5, hi: '#efe2ff', hiW: 1.3, tension: 0.7, decor: (gg) => {
      RJ.ink(gg, [[7, 1.5], [16, 0.2], [27, 2.4]], { w: 1.2, color: UN.hoofLn, taper: 0.3, wobble: 0, alpha: 0.8 });                      // where the hoof wall meets the pastern
      RJ.ink(gg, [[19.4, 1.4], [19.9, 12.4]], { w: 1.4, color: UN.hoofLn, taper: 0.45, wobble: 0 });                                       // the cleft
    } });
    // the fluffy cuff round the ankle, scalloped
    RJ.cel(g, [[-14, -17], [-9, -20], [-4, -17], [1, -20], [6, -17], [11, -20], [14, -16], [15, -7], [11, -4], [6, -7], [1, -4], [-4, -7], [-9, -4], [-14, -7]], UN.white, { shadow: UN.whiteSh, line: LINE.main, depth: 3, hi: '#ffffff', hiW: 1.2, tension: 0.7 });
    g.restore();
  }

  function makeJasmin(uni) {
    const base = poses();
    const spec = {
      id: uni ? 'jasmin_unicorn' : 'jasmin',
      accent: 'jasmin',
      skel: { shF: [21, -122], shB: [-24, -124], hipF: [12, -58], hipB: [-12, -58] },
      base: {},
      poses: Object.assign(base, { bust: Object.assign({}, base.idle, { bHand: [-22, 44], bBend: 1, bKind: 'relaxed', bRot: 0.1, bSpread: 1 }) }),
      face: faceSpec(),
      exprs: { smirk: { eyes: 'open', mouth: 'smirk', brow: 0.2 }, angry: { eyes: 'determined', mouth: 'frown', brow: 0.8 } },
      arm: uni ? { l: [26, 24], w: [19, 15], skin: UN.pink, skinSh: UN.pinkSh, cuff: { color: UN.white, light: UN.whiteSh }, hand: { skin: C.skin, shade: C.skinSh } }
        : { l: [26, 24], w: [17, 13], skin: C.skin, skinSh: C.skinSh, hand: { skin: C.skin, shade: C.skinSh } },
      legs: uni ? {
        w: [29, 23], color: UN.pink, shade: UN.pinkSh, bow: 1.5, pantsOver: true,
        shoe: { color: UN.white, shade: UN.whiteSh, k: 0.001 },                                  // hidden: the hoof boot in decor replaces the sneaker
        decor: hoofBoot,
      } : {
        w: [27, 21], color: C.skin, shade: C.skinSh, bow: 1.5,
        sock: { color: J.white, shade: J.whiteSh, len: 17 },
        shoe: { color: J.white, sole: '#ffe1ea', shade: J.whiteSh, toeCap: '#ffcadb', heel: '#c4e4ff', hi: '#ffffff' },
      },
      mic: { accent: J.pink, headR: 11.5, len: 40, bands: 2 },
      bounds: uni ? { w: 256, h: 336, x0: -164, x1: 92 } : { w: 238, h: 322, x0: -158, x1: 80 },   // the tail swings far to the back: the box is lopsided, hair (the unicorn hood and horn too) and the widest pose reach (not effects)
      bust: uni ? { rect: [-112, -344, 104, -92], face: [-76, -322, 90, -132], pose: 'bust' } : { rect: [-112, -306, 96, -92], face: [-68, -286, 80, -140], pose: 'bust' },
      layers: uni ? {
        backHair: (g, S) => maneTail(g, S),
        torso: (g, S) => onesie(g, S),
        head: (g, S) => { faceBase(g, S, false); hoodHead(g, S); },
      } : {
        backHair: (g, S) => ponytail(g, S),
        torso: (g, S) => dress(g, S),
        head: (g, S) => drawHead(g, S),
        over: (g, S) => strapOver(g, S),
      },
    };
    return spec;
  }
  // The kit fits the portrait crop to the bust pose only. A pose that moves the head (attack leans in about 23 units, hurt recoils about 37) would lose part of
  // the face, so for any other pose the same crop is shifted by that pose's head offset (one rig per pose, built on first use; the offset is the middle of the
  // head's travel over a few seconds, so the crop holds still while the head bobs). Anything odd falls back to the kit's own crop.
  function followHead(spec) {
    const impl = RJ.rig(spec), base = impl.bust, bp = spec.bust.pose, rigs = {};
    const mid = (pose) => {                                              // the centre of the head's range of travel in this pose
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (let i = 0; i < 9; i++) { const h = impl.points({ pose, t: i * 0.35 }).head; x0 = Math.min(x0, h[0]); x1 = Math.max(x1, h[0]); y0 = Math.min(y0, h[1]); y1 = Math.max(y1, h[1]); }
      return [(x0 + x1) / 2, (y0 + y1) / 2];
    };
    const shifted = (pose) => {
      const a = mid(bp), b = mid(pose);
      const dx = num(b[0]) - num(a[0]), dy = num(b[1]) - num(a[1]), mv = (r) => [r[0] + dx, r[1] + dy, r[2] + dx, r[3] + dy];
      return RJ.rig(Object.assign({}, spec, { bust: Object.assign({}, spec.bust, { rect: mv(spec.bust.rect), face: mv(spec.bust.face) }) }));
    };
    impl.bust = function (ctx, w, h, o) {
      const pose = o && typeof o.pose === 'string' ? o.pose : bp;
      if (pose === bp || !Object.prototype.hasOwnProperty.call(spec.poses, pose)) return base.call(impl, ctx, w, h, o);
      let r = rigs[pose];
      if (!r) { try { r = shifted(pose); } catch (e) { r = impl; } rigs[pose] = r; }
      return r === impl ? base.call(impl, ctx, w, h, o) : r.bust(ctx, w, h, o);
    };
    return impl;
  }
  RJ.register('jasmin', followHead(makeJasmin(false)));
  RJ.register('jasmin_unicorn', followHead(makeJasmin(true)));
})();

// crew.js: the crew characters of the RoxorLoops and Jasmin cast, built on kit.js (RJ.rig). The three friends are likenesses drawn from photos the owners
// provided, in the same chibi style as the two mains (same ink line, cel shading and scale): the hairstyle, glasses and clothes are what is kept, the faces
// stay gentle and symmetric. Each character is one block with a palette object at its top, so a correction is a colour or a shape swap, not a rewrite.
//   'rawclaw'       the electronic producer and beatboxer. Accent ELECTRIC VIOLET. Black hair in one smooth swept-up wave leaning to the viewer's right with a soft fade at both temples, strong dark
//                   straight brows, a gentle symmetric face with a soft smile, warm olive skin, a light stubble hint, a light grey zip jacket with a dark collar over a navy hoodie (hood down, round the neck)
//                   and a blue tee at the throat, headphones round the neck on a violet-edged band and cord, a pad sampler on a strap whose pads light up with the pose and whose
//                   little screen shows the glowing three-slash claw mark.
//   'rawclaw_goat'  his joke profile picture as a friendly goat cosplay: the same body and clothes, two floppy cream goat ears out to the sides, two small horns, a
//                   longer muzzle-ish chin with a tiny cream goat beard that curls at the tip, big warm eyes and a happy open mouth. Same five poses and bust.
//   'andy'          the groovy bass player and loop-pedal tinkerer. Accent WARM ORANGE. Shaggy hair with an orange headband, a retro striped tee, bell-bottoms,
//                   a sunburst bass on a strap (the attack is a thumb slap with sound rings) and a loop pedal with a green LED on the ground.
//   'jordan'        the virtual assistant who draws the graphics and runs the merch shop. Accent TEAL. Black wavy shoulder-length hair parted in the middle, round
//                   thin black-rimmed glasses, light tan skin, a slim build in a black tee with a big pale teal disc badge high on the chest and black pants, black bracelets on one wrist and a blue-faced
//                   wristwatch on the other, a small plain round pendant on a dark cord, teal piping on the hem, sleeves and trouser cuffs, a teal merch tote and a tablet in a teal case with a stylus.
// Same interface and scale as roxor.js and jasmin.js: RJ.register(id, RJ.rig(spec)) gives {draw, bust, bounds, points}.
//   Props: things that hang on the body (the sampler, the bass, the tote) are drawn in the torso layer, under the arms. Things the hands hold and move
//   (the assistant's tablet and stylus) are drawn in figure space from the 'top' layer (so portraits have them too) and the gripping hands are drawn again on
//   top, so a prop never covers its own fingers. the bass player's pedal and cable sit on the ground in the 'fx' hook (not part of a portrait).
//   spec.tweak(P, t): crew.js wraps RJ.resolve once so a spec may edit the resolved pose numbers over time (a hand lifting between slaps, fingers
//   drumming). It is optional, pure in t, and a throwing tweak is swallowed. kit.js is untouched (crewRig wraps each crew portrait to fix its framing in tall boxes).
(function () {
  'use strict';
  const tk = ART.tk, C = RJ.C, LINE = RJ.LINE, mat = tk.mat;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const fr = (v) => v - Math.floor(v);

  RJ.ACCENT.rawclaw = { main: '#8b4dff', dark: '#4a1fb5', light: '#d2bcff', glow: '#b78cff' };
  RJ.ACCENT.andy = { main: '#ff8a1f', dark: '#b5530a', light: '#ffd0a0', glow: '#ffb45e' };
  RJ.ACCENT.jordan = { main: '#1fc4bd', dark: '#0b6f72', light: '#a6efe9', glow: '#6ff0e6' };

  // ------------------------------------------------------------------------------------------------------------------------------------------------
  // shared helpers (all the crew)
  // ------------------------------------------------------------------------------------------------------------------------------------------------
  // OPTIONAL POSE ANIMATION HOOK. kit.js poses are static tables plus a beat pulse; a crew spec may add spec.tweak(P, t) which edits the resolved pose numbers
  // (a hand lifting between slaps, fingers drumming). RJ.resolve is wrapped once; specs without a tweak are untouched. Always assign fresh arrays in a tweak.
  if (!RJ._crewTweak) {
    RJ._crewTweak = true;
    const baseResolve = RJ.resolve;
    RJ.resolve = function (spec, pose, t, expr) {
      const P = baseResolve(spec, pose, t, expr);
      if (spec && typeof spec.tweak === 'function') { try { spec.tweak(P, isFinite(t) ? +t : 0); } catch (e) { /* a bad tweak must never break a draw */ } }
      return P;
    };
  }
  // many short ink strokes: list items are [x0, y0, x1, y1] or a point list
  const strokes = (g, list, o) => list.forEach((l, i) => RJ.ink(g, typeof l[0] === 'number' ? [[l[0], l[1]], [l[2], l[3]]] : l, Object.assign({ w: 1.25, taper: 0.5, wobble: 0, seed: i }, o)));
  // a box with rounded corners as an explicit polygon (draw it with tension 0)
  function rbox(x, y, w, h, r, n) {
    r = Math.min(r, w / 2, h / 2); n = n || 3;
    const pts = [], cs = [[x + w - r, y + r, -0.5], [x + w - r, y + h - r, 0], [x + r, y + h - r, 0.5], [x + r, y + r, 1]];
    for (let c = 0; c < 4; c++) for (let i = 0; i <= n; i++) { const a = (cs[c][2] + i / n * 0.5) * Math.PI; pts.push([cs[c][0] + Math.cos(a) * r, cs[c][1] + Math.sin(a) * r]); }
    return pts;
  }
  // skull, soft skin shadow, optional cast shadow of the hair, then the face and the outline. The hair is drawn over it by the caller.
  // o: {skull, skin, shade, cast (a polygon: the hair's cast shadow on the forehead), castDy, under (fn(g) drawn inside the skull, before the face)}
  // The skin shade offset goes through RJ.lx so a flipped figure keeps its key light on the upper right of the screen (as in roxor.js).
  function headBase(g, S, o) {
    const skull = o.skull || RJ.SKULL;
    g.save();
    g.beginPath(); tk.trace(g, skull); g.clip();
    g.fillStyle = o.skin || C.skin; g.fillRect(-130, -130, 260, 260);
    g.fillStyle = o.shade || C.skinSh;
    g.beginPath(); g.rect(-130, -130, 260, 260); tk.trace(g, skull, RJ.lx(4.5), -8); g.fill('evenodd');
    if (o.cast) { g.beginPath(); tk.trace(g, o.cast, 0, o.castDy === undefined ? 7 : o.castDy); g.fill(); }
    if (o.under) o.under(g);
    g.restore();
    RJ.drawFace(g, S);
    RJ.ink(g, skull, { closed: true, w: LINE.main + 0.2, color: C.ink, align: 0.2, weightVar: 0.5 });
  }
  // torso rest space to figure space (live, with the pose)
  const tPt = (S, x, y) => mat.pt(S.M.torso, x, y);
  // the wrist of an arm, solved like the rig solves it: used to draw a hand again on top of a prop
  function wristOf(S, front) {
    const P = S.P, pt = S.pt, ar = S.spec.arm || {}, l = ar.l || [23, 21];
    const sh = front ? pt.shF : pt.shB, tg = front ? pt.hand : [pt.shB[0] + P.bHand[0], pt.shB[1] + P.bHand[1]];
    const r = RJ.ik2(sh, tg, l[0], l[1], front ? P.fBend : P.bBend);
    return { w: r.w, e: r.e, ang: Math.atan2(r.w[1] - r.e[1], r.w[0] - r.e[0]) };
  }
  function redrawHand(g, S, front, kind, rot) {
    const P = S.P, k = wristOf(S, front), hs = (S.spec.arm && S.spec.arm.hand) || {};
    RJ.hand(g, kind || (front ? P.fKind : P.bKind), k.w[0], k.w[1], k.ang + (rot === undefined ? (front ? P.fRot : P.bRot) : rot), Object.assign({ spread: front ? P.fSpread : P.bSpread }, hs));
  }
  // a four-point sparkle patch / glint with an ink-free light core
  function glint(g, x, y, r, col) { tk.sparkle(g, x, y, r, { color: col || '#ffffff', glow: 0.25, thin: 0.2 }); }
  // little round LED with a light core and an additive halo (halo 0 = no glow)
  function led(g, x, y, r, col, halo, a) {
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = col; g.fill();
    g.beginPath(); g.arc(x - r * 0.25, y - r * 0.3, r * 0.4, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.8)'; g.fill();
    if (halo) tk.glow(g, x, y, halo, col, a === undefined ? 0.6 : a, false);
  }
  // a thin band across a forearm at distance d from the wrist (towards the elbow): bracelets and watch straps. k = the arm's own unit vector (elbow to wrist).
  function armBand(g, wr, d, half, col, th, edge) {
    const ux = Math.cos(wr.ang), uy = Math.sin(wr.ang), nx = -uy, ny = ux, cx = wr.w[0] - ux * d, cy = wr.w[1] - uy * d;
    const a = [cx - nx * half, cy - ny * half], b = [cx + nx * half, cy + ny * half];
    RJ.ink(g, [a, b], { w: th + 2.4, color: edge || C.ink, taper: 0, wobble: 0, weightVar: 0 });
    RJ.ink(g, [a, b], { w: th, color: col, taper: 0, wobble: 0, weightVar: 0 });
  }

  // PORTRAIT FRAMING. kit.js works out the crop offset before it shrinks the zoom to fit spec.bust.face, so in a box taller than a wide head (the goat's ears in a
  // portrait box) the head ends up pushed to the bottom with an empty band above it. crewRig builds the rig, then wraps its bust: the framing is worked out here with
  // the offset taken AFTER the shrink (same rules as the kit: cover the rect, shrink until the face fits with 10% to spare, centre on the face in a short box, keep
  // the face inside), and the kit is handed an equivalent plain rect, so kit.js stays untouched. Odd sizes are passed straight to the kit, which validates them.
  function crewRig(spec) {
    const impl = RJ.rig(spec), kitBust = impl.bust;
    impl.bust = function (ctx, w, h, o) {
      const bs = spec.bust, R = bs && bs.rect, F = bs && bs.face;
      if (!(typeof w === 'number' && typeof h === 'number' && w > 0 && h > 0 && w < 1e5 && h < 1e5 && R && F)) return kitBust.call(impl, ctx, w, h, o);
      const rw = R[2] - R[0], rh = R[3] - R[1], fw = F[2] - F[0], fh = F[3] - F[1];
      const k = Math.min(Math.max(w / rw, h / rh), Math.min(w / fw, h / fh) / 1.1);
      const fcx = (F[0] + F[2]) / 2, fcy = (F[1] + F[3]) / 2, hx = fw / 2 * k * 1.05, hy = fh / 2 * k * 1.05;
      const x0 = hx - fcx * k, x1 = w - hx - fcx * k, y0 = hy - fcy * k, y1 = h - hy - fcy * k;
      let tx = w / 2 - (R[0] + R[2]) / 2 * k, ty = -R[1] * k;
      tx = clamp(tx, Math.min(x0, x1), Math.max(x0, x1));
      if (h < rh * k - 0.5) ty = h * 0.46 - fcy * k;
      ty = clamp(ty, Math.min(y0, y1), Math.max(y0, y1));
      const kept = spec.bust;
      spec.bust = Object.assign({}, bs, { rect: [-tx / k, -ty / k, (w - tx) / k, (h - ty) / k], face: undefined });
      try { return kitBust.call(impl, ctx, w, h, o); } finally { spec.bust = kept; }
    };
    return impl;
  }

  // ================================================================================================================================================
  // RAWCLAW: the producer. Swept-up tousled dark hair with a short fade, strong brows, warm olive skin with a stubble hint, light grey jacket with a dark collar
  // over a navy hoodie (hood down), blue tee at the throat, headphones round the neck on a violet cord, pad sampler on a strap with the glowing claw mark.
  // 'rawclaw_goat' is the same body and clothes with a friendly goat-cosplay head (see makeRawclaw(true)).
  // ================================================================================================================================================
  const R = {
    hair: '#2d221d', hairSh: '#170e0a', hairHi: '#745b4b',
    skin: '#ecc196', skinSh: '#d6a077', skinHi: '#f8dcb9', skinDeep: '#c08a62',
    fade: '#6e5750', fadeDk: '#4d3b3a', stub: '#7d5c47',
    jacket: '#cfd2de', jacketSh: '#a3a8bf', jacketHi: '#f0f2f8', collar: '#2c3049', collarSh: '#181a2c', zip: '#80849c',
    hood: '#2f4175', hoodSh: '#1b2756', hoodHi: '#5b6eb0', hoodDk: '#111838', cord: '#8fa0d8',
    tee: '#2f6bef', teeSh: '#1c45b8',
    pants: '#303450', pantsSh: '#1e2136',
    violet: '#9a63ff', violetDk: '#5224b8', glow: '#c9a8ff',
    pad: '#ebe7f6', padSh: '#c2b9da', padOff: '#6f4fd0', padOn: '#f1e6ff',
    phones: '#2e2b38', phonesSh: '#17151f', phonesHi: '#5d586f',
    iris: ['#2a1810', '#74492a'],
    // goat cosplay
    fur: '#efd9b3', furSh: '#d3b07e', furHi: '#fff1d6', inner: '#f6a8b4', innerSh: '#df8294',
    horn: '#f6d5a2', hornSh: '#dba56a', hornHi: '#fff0d2', hornDk: '#c58b52',
    gIris: ['#4a2a14', '#b9783a'],
  };
  const RC_SKULL = RJ.skullPts({ w: 0.98, chin: 7 });
  const GT_SKULL = RJ.skullPts({ w: 0.97, chin: 12 });
  // the hair, in head space: one smooth wave swept up from the back of the head and leaning to the viewer's right, rising to a soft quiff at the front with only
  // three shallow points (the notches between them are short), a hairline that rises over the forehead with two small strands that fall onto it, and a soft fade at
  // both temples (see rcFadeUnder). Points [x, y, 1] are the soft tips.
  const RC_TOP = [[50, -33], [55, -43], [57, -55], [58, -67], [59, -79], [66, -91, 1], [56, -100], [44, -105], [31, -104], [20, -100, 1], [10, -95], [0, -95], [-10, -93, 1], [-20, -90], [-31, -85], [-42, -79],
    [-52, -72], [-58, -62], [-62, -52], [-65, -42], [-66, -32], [-66, -24]];
  // the lower edge: the top of the fade, then the hairline with two small strands that fall onto the forehead
  const RC_LINE = [[-60, -23], [-52, -31], [-42, -38], [-28, -42], [-14, -45], [0, -47], [5, -47], [8, -40, 1], [12, -47], [24, -46], [28, -46], [31, -39, 1], [34, -45], [40, -42]];
  const RC_HAIR = RC_TOP.concat(RC_LINE);
  // the combed flow of the wave: long curves that sweep up from the nape toward the front lock, and the glossy bands along the crest
  const RC_FLOW = [[[-52, -62], [-36, -76], [-14, -87], [10, -93], [34, -98], [56, -97]], [[-44, -54], [-26, -68], [-4, -79], [20, -86], [42, -88], [60, -84]],
    [[-34, -48], [-14, -60], [8, -70], [30, -77], [52, -76]], [[-20, -48], [0, -56], [22, -63], [46, -64]],
    [[20, -100], [25, -90], [28, -80]], [[-10, -93], [-5, -84], [-2, -74]], [[66, -91], [62, -82], [59, -72]]];
  const RC_HI = [[[-24, -86], [-6, -93], [14, -99], [34, -103], [52, -99], [46, -96], [32, -99], [14, -96], [-4, -90], [-20, -82]], [[-46, -72], [-36, -78], [-24, -82], [-30, -76], [-42, -69]]];
  // the near temple (hair-toned short growth that melts into the skin) and the far temple
  const RC_FADE = [[-66, -26], [-56, -32], [-42, -39], [-36, -35], [-39, -21], [-42, -5], [-43, 11], [-45, 23], [-52, 29], [-61, 22], [-67, 2]];
  const RC_FADE_FAR = [[40, -42], [50, -37], [58, -28], [62, -12], [62, 8], [55, 4], [52, -12], [46, -28]];
  const RC_JAW = [[-45, 30], [-34, 44], [-14, 55], [6, 59], [26, 57], [46, 45], [57, 28], [62, 52], [30, 74], [-10, 74], [-42, 64]];

  function rcHair(g, S) {
    RJ.cel(g, RC_HAIR, R.hair, { shadow: R.hairSh, line: LINE.main + 0.1, depth: 6, tension: 0.7, weightVar: 0.4, decor: (gg) => {
      RC_HI.forEach((f) => RJ.fillPts(gg, f, R.hairHi, 0.7));
      RC_FLOW.forEach((l, i) => RJ.ink(gg, l, { w: 1.4, color: R.hairSh, taper: 0.55, wobble: 0.02, alpha: 0.95, seed: i }));
      strokes(gg, [[-30, -70, -22, -75], [-6, -80, 4, -84], [20, -86, 30, -88], [38, -84, 46, -84], [-16, -60, -8, -65], [10, -72, 18, -76], [34, -74, 42, -75]], { color: R.hairHi, w: 1.25, alpha: 0.85 });
    } });
    // a few loose strands at the quiff: the tousled look
    [[[60, -97], [67, -103], [64, -110]], [[28, -104], [29, -111], [33, -115]], [[-8, -94], [-12, -100], [-10, -105]]].forEach((w, i) => RJ.ink(g, w, { w: 1.6, color: C.ink, taper: 0.7, wobble: 0.02, seed: i }));
  }
  // the soft fade at both temples (gradients that melt into the skin, no hard edge) and the stubble hint along the jaw
  function rcFadeUnder(g) {
    const soft = (poly, x0, x1, a) => {
      const gr = g.createLinearGradient(x0, 0, x1, 0);
      gr.addColorStop(0, 'rgba(58,44,40,' + a + ')'); gr.addColorStop(0.5, 'rgba(92,71,63,' + (a * 0.5).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(110,87,80,0)');
      g.beginPath(); tk.trace(g, poly); g.fillStyle = gr; g.fill();
    };
    soft(RC_FADE, -67, -37, 0.95);
    soft(RC_FADE_FAR, 63, 44, 0.6);
    strokes(g, [[-50, -22, -47, -19], [-46, -10, -43, -7], [-47, 3, -44, 6], [-49, 14, -46, 17], [-56, -12, -53, -9], [-54, 2, -51, 5], [-40, -26, -38, -22], [56, -22, 55, -18], [58, -8, 57, -4], [55, 2, 54, 5]], { color: R.fadeDk, w: 1, alpha: 0.55 });
    // the stubble hint: a flat soft tone hugging the jaw, and a few short ticks
    g.save(); g.globalAlpha = 0.34; g.fillStyle = R.stub; g.beginPath(); tk.trace(g, RC_JAW, 0, 0, 0.5); g.fill(); g.restore();
    strokes(g, [[-24, 47, -22, 50], [-12, 53, -10, 56], [0, 57, 2, 60], [14, 57, 16, 60], [26, 53, 28, 56], [38, 46, 40, 49], [-6, 39, -4, 41], [24, 39, 26, 41], [-32, 42, -30, 45], [46, 40, 48, 43]], { color: R.stub, w: 1, alpha: 0.6 });
  }
  // a small strong nose: a short hook for the tip and the nostril under it (no long cheek crease, it read as a worry line)
  function rcNose(g, S) {
    RJ.ink(g, [[22.4, 28.2], [22.6, 31.6], [25.6, 33.4]], { w: 1.3, color: C.inkSoft, taper: 0.5, wobble: 0, alpha: 0.7 });
    RJ.ink(g, [[22.6, 36], [25.2, 37], [27.6, 35.8]], { w: 1.3, color: C.ink, taper: 0.5, wobble: 0, alpha: 0.55 });
  }
  function rcHead(g, S) {
    headBase(g, S, { skull: RC_SKULL, skin: R.skin, shade: R.skinSh, cast: RC_LINE.concat([[40, -50], [-60, -50]]), castDy: 5, under: rcFadeUnder });
    rcNose(g, S);
    rcHair(g, S);
    RJ.ear(g, -52, 25, { r: 14, side: -1, skin: R.skin, shade: R.skinSh });
  }
  // the short back of the head: a little hair at the nape that sways a little
  const RC_NAPE = [[-56, -4], [-68, 8], [-72, 24], [-66, 38], [-58, 40, 1], [-52, 28], [-52, 10]];
  function rcNape(g, S) {
    g.save(); g.translate(-56, 0); g.rotate(S.P.hairSwing * 0.04); g.translate(56, 0);
    RJ.cel(g, RC_NAPE, R.hair, { shadow: R.hairSh, line: LINE.main, depth: 4, tension: 0.7, hi: R.hairHi, hiW: 1.2, hiAlpha: 0.6 });
    g.restore();
  }

  // ---- the goat cosplay: floppy ears out to the sides, small horns, a longer muzzle-ish chin with a tiny beard ----
  const GT_EAR = [[-50, -12], [-62, -14], [-78, -8], [-94, 4], [-108, 18], [-117, 33, 1], [-105, 41], [-89, 39], [-73, 33], [-59, 27], [-50, 21]];
  const GT_EAR_IN = [[-58, -3], [-70, -4], [-84, 3], [-98, 14], [-107, 27, 1], [-97, 31], [-84, 29], [-70, 23], [-58, 17]];
  const GT_FOLD = [[-57, 7], [-80, 14], [-101, 25]];
  const farEar = (p) => [4 - p[0] * 0.92, 6 + (p[1] - 6) * 0.95].concat(p.slice(2));
  function gtEars(g, S) {
    const sw = S.P.hairSwing * 0.03;
    [-1, 1].forEach((sd) => {
      const f = sd < 0 ? (p) => p : farEar, ear = GT_EAR.map(f), inn = GT_EAR_IN.map(f), fold = GT_FOLD.map(f);
      g.save(); g.translate(sd < 0 ? -52 : 54, 6); g.rotate(sw * sd); g.translate(sd < 0 ? 52 : -54, -6);
      RJ.cel(g, ear, R.fur, { shadow: R.furSh, line: LINE.main, depth: 5, tension: 0.8, hi: R.furHi, hiW: 1.5, hiAlpha: 0.7 });
      RJ.cel(g, inn, R.inner, { shadow: R.innerSh, line: LINE.fine + 0.2, depth: 3, tension: 0.8, hi: false });
      RJ.ink(g, fold, { w: LINE.fine, color: R.innerSh, taper: 0.5, wobble: 0.02 });
      g.restore();
    });
  }
  // two small curved horns: a tapered ribbon that rises from the crown and bends outward and back (the far one is the near one mirrored about x = 14)
  const GT_HORN = [[-12, -62], [-14, -76], [-22, -88], [-35, -93]];
  function gtHorns(g, S) {
    [-1, 1].forEach((sd) => {
      const sp = sd < 0 ? GT_HORN : GT_HORN.map((p) => [28 - p[0], p[1]]);
      tk.ribbon(g, sp, R.horn, { wMax: 17, w0: 16, w1: 1.5, tipPow: 0.9, gloss: true, glossColor: R.hornHi, glossAlpha: 0.75, strands: 0, shadow: R.hornSh, shadowW: 0.5, line: LINE.main, lineColor: C.ink, decor: (gg) => {
        [0.34, 0.56].forEach((u) => {
          const i = Math.min(sp.length - 2, Math.floor(u * (sp.length - 1))), k = u * (sp.length - 1) - i, x = lerp(sp[i][0], sp[i + 1][0], k), y = lerp(sp[i][1], sp[i + 1][1], k);
          RJ.ink(gg, [[x - 9, y + 0.5], [x, y - 2.2], [x + 9, y + 0.5]], { w: 1.15, color: R.hornDk, taper: 0.3, wobble: 0, alpha: 0.9 });
        });
      } });
    });
  }
  // the tiny goat beard: a short cream tuft (the colour of the horns, so it separates from the navy hoodie) that curls out at its tip and wiggles a little with the sway
  const GT_BEARD = [[-1, 66], [11, 66], [15, 70], [15, 76], [19, 81], [24, 80, 1], [20, 86], [13, 84], [10, 88, 1], [5, 83], [-1, 80, 1], [-3, 73]];
  function gtBeard(g, S) {
    g.save(); g.translate(6, 66); g.rotate(S.P.hairSwing * 0.05); g.translate(-6, -66);
    RJ.cel(g, GT_BEARD, R.fur, { shadow: R.furSh, line: LINE.main, depth: 3.4, tension: 0.6, hi: R.furHi, hiW: 1.3, hiAlpha: 0.85, decor: (gg) => {
      strokes(gg, [[[2, 69], [3, 75], [6, 81]], [[9, 69], [11, 75], [14, 81]]], { color: R.hornDk, w: 1.1, alpha: 0.7 });
    } });
    g.restore();
  }
  // a lighter, rounder muzzle patch around the mouth, drawn under the face features
  function gtMuzzleUnder(g) {
    rcFadeUnder(g);
    g.save(); g.globalAlpha = 0.6; g.beginPath(); tk.trace(g, tk.ellipsePts(12, 46, 21, 18, 14)); g.fillStyle = R.skinHi; g.fill(); g.restore();
    [[18.5, 37.5], [25.5, 36.5]].forEach((n) => { g.beginPath(); g.ellipse(n[0], n[1], 1.5, 1.1, -0.3, 0, TAU); g.fillStyle = R.skinDeep; g.globalAlpha = 0.8; g.fill(); g.globalAlpha = 1; });
  }
  function gtHead(g, S) {
    gtEars(g, S);
    headBase(g, S, { skull: GT_SKULL, skin: R.skin, shade: R.skinSh, cast: RC_LINE.concat([[40, -50], [-60, -50]]), castDy: 5, under: gtMuzzleUnder });
    gtHorns(g, S);
    rcHair(g, S);
    gtBeard(g, S);
  }

  function rcFaceSpec(goat) {
    if (goat) {
      return {
        eyes: [{ x: -13, y: 17, w: 34, h: 31 }, { x: 40, y: 15, w: 29, h: 29 }],
        brows: [[-14, -7, 26], [44, -7, 22]],
        browStyle: { thick: 4.6, arch: 0.35, tilt: -0.12, color: R.hairSh },
        nose: [22, 34, 60],
        mouth: [11, 50, 25],
        mouthStyle: { lineW: 1.4, puff: true, inner: '#a53a52', tongue: '#ff8fa3' },
        blush: [[-8, 36, 17], [42, 34, 14]],
        sweat: [56, -14, 5],
        eye: { iris: R.gIris, ring: '#26140a', sclera: '#fffaf2', expr: 'neutral', irisW: 0.8, irisH: 1.0, lid: 2.0, wing: 0.35, lash: 1.0, crease: false, lashes: 0, tilt: -0.08, drop: 0, hl: [[-0.36, -0.46, 0.3], [-0.32, -0.08, 0.15]] },
      };
    }
    // gentle and symmetric: two matching big eyes (the far one only a touch narrower for the 3/4 turn), matching brows, a soft closed smile
    return {
      eyes: [{ x: -14, y: 15, w: 29, h: 26 }, { x: 39, y: 15, w: 27.5, h: 25 }],
      brows: [[-15, -7, 28], [44, -7, 27]],
      browStyle: { thick: 6.2, arch: 0.2, tilt: 0.02, color: R.hairSh },
      mouth: [10, 44, 20],
      mouthStyle: { lineW: 1.4, puff: true, inner: '#a53a52' },
      blush: [[-6, 32, 13], [41, 31, 12]],
      blushColor: '#f0907e',
      sweat: [56, -14, 5],
      eye: { iris: R.iris, ring: '#1a0e08', sclera: '#f7efe6', expr: 'neutral', irisW: 0.68, irisH: 0.98, lid: 2.0, wing: 0.4, lash: 1.05, crease: true, lashes: 0, tilt: 0.02, drop: 0.05, hl: [[-0.36, -0.46, 0.36], [-0.3, -0.06, 0.17]] },
    };
  }

  // the pad lights: 0..1 per pad, a pure function of the pose and t
  function rcPad(S, i) {
    const t = S.t, pose = S.P.pose, col = i % 4, row = (i / 4) | 0;
    if (pose === 'attack') return Math.pow(Math.abs(Math.sin(Math.PI * (t * 2.6 + col * 0.12 + row * 0.5))), 3);
    if (pose === 'sing') return (Math.floor(t * 4) % 8) === i ? 1 : (((Math.floor(t * 4) + 4) % 8) === i ? 0.45 : 0);
    if (pose === 'cheer') return Math.max(0, Math.sin(t * 7 - col * 1.0 - row * 0.5));
    if (pose === 'hurt') return Math.sin(t * 40 + i * 2.1) > 0.82 ? 0.7 : 0;
    return (Math.floor(t * 1.5) % 8) === i ? 0.5 + 0.5 * Math.sin(fr(t * 1.5) * Math.PI) : 0;
  }
  function rcCup(g, x, y, k, rot) {
    g.save(); g.translate(x, y); g.rotate(rot || 0); g.scale(k, k);
    RJ.cel(g, tk.ellipsePts(0, 0, 11, 14.5, 14), R.phones, { shadow: R.phonesSh, line: LINE.main, depth: 4, hi: R.phonesHi, hiW: 1.5 });
    g.lineWidth = 3.2; g.strokeStyle = R.violetDk; g.beginPath(); g.ellipse(0, 0.5, 6.6, 9.2, 0, 0, TAU); g.stroke();
    g.lineWidth = 1.7; g.strokeStyle = R.violet; g.beginPath(); g.ellipse(0, 0.5, 6.6, 9.2, 0, 0, TAU); g.stroke();
    RJ.ink(g, [[-5, -7], [-8, -2]], { w: 1.4, color: '#ffffff', taper: 0.5, wobble: 0, alpha: 0.6 });
    g.restore();
  }
  // the three-slash claw mark, a little glowing screen graphic
  function rcClaw(g, cx, cy, k, glow) {
    if (glow) tk.glow(g, cx, cy, 13 * k, R.violet, 0.5);
    for (let i = -1; i <= 1; i++) {
      const o = i * 4.4 * k, a = [[cx + o - 2.4 * k, cy - 5.6 * k + Math.abs(i) * 0.9 * k], [cx + o + 0.3 * k, cy + 0.3 * k], [cx + o + 2.4 * k, cy + 6 * k - Math.abs(i) * 0.9 * k]];
      RJ.ink(g, a, { w: 2.8 * k, color: R.violetDk, taper: 0.5, wobble: 0, weightVar: 0 });
      RJ.ink(g, a, { w: 1.5 * k, color: '#d6b8ff', taper: 0.5, wobble: 0, weightVar: 0 });
    }
  }
  const RC_JACKET = [[-15, -151], [15, -151], [31, -146], [37, -132], [38, -108], [41, -79, 1], [-41, -79, 1], [-38, -108], [-37, -132], [-31, -146]];
  const RC_PANEL = [[-13, -152], [13, -152], [19, -132], [20, -106], [22, -80, 1], [-22, -80, 1], [-20, -106], [-19, -132]];
  function rcTorso(g, S) {
    // the headphones' violet cord round the back of the neck, then the neck itself
    const band = [[-29, -136], [-26, -150], [-12, -158], [4, -159], [20, -156], [30, -148], [31, -137]];
    RJ.ink(g, band, { w: 6, color: R.phonesSh, taper: 0, wobble: 0 });
    RJ.ink(g, band, { w: 3.4, color: R.violet, taper: 0, wobble: 0 });
    RJ.neck(g, 2, -156, { w: 22, h: 22, skin: R.skin, shade: R.skinSh });
    // the light grey jacket: body, ribbed hem, a few folds
    RJ.cel(g, RC_JACKET, R.jacket, { shadow: R.jacketSh, line: LINE.main, depth: 8, hi: R.jacketHi, hiW: 1.6, hiAlpha: 0.8, tension: 0.5, decor: (gg) => {
      gg.beginPath(); gg.rect(-45, -88, 90, 10); gg.fillStyle = R.jacketSh; gg.fill();
      RJ.ink(gg, [[-45, -88], [45, -88]], { w: 1.3, color: R.zip, taper: 0, wobble: 0 });
      strokes(gg, [[-32, -130, -26, -114], [30, -132, 26, -116], [-30, -104, -27, -94]], { color: R.jacketHi, alpha: 0.85, w: 1.4 });
    } });
    // the navy hoodie in the open front, with the jacket's zip tapes down both edges
    RJ.cel(g, RC_PANEL, R.hood, { shadow: R.hoodSh, line: LINE.main, depth: 5, hi: R.hoodHi, hiW: 1.4, hiAlpha: 0.6, tension: 0.4, decor: (gg) => {
      gg.beginPath(); gg.rect(-26, -88, 52, 9); gg.fillStyle = R.hoodSh; gg.fill();
      RJ.ink(gg, [[-26, -88], [26, -88]], { w: 1.2, color: R.hoodDk, taper: 0, wobble: 0 });
    } });
    [[-1, [[-13, -150], [-19, -130], [-20, -106], [-22, -82]]], [1, [[13, -150], [19, -130], [20, -106], [22, -82]]]].forEach((z) => {
      RJ.ink(g, z[1], { w: 3.4, color: R.collar, taper: 0, wobble: 0, weightVar: 0 });
      for (let i = 0; i < 9; i++) { const y = -146 + i * 7.4, x = z[0] * (13 + (i / 8) * 8.5); RJ.ink(g, [[x, y], [x - z[0] * 2.4, y + 1.2]], { w: 1, color: R.zip, taper: 0, wobble: 0, weightVar: 0 }); }
    });
    // the dark collar standing round the neck on each side of the hood
    [[-1, [[-14, -153], [-24, -151], [-31, -146], [-29, -140], [-20, -143], [-12, -147]]], [1, [[16, -153], [26, -151], [33, -146], [31, -140], [22, -143], [14, -147]]]].forEach((c) => {
      RJ.cel(g, c[1], R.collar, { shadow: R.collarSh, line: LINE.mid, depth: 2.4, tension: 0.6, hi: false });
    });
    // the blue tee at the throat, then the hood lying round the neck like a soft roll
    RJ.cel(g, [[-14, -153, 1], [16, -153, 1], [10, -144], [2, -134, 1], [-8, -144]], R.tee, { shadow: R.teeSh, line: LINE.mid, depth: 3, tension: 0.3, hi: false });
    const roll = [[-29, -152], [-28, -141], [-21, -129], [-8, -122], [4, -121], [18, -126], [28, -136], [31, -150], [22, -149], [16, -138], [6, -132], [-6, -133], [-16, -139], [-21, -149]];
    RJ.cel(g, roll, R.hood, { shadow: R.hoodSh, line: LINE.main, depth: 4, hi: R.hoodHi, hiW: 1.5, hiAlpha: 0.7, tension: 0.75, decor: (gg) => {
      strokes(gg, [[[-26, -146], [-24, -136], [-17, -128]], [[26, -146], [24, -137], [16, -129]]], { color: R.hoodHi, w: 1.2, alpha: 0.7 });
    } });
    // the drawstrings with their little tips
    [[-7, -131, -9, -114], [9, -131, 11, -113]].forEach((l, i) => {
      const sp = [[l[0], l[1]], [(l[0] + l[2]) / 2 + (i ? 1.4 : -1.4), (l[1] + l[3]) / 2], [l[2], l[3]]];
      RJ.ink(g, sp, { w: 3.6, color: C.ink, taper: 0, wobble: 0, weightVar: 0 }); RJ.ink(g, sp, { w: 1.8, color: R.cord, taper: 0, wobble: 0, weightVar: 0 });
      RJ.ink(g, [[l[2], l[3] - 0.5], [l[2] + (i ? 0.4 : -0.4), l[3] + 4]], { w: 3.4, color: '#f4efe4', taper: 0, wobble: 0, weightVar: 0 });
    });
    // the headphone band: a thin violet-edged arc across the collar from cup to cup, in front of the hoodie and tucked behind the chin
    const hb = [[-20, -139], [-12, -132], [2, -128.5], [15, -131.5], [21, -139]];
    RJ.ink(g, hb, { w: 6.2, color: C.ink, taper: 0, wobble: 0, weightVar: 0 });
    RJ.ink(g, hb, { w: 4.4, color: R.violet, taper: 0, wobble: 0, weightVar: 0 });
    RJ.ink(g, hb, { w: 2.4, color: R.phones, taper: 0, wobble: 0, weightVar: 0 });
    // the sampler's strap (mostly hidden by the cups) and the sampler
    [[-14, -140, -19, -114], [16, -140, 22, -114]].forEach((l) => { const sp = [[l[0], l[1]], [(l[0] + l[2]) / 2, (l[1] + l[3]) / 2], [l[2], l[3]]]; RJ.ink(g, sp, { w: 4, color: R.phonesSh, taper: 0, wobble: 0 }); RJ.ink(g, sp, { w: 2, color: R.violet, taper: 0, wobble: 0 }); });
    rcSampler(g, S);
  }
  // headphones' cups and their violet cord: after the arms, so the sleeves never hide them
  function rcOver(g, S) {
    const cord = [[-24, -112], [-31, -106], [-32, -99], [-27, -95]];
    RJ.ink(g, cord, { w: 4, color: R.phonesSh, taper: 0, wobble: 0, weightVar: 0 });
    RJ.ink(g, cord, { w: 2.2, color: R.violet, taper: 0, wobble: 0, weightVar: 0 });
    RJ.cel(g, rbox(-28.5, -97.6, 5.4, 4.6, 1), R.phones, { shadow: false, line: LINE.fine, tension: 0 });
    rcCup(g, -22, -125, 0.85, 0.1);
    rcCup(g, 25, -126, 0.78, -0.1);
  }
  function rcSampler(g, S) {
    const x0 = -26, y0 = -112, w = 52, h = 31;
    RJ.cel(g, rbox(x0, y0, w, h, 4.5), R.pad, { shadow: R.padSh, line: LINE.main, depth: 3.5, tension: 0, hi: '#ffffff', hiW: 1.4, hiAlpha: 0.9 });
    // the little screen with the glowing claw mark, and two knobs on the top strip
    RJ.cel(g, rbox(x0 + 3.6, y0 + 2.6, 19, 7.4, 1.6), '#241a46', { shadow: false, line: LINE.fine, tension: 0 });
    rcClaw(g, x0 + 13, y0 + 6.3, 0.62, true);
    led(g, x0 + 31, y0 + 6.2, 2.3, R.violet, 0);
    led(g, x0 + 39, y0 + 6.2, 2.3, '#8f86a8', 0);
    // 4 x 2 pads, lit by the pose
    for (let i = 0; i < 8; i++) {
      const c = i % 4, r = (i / 4) | 0, px = x0 + 3.2 + c * 12, py = y0 + 12.4 + r * 8.8, v = rcPad(S, i);
      RJ.cel(g, rbox(px, py, 9.6, 7.2, 1.8), v > 0.05 ? R.padOn : R.padOff, { shadow: v > 0.05 ? '#c9a8ff' : '#5236a6', line: LINE.fine + 0.1, tension: 0, depth: 2, hi: false });
      if (v > 0.05) { g.save(); g.globalAlpha = clamp(v, 0, 1); g.fillStyle = '#ffffff'; g.beginPath(); g.rect(px + 1.4, py + 1, 6.8, 2.2); g.fill(); g.restore(); tk.glow(g, px + 4.8, py + 3.6, 12, R.violet, 0.75 * v); }
    }
  }
  // attack effect: sound arcs climbing off the pads, short rays that pulse on the beat, a violet bloom and a few pops
  function rcFx(g, S, name) {
    if (name === 'goatnotes') { const h = S.pt.head; RJ.fx.notes(g, h[0] + 56, h[1] - 16, S.t, RJ.accent('rawclaw').main, 3); return; }
    if (name !== 'padfx') return;
    const p = tPt(S, 1, -104), t = S.t, b = S.beat;
    tk.glow(g, p[0], p[1], 42 + 10 * b, R.violet, 0.4 + 0.3 * b, false);
    g.save(); g.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const u = fr(t * 1.3 + i / 3), r = 30 + u * 56, a = Math.sin(Math.PI * Math.min(1, u * 1.12)) * 0.95, sp = 0.7 - u * 0.15;
      [0, Math.PI].forEach((dir) => {
        g.globalAlpha = a; g.strokeStyle = C.ink; g.lineWidth = 6.4 - u * 2.2; g.beginPath(); g.arc(p[0], p[1] + 6, r, dir - sp, dir + sp); g.stroke();
        g.strokeStyle = i % 2 ? '#e9dcff' : R.glow; g.lineWidth = 3.8 - u * 1.4; g.beginPath(); g.arc(p[0], p[1] + 6, r, dir - sp, dir + sp); g.stroke();
      });
    }
    g.restore();
    for (let i = 0; i < 5; i++) {
      const an = -Math.PI / 2 + (i - 2) * 0.42, r0 = 16 + 4 * b, r1 = 26 + 12 * b;
      RJ.ink(g, [[p[0] + Math.cos(an) * r0, p[1] + Math.sin(an) * r0], [p[0] + Math.cos(an) * r1, p[1] + Math.sin(an) * r1]], { w: 4.4, color: C.ink, taper: 0.3, wobble: 0, weightVar: 0 });
      RJ.ink(g, [[p[0] + Math.cos(an) * (r0 + 1), p[1] + Math.sin(an) * (r0 + 1)], [p[0] + Math.cos(an) * (r1 - 1), p[1] + Math.sin(an) * (r1 - 1)]], { w: 2.4, color: '#e9dcff', taper: 0.3, wobble: 0, weightVar: 0 });
    }
    RJ.fx.sparkles(g, p[0], p[1], [[-46, -34, 6, 0.2], [48, -38, 7, 0.3], [-30, -62, 4.5, 0], [32, -66, 4, 0.1]], R.glow, t);
  }

  // The five poses plus the portrait pose. The goat shares them but keeps a happier face (it never frowns, it bleats).
  function rcPoses(goat) {
    const cool = goat ? { eyes: 'open', mouth: 'happyOpen', brow: -0.15 } : { eyes: 'open', mouth: 'smile', brow: 0 };
    const P = {
      idle: Object.assign({ mic: 'none', fHand: [3, 44], fBend: -1, fKind: 'fist', fRot: -0.2, bHand: [-1, 44], bBend: 1, bKind: 'fist', bRot: 0.2, bFront: 1, headRot: 0.04, fx: [] }, cool),
      // the goat keeps its big warm eyes wide open while it sings, and its notes float up past the ear tip instead of landing on the ear (see rcFx 'goatnotes')
      sing: { mic: 'mouth', micDx: 14, micDy: 7, micAng: 1.0, fBend: 1, bHand: [8, 36], bBend: 1, bKind: 'fist', bRot: 0.4, bFront: 1, eyes: goat ? 'open' : 'half', mouth: 'beat', brow: goat ? -0.1 : 0.1, headRot: -0.03, fx: [goat ? 'goatnotes' : 'notes'], look: [0.4, 0] },
      attack: { mic: 'none', fHand: [-6, 38], fBend: -1, fKind: 'fist', fRot: -0.4, bHand: [8, 38], bBend: 1, bKind: 'fist', bRot: 0.4, bFront: 1, lean: 0.08, torsoRot: 0.05, headRot: 0.08, headDx: 3,
        fFoot: [32, -12], bFoot: [-24, -12], eyes: goat ? 'open' : 'determined', mouth: goat ? 'grin' : 'beat', brow: goat ? 0.2 : 0.4, fx: ['padfx'], look: [0.5, 0.2] },
      hurt: { mic: 'none', fHand: [30, -4], fBend: -1, fKind: 'open', fSpread: 1.3, fRot: 0.2, bHand: [-34, -10], bBend: 1, bKind: 'open', bSpread: 1.3, lean: -0.13, torsoRot: -0.08, headRot: -0.14, headDx: -3,
        fFoot: [12, -12], bFoot: [-20, -12], eyes: 'hurt', mouth: 'ow', brow: -0.7, sweat: 1, blush: 0.6, fx: ['stars'] },
      cheer: { mic: 'none', fHand: [30, -40], fBend: 1, fKind: 'fist', fRot: -0.1, bHand: [-30, -40], bBend: -1, bKind: 'fist', bRot: 0.1, eyes: 'happy', mouth: goat ? 'happyOpen' : 'grin', brow: -0.2, headRot: 0.04,
        fFoot: [20, -12], bFoot: [-18, -12], fx: ['sparkles'] },
      // the portrait pose: both hands low so no stray fist shows at the edge of the head-and-shoulders crop
      bust: Object.assign({ mic: 'none', fHand: [12, 58], fBend: -1, fKind: 'fist', fRot: -0.2, bHand: [-12, 58], bBend: 1, bKind: 'fist', bRot: 0.2, bFront: 1, headRot: 0.03, fx: [] }, cool),
    };
    return P;
  }

  function makeRawclaw(goat) {
    return {
      id: goat ? 'rawclaw_goat' : 'rawclaw',
      accent: 'rawclaw',
      skel: { neck: [0, -150], headC: [2, -208], shF: [26, -135], shB: [-26, -135], hip: [0, -78] },
      base: {},
      poses: rcPoses(goat),
      face: rcFaceSpec(goat),
      exprs: { smirk: { eyes: 'open', mouth: 'smirk', brow: 0.15 } },
      arm: { l: [26, 24], w: [21, 18], skin: R.jacket, skinSh: R.jacketSh, cuff: { color: R.hood, light: R.hoodSh }, hand: { skin: R.skin, shade: R.skinSh } },
      legs: {
        w: [31, 24], color: R.pants, shade: R.pantsSh, pantsOver: true, bow: 2,
        shoe: { color: '#f4efff', sole: '#c3a9ff', shade: '#ddd2f4', toeCap: '#8b4dff', accent: '#8b4dff', hi: '#ffffff', k: 1.2 },
        decor(g, hip, an) {
          const dx = an[0] - hip[0], dy = an[1] - hip[1], d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, nx = -uy, ny = ux, qx = an[0] - ux * 7, qy = an[1] - uy * 7;
          RJ.ink(g, [[qx - nx * 9, qy - ny * 9], [qx + nx * 9, qy + ny * 9]], { w: 1.5, color: C.ink, taper: 0.2, wobble: 0 });
          const mx = (hip[0] + an[0]) / 2, my = (hip[1] + an[1]) / 2;
          RJ.ink(g, [[mx - nx * 4, my - ny * 4], [mx - nx * 10 + ux * 2, my - ny * 10 + uy * 2]], { w: 1.4, color: R.pantsSh, taper: 0.5, wobble: 0 });
          RJ.ink(g, [[qx - ux * 4 - nx * 8, qy - uy * 4 - ny * 8], [qx - ux * 4 + nx * 8, qy - uy * 4 + ny * 8]], { w: 2, color: R.violet, taper: 0.1, wobble: 0, alpha: 0.95 });
        },
      },
      mic: { accent: R.violet, headR: 10, len: 40, bands: 2 },
      bounds: goat ? { h: 337, x0: -150, x1: 143 } : { h: 336, x0: -131, x1: 137 },       // the silhouette over all five poses (the hurt lean, the attack reach, the goat's ears), not the effects
      bust: goat ? { rect: [-136, -324, 134, -96], face: [-110, -318, 112, -142], pose: 'bust' } : { rect: [-92, -324, 88, -92], face: [-76, -318, 78, -146], pose: 'bust' },
      layers: { backHair: rcNape, torso: rcTorso, head: goat ? gtHead : rcHead, over: rcOver, fx: rcFx },
      // the hands drum the pads: alternate hits in the attack, a lazy tap of the back hand while he beatboxes
      tweak(P, t) {
        if (P.pose === 'attack') {
          const f = Math.pow(Math.abs(Math.sin(Math.PI * t * 2.6)), 3), k = Math.pow(Math.abs(Math.sin(Math.PI * (t * 2.6 + 0.5))), 3);
          P.fHand = [P.fHand[0], P.fHand[1] - 11 * (1 - f)]; P.bHand = [P.bHand[0], P.bHand[1] - 11 * (1 - k)];
        } else if (P.pose === 'sing') {
          const k = Math.pow(Math.abs(Math.sin(Math.PI * t * 2)), 3);
          P.bHand = [P.bHand[0], P.bHand[1] - 7 * (1 - k)];
        }
      },
    };
  }
  RJ.register('rawclaw', crewRig(makeRawclaw(false)));
  RJ.register('rawclaw_goat', crewRig(makeRawclaw(true)));
  // ================================================================================================================================================
  // ANDY: the groovy bass player. Shaggy hair, orange headband, retro striped tee, bell-bottoms, sunburst bass on a strap, loop pedal with a green LED.
  // ================================================================================================================================================
  const A = {
    hair: '#7a4423', hairSh: '#4b2711', hairHi: '#bd7d48',
    band: '#ff8a1f', bandSh: '#d4640a', bandHi: '#ffc07a', bandDk: '#a84a05',
    tee: '#ff9a35', teeSh: '#e17714', teeHi: '#ffca8c', cream: '#fff0d4', creamSh: '#ecd2a4',
    pants: '#7a533a', pantsSh: '#523523', pantsHi: '#9c7253',
    bass: '#ffcb42', bassMid: '#ff8f1f', bassEdge: '#b93a0c', bassHi: '#fff0a8', pick: '#fff2d2', pickSh: '#e4d0a2',
    wood: '#ecc88e', woodSh: '#c99a58', board: '#3a2214', metal: '#dfe2ec', metalSh: '#9da1b4',
    strap: '#82512e', strapSh: '#57331c', stitch: '#f3d39e',
    iris: ['#3b220f', '#966030'],
    ped: '#2f2b38', pedSh: '#1b1822', led: '#59ff7e', glow: '#ffb45e', light: '#fff0d4',
  };
  const AN_SKULL = RJ.skullPts({ w: 1.03, chin: 2 });
  const AN_HAIR = [[-66, 12], [-74, -14], [-72, -40], [-60, -62], [-47, -76], [-37, -90, 1], [-27, -82], [-12, -89], [-4, -102, 1], [6, -89], [16, -91], [27, -100, 1], [35, -85], [47, -78], [58, -63], [66, -40], [67, -16], [63, 4, 1],
    [54, -4], [51, -22], [44, -34], [34, -40], [20, -44], [4, -46], [-12, -45], [-28, -40], [-40, -28], [-44, -8], [-45, 14], [-47, 34, 1], [-55, 26]];
  const AN_BACK = [[-56, -22], [-74, -4], [-82, 16], [-78, 38], [-69, 50, 1], [-60, 38], [-52, 26], [-52, 4]];
  const AN_BAND = [[-70, -14], [-62, -28], [-48, -39], [-28, -46], [-4, -48], [22, -46], [44, -40], [58, -30]];

  function anHair(g, S) {
    RJ.cel(g, AN_HAIR, A.hair, { shadow: false, line: LINE.main + 0.2, tension: 0.8, weightVar: 0.3, decor: (gg) => {
      RJ.fillPts(gg, [[-74, -6], [-66, 14], [-55, 26], [-47, 34], [-45, 14], [-43, -4], [-52, -30], [-70, -40]], A.hairSh, 0.5);
      RJ.fillPts(gg, [[-26, -80], [0, -85], [28, -81], [44, -72], [20, -66], [-6, -68], [-34, -66]], A.hairHi, 0.5);
      const flow = [[[6, -40], [22, -58], [44, -72], [62, -60]], [[4, -40], [-10, -58], [-32, -72], [-62, -58]], [[-40, -30], [-56, -20], [-66, 0]], [[20, -40], [38, -46], [54, -36]], [[-8, -42], [-24, -48], [-42, -42]]];
      flow.forEach((l, i) => RJ.ink(gg, l, { w: 1.4, color: A.hairSh, taper: 0.5, wobble: 0.02, alpha: 0.95, seed: i }));
      strokes(gg, [[-10, -76, -6, -68], [-4, -78, 0, -70], [4, -78, 8, -70], [20, -74, 24, -66], [32, -70, 36, -62], [-26, -72, -22, -64], [-60, -34, -56, -26], [-66, -12, -62, -4], [58, -44, 60, -36]], { color: A.hairHi, w: 1.3, alpha: 0.95 });
    } });
    
  }
  function anBand(g, S) {
    const sw = S.P.hairSwing;
    // the knot's two tails sway behind the head
    [[[-68, -14], [-82, -6], [-94, 8]], [[-68, -14], [-86, -18], [-100, -14]]].forEach((sp, i) => RJ.lock(g, sp, A.band, { wMax: 10, w0: 9, w1: 3, tipPow: 1.0, bend: sw * 0.35 * (i ? -1 : 1), gloss: false, strands: 0, shadow: A.bandSh, line: LINE.main }));
    tk.ribbon(g, AN_BAND, A.band, { wMax: 12, w0: 12, w1: 12, profile: () => 1, cap: 'flat', gloss: false, strands: 0, shadow: A.bandSh, shadowW: 0.4, line: LINE.main, lineColor: C.ink, wobble: 0.03 });
    [0.15, 0.33, 0.5, 0.67, 0.85].forEach((u) => { const i = Math.min(AN_BAND.length - 2, Math.floor(u * (AN_BAND.length - 1))), k = u * (AN_BAND.length - 1) - i, x = lerp(AN_BAND[i][0], AN_BAND[i + 1][0], k), y = lerp(AN_BAND[i][1], AN_BAND[i + 1][1], k); g.beginPath(); g.arc(x, y, 1.5, 0, TAU); g.fillStyle = A.cream; g.fill(); });
    RJ.cel(g, tk.ellipsePts(-67, -15, 6.5, 6, 10), A.band, { shadow: A.bandSh, line: LINE.mid, depth: 2, hi: A.bandHi, hiW: 1.2 });
  }
  function anBack(g, S) {
    g.save(); g.translate(-56, -10); g.rotate(S.P.hairSwing * 0.04); g.translate(56, 10);
    RJ.cel(g, AN_BACK, A.hair, { shadow: A.hairSh, line: LINE.main, depth: 5, tension: 0.8, hi: A.hairHi, hiW: 1.4, hiAlpha: 0.5 });
    g.restore();
  }
  function anHead(g, S) {
    headBase(g, S, { skull: AN_SKULL, cast: [[-58, -34], [-30, -48], [0, -50], [30, -48], [56, -34], [50, -16], [20, -38], [-10, -38], [-40, -16]], castDy: 6, under: (gg) => {
      // a flat beard shadow along the jaw, in the same hard-edged cel as the skin shade
      gg.beginPath(); tk.trace(gg, [[-47, 30], [-34, 44], [-14, 54], [4, 57], [24, 55], [44, 44], [56, 28], [60, 50], [30, 70], [-10, 70], [-40, 62]], 0, 0, 0.5); gg.fillStyle = '#dca383'; gg.globalAlpha = 0.75; gg.fill();
    } });
    anHair(g, S);
    anBand(g, S);
    RJ.cel(g, [[44, -46], [56, -48], [64, -36], [67, -16], [63, 4, 1], [54, -4], [51, -22], [47, -34]], A.hair, { shadow: false, line: LINE.main, tension: 0.6, depth: 2, decor: (gg) => { strokes(gg, [[[56, -42], [60, -26], [58, -10]], [[50, -40], [54, -24]]], { color: A.hairSh, w: 1.3, alpha: 0.9 }); } });
    RJ.ear(g, -53, 27, { r: 13.5, side: -1 });
  }

  function anFaceSpec() {
    return {
      eyes: [{ x: -13, y: 17, w: 30, h: 28 }, { x: 39, y: 14, w: 25, h: 26 }],
      brows: [[-14, -9, 28], [44, -9, 25]],
      browStyle: { thick: 5.4, arch: 0.45, tilt: -0.05, color: '#432511' },
      nose: [26, 32, 60],
      mouth: [8, 44, 25],
      mouthStyle: { lineW: 1.5, inner: '#b03a4a', tongue: '#f27c8e' },
      blush: [[-18, 36, 21], [38, 34, 18]],
      sweat: [57, -8, 5],
      eye: { iris: A.iris, ring: '#26140a', sclera: '#fffbf4', expr: 'neutral', irisW: 0.72, irisH: 0.96, lid: 2.0, wing: 0.5, lash: 1.0, crease: true, lashes: 0, tilt: -0.04, drop: 0, hl: [[-0.4, -0.5, 0.26], [-0.34, -0.14, 0.12]] },
    };
  }

  // ---- the bass in its own frame: origin at the body centre, +x along the neck, rotated so the neck rises to the right ----
  const AN_ANG = 0.4, AN_C = [-2, -94];
  const bassPt = (lx, ly) => [AN_C[0] + lx * Math.cos(AN_ANG) + ly * Math.sin(AN_ANG), AN_C[1] - lx * Math.sin(AN_ANG) + ly * Math.cos(AN_ANG)];
  const AN_BODY = [[48, -18, 1], [41, -27], [22, -36], [-5, -40], [-33, -36], [-50, -21], [-55, 3], [-50, 22], [-33, 35], [-7, 39], [15, 34], [28, 27], [35, 25, 1], [33, 10], [29, 0], [33, -8]];
  const AN_NECK = 118, AN_BRIDGE = -33;
  function anBass(g, S) {
    // the strap over the shoulder to the upper horn
    const sp = [[-17, -152], [-3, -140], [15, -128], [34, -118]];
    RJ.ink(g, sp, { w: 9, color: C.ink, taper: 0, wobble: 0, weightVar: 0 });
    RJ.ink(g, sp, { w: 6.4, color: A.strap, taper: 0, wobble: 0, weightVar: 0 });
    RJ.ink(g, sp.map((p) => [p[0] + 0.6, p[1] + 2.2]), { w: 1.3, color: A.stitch, taper: 0, wobble: 0, weightVar: 0, alpha: 0.9 });
    g.save(); g.translate(AN_C[0], AN_C[1]); g.rotate(-AN_ANG);
    // neck (maple with a dark fretboard) and the headstock
    const N = AN_NECK;
    RJ.cel(g, [[22, -5.2], [N, -4.4], [N, 4.4], [22, 5.2]], A.wood, { shadow: A.woodSh, line: LINE.main, tension: 0, depth: 2.4 });
    g.beginPath(); g.moveTo(24, -3.8); g.lineTo(N, -3); g.lineTo(N, 3); g.lineTo(24, 3.8); g.closePath(); g.fillStyle = A.board; g.fill();
    for (let x = 34, k = 0; x <= N - 6; x += 10.5 - k * 0.35, k++) RJ.ink(g, [[x, -3.6 + k * 0.05], [x, 3.6 - k * 0.05]], { w: 0.95, color: '#e9dcc0', taper: 0, wobble: 0, weightVar: 0 });
    [56, 78].forEach((x) => { g.beginPath(); g.arc(x, 0, 1.25, 0, TAU); g.fillStyle = A.cream; g.fill(); });
    RJ.cel(g, [[N - 2, -5], [N + 4, -8], [N + 17, -8.6], [N + 20, -1.5], [N + 17, 6.6], [N + 4, 6.6], [N - 2, 4.4]], A.wood, { shadow: A.woodSh, line: LINE.main, tension: 0.3, depth: 2.2, hi: '#f8e2b8', hiW: 1.1 });
    [[N + 6, 8], [N + 11, 8.3], [N + 16, 7.6]].forEach((p) => { RJ.cel(g, tk.circlePts(p[0], p[1] + 1.2, 2.3, 8), A.metal, { shadow: A.metalSh, line: LINE.fine + 0.2, depth: 1 }); });
    // the body, a sunburst: dark red edge, orange middle
    RJ.cel(g, AN_BODY, A.bass, { shadow: '#f0a01f', line: LINE.main + 0.2, tension: 0.6, depth: 6, hi: A.bassHi, hiW: 2.2, decor: (gg) => {
      gg.lineJoin = 'round';
      gg.beginPath(); tk.trace(gg, AN_BODY, 0, 0, 0.6); gg.lineWidth = 27; gg.strokeStyle = A.bassMid; gg.globalAlpha = 0.9; gg.stroke();
      gg.beginPath(); tk.trace(gg, AN_BODY, 0, 0, 0.6); gg.lineWidth = 12; gg.strokeStyle = A.bassEdge; gg.globalAlpha = 0.95; gg.stroke();
    } });
    // pickguard, two pickups, bridge, knobs
    RJ.cel(g, [[20, 3], [14, -11], [-4, -20], [-26, -17], [-37, 0], [-32, 17], [-12, 23], [10, 16]], A.pick, { shadow: A.pickSh, line: LINE.fine + 0.2, depth: 2.4, tension: 0.6 });
    [[-4, -12, 9, 24], [-21, -11, 8, 22]].forEach((r) => {
      RJ.cel(g, rbox(r[0], r[1], r[2], r[3], 2), '#26212c', { shadow: false, line: LINE.fine + 0.2, tension: 0 });
      for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(r[0] + r[2] / 2, r[1] + 4 + i * (r[3] - 8) / 3, 1.2, 0, TAU); g.fillStyle = '#c8c5d2'; g.fill(); }
    });
    RJ.cel(g, rbox(AN_BRIDGE - 3, -11, 7, 22, 1.5), A.metal, { shadow: A.metalSh, line: LINE.fine + 0.2, tension: 0, depth: 1.5 });
    [[-19, 28], [-31, 25]].forEach((p) => RJ.cel(g, tk.circlePts(p[0], p[1], 3.6, 8), '#2a2430', { shadow: false, line: LINE.fine + 0.2, rim: '#8b86a0', rimW: 1, rimSide: 'light' }));
    RJ.cel(g, tk.circlePts(43, -17, 2.4, 8), A.metal, { shadow: A.metalSh, line: LINE.fine, depth: 1 });
    // four strings from the bridge to the nut
    for (let i = 0; i < 4; i++) RJ.ink(g, [[AN_BRIDGE, -4.8 + i * 3.2], [N, -2.5 + i * 1.7]], { w: 1.0, color: '#f3eee0', taper: 0, wobble: 0, weightVar: 0, alpha: 0.95 });
    g.restore();
  }
  function anTorso(g, S) {
    RJ.neck(g, 2, -156, { w: 22, h: 22 });
    RJ.cel(g, [[-14, -151], [14, -151], [32, -146], [37, -131], [37, -106], [40, -78, 1], [-40, -78, 1], [-37, -106], [-37, -131], [-32, -146]], A.tee, { shadow: A.teeSh, line: LINE.main, depth: 8, hi: A.teeHi, hiW: 1.6, hiAlpha: 0.7, tension: 0.5, decor: (gg) => {
      gg.beginPath(); gg.rect(-45, -128, 90, 8); gg.fillStyle = A.cream; gg.fill();
      gg.beginPath(); gg.rect(-45, -113, 90, 3); gg.fillStyle = A.cream; gg.fill();
      RJ.ink(gg, [[-45, -128], [45, -128]], { w: 1.1, color: A.creamSh, taper: 0, wobble: 0, alpha: 0.9 });
    } });
    RJ.cel(g, [[-15, -152], [-9, -143], [0, -141], [9, -143], [15, -152], [11, -151], [7, -147], [0, -145], [-7, -147], [-11, -151]], A.cream, { shadow: A.creamSh, line: LINE.mid, depth: 2 });
    anBass(g, S);
  }

  // loop pedal on the ground with a flashing green LED, and the cable from the bass to it (figure space, drawn last)
  function anPedal(g, S) {
    const x = -70, y = 0, t = S.t, on = S.P.pose === 'sing' || S.P.pose === 'attack' ? Math.abs(Math.sin(Math.PI * t * 2)) : 0.7 + 0.3 * Math.sin(t * 2.4);
    const jp = bassPt(-19, 36), j = tPt(S, jp[0], jp[1]);
    const cable = [[j[0], j[1]], [j[0] - 10, j[1] + 26], [x + 12, y - 28], [x + 10, y - 17]];
    RJ.ink(g, cable, { w: 3.6, color: C.ink, taper: 0, wobble: 0, weightVar: 0 });
    RJ.ink(g, cable, { w: 1.9, color: '#4a4558', taper: 0, wobble: 0, weightVar: 0 });
    g.save(); g.fillStyle = 'rgba(20,6,40,0.28)'; g.beginPath(); g.ellipse(x + 2, y + 2, 25, 6, 0, 0, TAU); g.fill(); g.restore();
    RJ.cel(g, [[x - 17, y - 15], [x + 17, y - 15], [x + 19, y - 1, 1], [x - 19, y - 1, 1]], A.ped, { shadow: A.pedSh, line: LINE.main, tension: 0, depth: 3 });
    RJ.cel(g, [[x - 14, y - 28], [x + 16, y - 28], [x + 19, y - 15, 1], [x - 17, y - 15, 1]], A.band, { shadow: A.bandSh, line: LINE.main, tension: 0, depth: 3, hi: A.bandHi, hiW: 1.4 });
    RJ.cel(g, tk.ellipsePts(x + 1, y - 21, 8, 3.8, 12), A.metal, { shadow: A.metalSh, line: LINE.fine + 0.2, depth: 1.5, hi: false });
    [[-9, -25.5], [10, -25.5]].forEach((p) => { g.beginPath(); g.arc(x + p[0], y + p[1], 1.9, 0, TAU); g.fillStyle = '#2a2430'; g.fill(); });
    led(g, x - 11, y - 22.5, 2.4, A.led, 12, 0.35 + 0.55 * on);
    strokes(g, [[x - 11, y - 9, x + 11, y - 9]], { color: A.cream, w: 2, taper: 0.1 });
  }
  function anFx(g, S, name) {
    const t = S.t;
    if (name === 'prop') { anPedal(g, S); return; }
    if (name === 'bassnotes') { const hp = bassPt(AN_NECK + 12, -22), p = tPt(S, hp[0], hp[1]); RJ.fx.notes(g, p[0] - 22, p[1] - 6, t, A.band, 3); return; }
    if (name === 'bassfx') {
      // the slap: fat sound rings spreading from the body, a chunky note popping out, a small burst on the strings at the hit
      const cp = bassPt(-4, 0), c = tPt(S, cp[0], cp[1]), a = fr(t * 2.6), b = S.beat;
      tk.glow(g, c[0], c[1], 40 + 12 * b, A.glow, 0.22 + 0.2 * b, false);
      g.save(); g.lineCap = 'round';
      for (let k = 0; k < 3; k++) {
        const age = a + k, r = 16 + age * 34, al = Math.max(0, 1 - age / 2.8);
        g.globalAlpha = al;
        g.strokeStyle = C.ink; g.lineWidth = 8.4 - age * 1.4; g.beginPath(); g.ellipse(c[0], c[1], r, r * 0.86, -AN_ANG, 0, TAU); g.stroke();
        g.strokeStyle = k % 2 ? '#ffd9a8' : A.band; g.lineWidth = 5.6 - age * 1.0; g.beginPath(); g.ellipse(c[0], c[1], r, r * 0.86, -AN_ANG, 0, TAU); g.stroke();
        g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 1.2; g.beginPath(); g.ellipse(c[0], c[1], r - 1.2, r * 0.86 - 1.2, -AN_ANG, 3.7, 4.7); g.stroke();
      }
      g.restore();
      // one chunky note per slap, floating off the headstock side so it never crosses the face
      const nk = fr(t * 2.6 / 2), hp = bassPt(AN_NECK + 6, -16), hq = tPt(S, hp[0], hp[1]), nx = hq[0] + 8 + nk * 16, ny = hq[1] - 10 - nk * 40;
      tk.note(g, nx, ny, 21 + 6 * nk, { kind: 'eighth', color: C.ink, alpha: 1 - nk, line: 5.2 });
      tk.note(g, nx, ny, 17 + 5 * nk, { kind: 'eighth', color: A.band, alpha: 1 - nk });
      if (b > 0.35) RJ.fx.burst(g, c[0] + 12, c[1] - 26, 8 + 8 * b, A.band, A.light, t);
    }
  }

  function anPoses() {
    const easy = { eyes: 'open', mouth: 'happyOpen', brow: -0.15 };
    return {
      idle: Object.assign({ mic: 'none', fHand: [33, 22], fBend: 1, fKind: 'fist', fRot: -0.25, bHand: [20, 42], bBend: 1, bKind: 'relaxed', bRot: 0.3, bFront: 1, headRot: 0.03, fx: ['prop'] }, easy),
      sing: { mic: 'none', fHand: [35, 19], fBend: 1, fKind: 'fist', fRot: -0.25, bHand: [20, 42], bBend: 1, bKind: 'relaxed', bRot: 0.3, bFront: 1, eyes: 'happy', mouth: 'grin', brow: -0.2, headRot: -0.05, bFoot: [-40, -12], fx: ['prop', 'bassnotes'] },
      attack: { mic: 'none', fHand: [35, 19], fBend: 1, fKind: 'fist', fRot: -0.25, bHand: [20, 42], bBend: 1, bKind: 'fist', bRot: 0.5, bFront: 1, lean: 0.05, torsoRot: 0.03, headRot: 0.06, headDx: 2,
        fFoot: [30, -12], bFoot: [-26, -12], eyes: 'open', mouth: 'grin', brow: 0.45, fx: ['prop', 'bassfx'] },
      hurt: { mic: 'none', fHand: [30, 0], fBend: -1, fKind: 'open', fSpread: 1.3, fRot: 0.2, bHand: [-34, -12], bBend: 1, bKind: 'open', bSpread: 1.3, lean: -0.13, torsoRot: -0.08, headRot: -0.14, headDx: -3,
        fFoot: [12, -12], bFoot: [-20, -12], eyes: 'hurt', mouth: 'ow', brow: -0.7, sweat: 1, blush: 0.6, fx: ['prop', 'stars'] },
      cheer: { mic: 'none', fHand: [30, -42], fBend: 1, fKind: 'fist', fRot: -0.1, bHand: [-36, -36], bBend: -1, bKind: 'open', bSpread: 1.4, bRot: 0.3, eyes: 'happy', mouth: 'happyOpen', brow: -0.2, headRot: 0.05,
        fFoot: [20, -12], bFoot: [-18, -12], fx: ['prop', 'sparkles'] },
      // the portrait pose: both hands low and close to the bass body, so no stray hand sits at the edge of the head-and-shoulders crop
      bust: Object.assign({ mic: 'none', fHand: [22, 50], fBend: 1, fKind: 'fist', fRot: -0.25, bHand: [8, 54], bBend: 1, bKind: 'fist', bRot: 0.35, bFront: 1, headRot: 0.03, fx: [] }, easy),
    };
  }

  const anSpec = {
    id: 'andy',
    accent: 'andy',
    skel: {},
    base: {},
    poses: anPoses(),
    life: { idle: { bob: 1.8, per: 1.7, sway: 0.03, head: 0.04 }, sing: { bob: 2.0, per: 1.1, sway: 0.04, head: 0.06, beat: 0.5, beatHz: 2 } },
    face: anFaceSpec(),
    exprs: { smirk: { eyes: 'open', mouth: 'smirkTeeth', brow: 0.3 } },
    arm: { l: [26, 24], w: [19, 15], skin: C.skin, skinSh: C.skinSh, sleeve: { color: A.tee, shade: A.teeSh, len: 0.8, w0: 24, w1: 28, hi: false }, cuff: { color: A.cream, light: A.creamSh }, hand: { skin: C.skin, shade: C.skinSh } },
    legs: {
      w: [34, 34], color: A.pants, shade: A.pantsSh, pantsOver: true, bow: 2, profile: (u) => 0.78 + 0.36 * u * u,
      shoe: { color: A.cream, sole: '#ffd9a0', shade: A.creamSh, toeCap: A.band, accent: A.band, hi: '#ffffff', k: 1.2 },
      decor(g, hip, an) {
        const dx = an[0] - hip[0], dy = an[1] - hip[1], d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, nx = -uy, ny = ux;
        RJ.ink(g, [[hip[0] + ux * 10 + nx * 2, hip[1] + uy * 10 + ny * 2], [an[0] - ux * 6 + nx * 2, an[1] - uy * 6 + ny * 2]], { w: 1.3, color: A.pantsHi, taper: 0.4, wobble: 0, alpha: 0.9 });
        const qx = an[0] - ux * 5, qy = an[1] - uy * 5;
        RJ.ink(g, [[qx - nx * 16, qy - ny * 16], [qx + nx * 16, qy + ny * 16]], { w: 1.5, color: C.ink, taper: 0.2, wobble: 0 });
      },
    },
    mic: { accent: A.band },
    bounds: { w: 260, h: 316 },
    bust: { rect: [-95.5, -312, 84.5, -72], face: [-80, -308, 76, -138], pose: 'bust' },
    layers: { backHair: anBack, torso: anTorso, head: anHead, fx: anFx },
    // the slap: the plucking hand lifts between hits and comes down on the beat; in the groove it bobs a little and the back foot taps the pedal
    tweak(P, t) {
      if (P.pose === 'attack') {
        const b = P.beat;
        P.bHand = [P.bHand[0] - 4 * (1 - b), P.bHand[1] - 21 * (1 - b)];
        P.bKind = b > 0.45 ? 'fist' : 'relaxed';
      } else if (P.pose === 'sing') {
        const k = Math.pow(Math.abs(Math.sin(Math.PI * t * 2)), 2);
        P.bHand = [P.bHand[0], P.bHand[1] - 4 * (1 - k)];
        P.bFoot = [P.bFoot[0], P.bFoot[1] - 8 * Math.pow(Math.max(0, Math.sin(Math.PI * t * 2)), 2)];
      }
    },
  };
  RJ.register('andy', crewRig(anSpec));
  // ================================================================================================================================================
  // 'jordan': the virtual assistant who draws the graphics and runs the merch shop. Black wavy shoulder-length hair parted in the middle, round thin dark glasses,
  // a slim build in a black tee with a small round pale blue badge and black pants, black bracelets on one wrist and a blue-faced watch on the other, a small
  // pendant on a cord. The teal accent lives in the merch tote with its strap and in the tablet's case. Calm, creative, friendly.
  // ================================================================================================================================================
  const J = {
    hair: '#3a3144', hairSh: '#1e1727', hairHi: '#7d6f93', hairHi2: '#a396b8',
    skin: '#f1c59c', skinSh: '#dea577',
    tee: '#322f3d', teeSh: '#1d1b26', teeHi: '#5a5470', rib: '#4a4658',
    pants: '#2c2a37', pantsSh: '#1a1822', pantsHi: '#4c4860',
    badge: '#c9f1ec', badgeSh: '#94d6d0', badgeHi: '#f1fffd',
    teal: '#1fc4bd', tealSh: '#0f8e92', tealDk: '#0b6568', tealHi: '#7be8de',
    frame: '#2b2630', frameHi: '#7b7592',
    watch: '#2b2935', watchRim: '#6c6682', face: '#2f7be8', faceHi: '#9ccbff', strap: '#26232f',
    metal: '#d9dce6', metalSh: '#9da1b4',
    screen: '#e9fffb', screenDk: '#9fe6df', bezelHi: '#5fe0d8',
    tee2: '#ff9fbc', tee2Sh: '#e57a9c', logoG: '#76c02f', gold: '#ffd36b',
    iris: ['#2a170e', '#6a4128'],
  };
  const JD_SKULL = RJ.skullPts({ w: 0.98, chin: 3 });
  // the hair frames the face like curtains: a part at x = 14, the hairlines arch down from it to the temples, the sides fall past the jaw into wavy ends that rest on
  // the shoulders. Sharp points [x, y, 1] are the tips of the waves.
  const JD_FRONT = [[12, -71], [28, -70], [44, -64], [55, -52], [62, -34], [65, -14], [64, 4], [68, 20], [65, 36], [70, 52], [76, 63], [80, 66, 1], [71, 72, 1], [66, 70], [63, 79, 1],
    [56, 62], [55, 40], [57, 18], [56, -4], [53, -20], [46, -30], [36, -38], [26, -43], [18, -46], [14, -46, 1],
    [6, -45], [-5, -42], [-16, -36], [-27, -27], [-35, -16], [-39, -2], [-40, 14], [-41, 30], [-44, 46], [-47, 60], [-49, 72, 1], [-55, 64, 1], [-60, 79, 1], [-66, 68, 1],
    [-67, 56], [-76, 40], [-68, 21], [-77, 2], [-71, -16], [-66, -34], [-54, -52], [-36, -64], [-14, -70]];
  // the curtain strands: arcs from the part round the skull on both sides, and the lines that separate the long fronts from the rest
  const JD_FLOW = [[[14, -69], [-8, -62], [-30, -46], [-48, -20], [-57, 8]], [[14, -69], [34, -62], [50, -44], [58, -18], [62, 12]],
    [[8, -56], [-12, -50], [-30, -34], [-42, -8]], [[22, -58], [38, -52], [50, -36], [56, -12]],
    [[-34, -22], [-38, 0], [-40, 24], [-45, 50]], [[-52, 16], [-58, 34], [-56, 50], [-62, 68]], [[58, 14], [64, 30], [62, 46], [68, 62]], [[-30, 24], [-34, 44], [-40, 62]], [[-46, 40], [-50, 56], [-48, 70]], [[60, 42], [62, 56], [66, 70]]];
  const JD_HI = [[[-4, -68], [14, -71], [34, -68], [48, -60], [46, -63], [32, -66], [14, -67], [-2, -64]], [[-56, -26], [-64, -6], [-68, 14], [-65, 14], [-60, -6], [-53, -24]],
    [[62, -22], [67, -2], [66, 12], [63, 10], [63, -4], [59, -20]]];
  // the mass behind the head and shoulders: the back of the long hair with its own wavy ends
  const JD_BACK = [[-24, -67], [-48, -58], [-64, -36], [-72, -8], [-70, 22], [-68, 44], [-72, 64], [-71, 80, 1], [-60, 72], [-50, 85, 1], [-38, 74], [-20, 82], [0, 86, 1], [18, 78], [34, 84, 1], [48, 74],
    [60, 83, 1], [67, 64], [69, 40], [68, 12], [66, -16], [58, -42], [44, -60], [26, -69], [0, -72]];
  const JD_CAST = [[-35, -16], [-27, -27], [-16, -36], [-5, -42], [6, -45], [14, -46], [18, -46], [26, -43], [36, -38], [46, -30], [53, -20], [53, -14], [46, -24], [36, -32], [26, -37], [18, -40], [14, -40], [6, -39], [-5, -36], [-16, -30], [-27, -21], [-35, -10]];

  function jdBack(g, S) {
    g.save(); g.translate(0, -50); g.rotate(S.P.hairSwing * 0.025); g.translate(0, 50);
    RJ.cel(g, JD_BACK, J.hair, { shadow: J.hairSh, line: LINE.main, depth: 6, tension: 0.8, hi: J.hairHi, hiW: 1.5, hiAlpha: 0.5, decor: (gg) => {
      [[[-60, 10], [-66, 34], [-64, 56]], [[-40, 50], [-42, 66]], [[44, 40], [48, 60]], [[62, 12], [68, 40], [66, 58]]].forEach((l, i) => RJ.ink(gg, l, { w: 1.3, color: J.hairSh, taper: 0.5, wobble: 0.02, alpha: 0.9, seed: i }));
    } });
    g.restore();
  }
  function jdHair(g, S) {
    RJ.cel(g, JD_FRONT, J.hair, { shadow: J.hairSh, line: LINE.main + 0.2, depth: 7, tension: 0.8, weightVar: 0.32, decor: (gg) => {
      JD_HI.forEach((f) => RJ.fillPts(gg, f, J.hairHi, 0.6));
      RJ.ink(gg, [[18, -65.5], [30, -64.5], [43, -59.5], [53, -49], [59, -34], [62, -16], [62, 2]], { w: 1.5, color: J.teal, taper: 0.55, wobble: 0, alpha: 0.6 });      // the teal rim light on the lit edge
      JD_FLOW.forEach((l, i) => RJ.ink(gg, l, { w: 1.4, color: J.hairSh, taper: 0.5, wobble: 0.02, alpha: 0.95, seed: i }));
      strokes(gg, [[0, -66, -4, -59], [8, -68, 5, -60], [24, -66, 28, -58], [36, -62, 41, -54], [-18, -62, -22, -54], [-36, -50, -39, -42], [52, -44, 55, -36], [-62, -16, -64, -8], [64, -8, 66, 0]], { color: J.hairHi2, w: 1.25, alpha: 0.85 });
    } });
    // the part itself: a fine light line from the crown to the hairline
    RJ.ink(g, [[14, -70], [14, -58], [14, -47]], { w: 1.4, color: J.hairHi, taper: 0.5, wobble: 0, alpha: 0.85 });
  }
  function jdGlasses(g, S) {
    const lens = [[-10, 19, 18.5, 18], [38, 17, 16.4, 17.6]];
    // the near temple arm runs back to where the ear is hidden in the hair
    const arm = [[-29, 13], [-40, 13], [-52, 17]];
    RJ.ink(g, arm, { w: 3, color: C.ink, taper: 0, wobble: 0, weightVar: 0 });
    RJ.ink(g, arm, { w: 1.3, color: J.frame, taper: 0, wobble: 0, weightVar: 0 });
    lens.forEach((l) => {
      g.beginPath(); g.ellipse(l[0], l[1], l[2], l[3], 0, 0, TAU); g.fillStyle = 'rgba(200,225,245,0.14)'; g.fill();
      g.lineWidth = 2.5; g.strokeStyle = C.ink; g.beginPath(); g.ellipse(l[0], l[1], l[2], l[3], 0, 0, TAU); g.stroke();
      g.lineWidth = 1.15; g.strokeStyle = J.frame; g.beginPath(); g.ellipse(l[0], l[1], l[2], l[3], 0, 0, TAU); g.stroke();
      g.lineWidth = 0.9; g.strokeStyle = J.frameHi; g.beginPath(); g.ellipse(l[0], l[1], l[2], l[3], 0, 3.7, 4.6); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 2; g.lineCap = 'round';
      g.beginPath(); g.moveTo(l[0] + l[2] * 0.42, l[1] - l[3] * 0.64); g.lineTo(l[0] + l[2] * 0.68, l[1] - l[3] * 0.3); g.stroke();
      g.beginPath(); g.moveTo(l[0] + l[2] * 0.76, l[1] - l[3] * 0.14); g.lineTo(l[0] + l[2] * 0.8, l[1] - l[3] * 0.02); g.stroke();
    });
    const bridge = [[8.5, 13], [15, 10], [21, 12]];
    RJ.ink(g, bridge, { w: 3, color: C.ink, taper: 0, wobble: 0, weightVar: 0 });
    RJ.ink(g, bridge, { w: 1.3, color: J.frame, taper: 0, wobble: 0, weightVar: 0 });
  }
  function jdHead(g, S) {
    headBase(g, S, { skull: JD_SKULL, skin: J.skin, shade: J.skinSh, cast: JD_CAST, castDy: 0 });
    jdHair(g, S);
    jdGlasses(g, S);
  }
  function jdFaceSpec() {
    return {
      eyes: [{ x: -10, y: 19, w: 25, h: 24 }, { x: 38, y: 17, w: 22, h: 23 }],
      brows: [[-12, -9, 24], [42, -9, 20]],
      browStyle: { thick: 4.2, arch: 0.3, tilt: -0.05, color: J.hairSh },
      nose: [19, 38, 56],
      mouth: [7, 47, 16],
      mouthStyle: { lineW: 1.4, inner: '#c8505f', tongue: '#f59aa4' },
      blush: [[-17, 41, 17], [35, 39, 14]],
      sweat: [58, -12, 5],
      eye: { iris: J.iris, ring: '#150b06', sclera: '#fffdfa', expr: 'neutral', irisW: 0.7, irisH: 0.96, lid: 1.9, wing: 0.25, lash: 1.0, crease: false, lashes: 0, tilt: -0.03, drop: 0.05, hl: [[-0.4, -0.5, 0.27], [-0.36, -0.14, 0.12]] },
    };
  }

  // ---- the merch tote: standing on the ground at his side with folded tees poking out (figure space, drawn in the fx hook under the name 'prop') ----
  function jdTote(g, S) {
    const x = -70, y = 0;
    g.save(); g.fillStyle = 'rgba(20,6,40,0.28)'; g.beginPath(); g.ellipse(x + 2, y + 2, 25, 5.5, 0, 0, TAU); g.fill(); g.restore();
    // two folded tees: a cream one behind and a pink one in front, each with a tiny round print
    RJ.cel(g, rbox(x - 3, y - 66, 17, 30, 3), '#fff6e6', { shadow: '#eadcc3', line: LINE.main, depth: 3, tension: 0, hi: false, decor: (gg) => { RJ.ink(gg, [[x - 1, y - 58], [x + 12, y - 60]], { w: 1.1, color: '#eadcc3', taper: 0.4, wobble: 0 }); } });
    RJ.cel(g, [[x - 17, y - 42], [x - 16, y - 55], [x - 10, y - 59], [x - 2, y - 57], [x + 1, y - 50], [x + 1, y - 42]], J.tee2, { shadow: J.tee2Sh, line: LINE.main, depth: 3, tension: 0.6, decor: (gg) => {
      RJ.ink(gg, [[x - 15, y - 51], [x - 8, y - 54], [x, y - 50]], { w: 1.2, color: J.tee2Sh, taper: 0.4, wobble: 0 });
      gg.beginPath(); gg.arc(x - 7, y - 47.5, 2.4, 0, TAU); gg.fillStyle = J.logoG; gg.fill();
    } });
    // the handles, then the bag itself
    [[x - 11, y - 42, x - 9, y - 68, x + 7, y - 68, x + 9, y - 42]].forEach((h) => {
      const sp = [[h[0], h[1]], [h[2], h[3]], [h[4], h[5]], [h[6], h[7]]];
      RJ.ink(g, sp, { w: 6.6, color: C.ink, taper: 0, wobble: 0, weightVar: 0 });
      RJ.ink(g, sp, { w: 4, color: J.tealDk, taper: 0, wobble: 0, weightVar: 0 });
    });
    RJ.cel(g, rbox(x - 18, y - 42, 36, 42, 3.5), J.teal, { shadow: J.tealSh, line: LINE.main, depth: 5, tension: 0, hi: J.tealHi, hiW: 1.4, hiAlpha: 0.75, decor: (gg) => {
      gg.beginPath(); gg.rect(x - 20, y - 42, 40, 6); gg.fillStyle = J.tealDk; gg.fill();
      RJ.ink(gg, [[x - 13, y - 33], [x - 13, y - 4]], { w: 1.1, color: J.tealSh, taper: 0, wobble: 0 });
    } });
    tk.sparkle(g, x + 1, y - 19, 10.5, { color: '#f4fffd', glow: 0, thin: 0.22 });
    tk.sparkle(g, x + 11, y - 28, 3.8, { color: J.gold, glow: 0, thin: 0.22 });
  }
  const JD_TEE = [[-14, -151], [14, -151], [29, -146], [33, -131], [32, -106], [34, -78, 1], [-34, -78, 1], [-32, -106], [-33, -131], [-29, -146]];
  function jdTorso(g, S) {
    RJ.neck(g, 2, -156, { w: 20, h: 22, skin: J.skin, shade: J.skinSh });
    RJ.cel(g, JD_TEE, J.tee, { shadow: J.teeSh, line: LINE.main, depth: 7, hi: J.teeHi, hiW: 1.5, hiAlpha: 0.75, tension: 0.5, decor: (gg) => {
      gg.beginPath(); gg.rect(-40, -85, 80, 8); gg.fillStyle = J.teeSh; gg.fill();
      RJ.ink(gg, [[-40, -84.2], [40, -84.2]], { w: 2, color: J.teal, taper: 0, wobble: 0, weightVar: 0, alpha: 0.95 });      // the teal piping along the hem
      strokes(gg, [[-27, -128, -22, -114], [26, -130, 22, -116], [-26, -100, -24, -92], [20, -100, 19, -92]], { color: J.teeHi, alpha: 0.8, w: 1.3 });
    } });
    // the crew neck: a ribbed collar that hugs the base of the neck
    RJ.cel(g, [[-14, -152], [-9, -144], [0, -142], [9, -144], [14, -152], [10, -151], [6, -147.5], [0, -146], [-6, -147.5], [-10, -151]], J.rib, { shadow: J.teeSh, line: LINE.mid, depth: 2, hi: false });
    // the pendant: a small plain round silver disc on a dark cord, and the big pale teal badge high on the
    // wearer's left chest (a plain disc with a teal ring and an inner ring, no lettering)
    [[[-9, -148], [-5.5, -135], [0, -127]], [[10, -148], [6, -135], [0, -127]]].forEach((c) => {
      RJ.ink(g, c, { w: 3, color: C.ink, taper: 0, wobble: 0, weightVar: 0 });
      RJ.ink(g, c, { w: 1.3, color: '#5b566b', taper: 0, wobble: 0, weightVar: 0 });
    });
    RJ.cel(g, tk.circlePts(0, -122, 4.6, 14), J.metal, { shadow: '#8d889c', line: LINE.fine + 0.2, depth: 1, hi: false });      // a small plain round pendant (no symbol)
    RJ.cel(g, tk.circlePts(17, -120, 11.4, 20), J.badge, { shadow: J.badgeSh, line: LINE.mid, depth: 3, hi: J.badgeHi, hiW: 1.4, hiAlpha: 0.9, decor: (gg) => {
      gg.lineWidth = 2.1; gg.strokeStyle = J.teal; gg.beginPath(); gg.arc(17, -120, 9.8, 0, TAU); gg.stroke();
      gg.lineWidth = 0.9; gg.strokeStyle = J.tealSh; gg.beginPath(); gg.arc(17, -120, 6.6, 0, TAU); gg.stroke();
    } });
  }

  // ---- props in figure space: the tablet in the front hand, the stylus in the back hand, both hands drawn again on top, the watch and the bracelets ----
  function jdScreen(g, S, x, y, w, h) {
    const pose = S.P.pose, t = S.t;
    g.save();
    g.beginPath(); g.rect(x, y, w, h); g.clip();
    const gr = g.createLinearGradient(x, y, x, y + h); gr.addColorStop(0, J.screen); gr.addColorStop(1, J.screenDk); g.fillStyle = gr; g.fillRect(x, y, w, h);
    const cx = x + w / 2, cy = y + h / 2 - 2;
    const line = (pts, ww, col) => RJ.ink(g, pts, { w: ww, color: col, taper: 0.4, wobble: 0, weightVar: 0 });
    if (pose === 'attack') { g.fillStyle = 'rgba(255,255,255,' + (0.4 + 0.5 * S.beat).toFixed(2) + ')'; g.fillRect(x, y, w, h); tk.sparkle(g, cx, cy, 13 + 4 * S.beat, { color: J.teal, glow: 0, thin: 0.2 }); }
    else if (pose === 'cheer') { RJ.cel(g, [[cx, cy + 9, 1], [cx - 10, cy - 1], [cx - 5, cy - 9], [cx, cy - 4], [cx + 5, cy - 9], [cx + 10, cy - 1]], '#ff7fa8', { shadow: '#e0527f', line: LINE.fine + 0.2, depth: 2 }); }
    else if (pose === 'sing') { tk.note(g, cx, cy + 4, 12, { kind: 'beamed', color: J.tealDk }); }
    else if (pose === 'hurt') { line([[cx - 11, cy - 8], [cx - 5, cy - 2]], 2, J.tealDk); line([[cx - 5, cy - 8], [cx - 11, cy - 2]], 2, J.tealDk); line([[cx + 5, cy - 8], [cx + 11, cy - 2]], 2, J.tealDk); line([[cx + 11, cy - 8], [cx + 5, cy - 2]], 2, J.tealDk); line([[cx - 8, cy + 10], [cx - 3, cy + 6], [cx + 3, cy + 10], [cx + 8, cy + 6]], 1.8, J.tealDk); }
    else {
      // a doodle: a little sparkle logo being drawn, and a squiggle with a trailing dot
      tk.sparkle(g, cx, cy - 6, 8, { color: J.teal, glow: 0, thin: 0.2 });
      line([[cx - 13, cy + 10], [cx - 6, cy + 5], [cx, cy + 11], [cx + 7, cy + 6], [cx + 13, cy + 10]], 2, J.tealSh);
      g.beginPath(); g.arc(cx - 13, cy + 17, 1.6, 0, TAU); g.arc(cx - 6, cy + 17, 1.6, 0, TAU); g.fillStyle = J.tealSh; g.fill();
    }
    // a soft glare
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + w * 0.55, y); g.lineTo(x, y + h * 0.4); g.closePath(); g.fill();
    g.restore();
  }
  function jdTablet(g, S, wr) {
    const P = S.P, TW = 38, TH = 50, X0 = -13, Y0 = -TH - 4;   // held from underneath: the tablet's lower edge sits just above the wrist, so the forearm and the watch stay in view
    g.save(); g.translate(wr.w[0], wr.w[1]); g.rotate(P.tabRot || 0);
    // a halo of three soft rounded outlines (flat alpha, so it stays clean when a figure is baked onto a transparent canvas)
    [[11, 0.07], [7, 0.1], [3.4, 0.16]].forEach((h) => { g.save(); g.globalAlpha = Math.min(1, h[1] + 0.12 * (S.beat || 0)); g.lineWidth = h[0] * 2; g.lineJoin = 'round'; g.strokeStyle = J.teal; g.beginPath(); tk.trace(g, rbox(X0, Y0, TW, TH, 5 + h[0] * 0.6), 0, 0, 0); g.stroke(); g.restore(); });
    // the teal case round the screen
    RJ.cel(g, rbox(X0, Y0, TW, TH, 5), J.teal, { shadow: J.tealSh, line: LINE.main, depth: 3, tension: 0, hi: J.bezelHi, hiW: 1.3 });
    RJ.cel(g, rbox(X0 + 2.6, Y0 + 2.6, TW - 5.2, TH - 5.2, 3), '#25232d', { shadow: false, line: LINE.fine, tension: 0 });
    RJ.cel(g, rbox(X0 + 4, Y0 + 4, TW - 8, TH - 8, 2.2), J.screen, { shadow: false, line: LINE.fine, tension: 0 });
    jdScreen(g, S, X0 + 4.4, Y0 + 4.4, TW - 8.8, TH - 8.8);
    g.beginPath(); g.arc(X0 + TW / 2, Y0 + 2.3, 0.8, 0, TAU); g.fillStyle = '#7d768f'; g.fill();
    g.restore();
  }
  function jdStylus(g, S, bw) {
    const k = bw.ang + (S.P.bRot || 0), c = Math.cos(k), s = Math.sin(k), x = bw.w[0], y = bw.w[1];
    const a = [x - c * 9, y - s * 9], b = [x + c * 27, y + s * 27];
    RJ.ink(g, [a, b], { w: 5.6, color: C.ink, taper: 0, wobble: 0, weightVar: 0 });
    RJ.ink(g, [a, [x + c * 20, y + s * 20]], { w: 3.2, color: J.teal, taper: 0, wobble: 0, weightVar: 0 });
    RJ.ink(g, [[x + c * 20, y + s * 20], b], { w: 3.2, color: '#fff6e6', taper: 0, wobble: 0, weightVar: 0 });
    RJ.ink(g, [[x + c * 26, y + s * 26], [x + c * 30, y + s * 30]], { w: 1.6, color: C.ink, taper: 0, wobble: 0, weightVar: 0 });
    return b;
  }
  // a blue-faced wristwatch: a short strap across the forearm and a small round case with a blue dial, seated just before the hand (about 70 percent of the first
  // size, so it never reads as a badge on the tablet)
  function jdWatch(g, wr) {
    const ux = Math.cos(wr.ang), uy = Math.sin(wr.ang), k = 0.72;
    let nx = -uy, ny = ux;
    if (ny > 0) { nx = -nx; ny = -ny; }
    armBand(g, wr, 8, 5.4, J.strap, 4.2);
    const cx = wr.w[0] - ux * 8 + nx * 1, cy = wr.w[1] - uy * 8 + ny * 1;
    RJ.cel(g, tk.circlePts(cx, cy, 7.6 * k, 14), J.watch, { shadow: '#15131b', line: LINE.mid, depth: 1.8, hi: false });
    g.beginPath(); g.arc(cx, cy, 6.2 * k, 0, TAU); g.lineWidth = 0.9; g.strokeStyle = J.watchRim; g.stroke();
    g.beginPath(); g.arc(cx, cy, 5 * k, 0, TAU); g.fillStyle = J.face; g.fill();
    g.beginPath(); g.arc(cx - 1.6 * k, cy - 1.8 * k, 1.7 * k, 0, TAU); g.fillStyle = J.faceHi; g.globalAlpha = 0.9; g.fill(); g.globalAlpha = 1;
    RJ.ink(g, [[cx, cy], [cx + 2.6 * k, cy - 1.8 * k]], { w: 0.9, color: '#e9f3ff', taper: 0, wobble: 0, weightVar: 0 });
    RJ.ink(g, [[cx, cy], [cx - 0.4 * k, cy - 3.2 * k]], { w: 0.9, color: '#e9f3ff', taper: 0, wobble: 0, weightVar: 0 });
  }
  // two thin black bracelets on the other wrist
  function jdBracelets(g, wr) {
    armBand(g, wr, 7, 7.4, J.strap, 2.8);
    armBand(g, wr, 12, 7.8, J.strap, 2.8);
  }
  // a thin teal band just inside the end of a sleeve (figure space): the same geometry as RJ.sleeve, shoulder to elbow
  function jdSleevePipe(g, S, front) {
    const P = S.P, pt = S.pt, ar = S.spec.arm, sh = front ? pt.shF : pt.shB, tg = front ? pt.hand : [pt.shB[0] + P.bHand[0], pt.shB[1] + P.bHand[1]];
    const r = RJ.ik2(sh, tg, ar.l[0], ar.l[1], front ? P.fBend : P.bBend), dx = r.e[0] - sh[0], dy = r.e[1] - sh[1], d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, nx = -uy, ny = ux;
    const px = sh[0] + dx * ar.sleeve.len - ux * 2, py = sh[1] + dy * ar.sleeve.len - uy * 2, h = ar.sleeve.w1 / 2 - 1.6;
    RJ.ink(g, [[px - nx * h, py - ny * h], [px + nx * h, py + ny * h]], { w: 2, color: J.teal, taper: 0, wobble: 0, weightVar: 0, alpha: 0.95 });
  }
  // the back sleeve's piping goes in the 'mid' layer: after the back arm when it is drawn over the torso (bFront), before the head and its hair
  function jdMid(g, S) {
    if (!S.P.bFront) return;
    g.save();
    const inv = mat.inv(S.M.head); g.transform(inv[0], inv[1], inv[2], inv[3], inv[4], inv[5]);
    jdSleevePipe(g, S, false);
    g.restore();
  }
  // the tablet, the stylus and both gripping hands, drawn in figure space from the head-space 'top' layer (so the portrait crop has them too)
  function jdProps(g, S) {
    g.save();
    const inv = mat.inv(S.M.head); g.transform(inv[0], inv[1], inv[2], inv[3], inv[4], inv[5]);
    jdSleevePipe(g, S, true);
    const f = wristOf(S, true), b = wristOf(S, false);
    jdStylus(g, S, b);
    jdTablet(g, S, f);
    redrawHand(g, S, false);
    redrawHand(g, S, true);
    jdBracelets(g, b);
    jdWatch(g, f);
    g.restore();
  }
  function jdFx(g, S, name) {
    const t = S.t;
    if (name === 'prop') { jdTote(g, S); return; }
    const f = wristOf(S, true), P = S.P, ca = Math.cos(P.tabRot || 0), sa = Math.sin(P.tabRot || 0), cx = f.w[0] + (6 * ca + 21 * sa), cy = f.w[1] + (6 * sa - 21 * ca);
    if (name === 'doodle') {
      // the design strike: a teal logo burst out of the tablet, sparkles and a swoosh
      const b = S.beat;
      tk.glow(g, cx, cy, 40 + 12 * b, J.teal, 0.4 + 0.3 * b, false);
      RJ.fx.burst(g, cx + 30, cy - 24, 10 + 8 * b, J.teal, '#e6fffc', t);
      RJ.fx.sparkles(g, cx, cy, [[34, 8, 6, 0.2], [38, -48, 5, 0], [14, -44, 4.5, 0.4], [50, -10, 4, 0.1]], J.tealHi, t);
    } else if (name === 'hearts') RJ.fx.hearts(g, cx, cy - 22, t, '#ff7fa8');
    else if (name === 'tabnotes') RJ.fx.notes(g, cx - 6, cy - 22, t, J.teal, 3);
  }

  function jdPoses() {
    const warm = { eyes: 'open', mouth: 'smile', brow: -0.2, blush: 1.35 };
    return {
      idle: Object.assign({ mic: 'none', fHand: [10, 37], fBend: -1, fKind: 'fist', fRot: -0.3, tabRot: 0.1, bHand: [22, 31], bBend: 1, bKind: 'point', bRot: 0.1, bFront: 1, headRot: 0.04, fx: ['prop'] }, warm),
      sing: { mic: 'none', fHand: [26, 36], fBend: -1, fKind: 'fist', fRot: -0.3, tabRot: 0.1, bHand: [-32, -6], bBend: 1, bKind: 'open', bRot: 0.2, eyes: 'happy', mouth: 'happyOpen', brow: -0.3, headRot: -0.04, fx: ['prop', 'tabnotes'] },
      attack: { mic: 'none', fHand: [44, 22], fBend: -1, fKind: 'fist', fRot: -0.3, tabRot: 0.3, bHand: [36, 20], bBend: 1, bKind: 'point', bRot: -0.1, bFront: 1, lean: 0.07, torsoRot: 0.04, headRot: 0.07, headDx: 3,
        fFoot: [34, -12], bFoot: [-24, -12], eyes: 'determined', mouth: 'happyOpen', brow: 0.25, fx: ['prop', 'doodle'], look: [0.5, 0] },
      hurt: { mic: 'none', fHand: [8, 40], fBend: -1, fKind: 'fist', fRot: -0.2, tabRot: -0.35, bHand: [-34, -14], bBend: 1, bKind: 'open', bSpread: 1.3, lean: -0.13, torsoRot: -0.08, headRot: -0.14, headDx: -3,
        fFoot: [12, -12], bFoot: [-20, -12], eyes: 'hurt', mouth: 'ow', brow: -0.7, sweat: 1, blush: 0.6, fx: ['prop', 'stars'] },
      cheer: { mic: 'none', fHand: [42, -26], fBend: 1, fKind: 'fist', fRot: -0.2, tabRot: 0.4, bHand: [-30, -40], bBend: -1, bKind: 'fist', bRot: 0.1, eyes: 'happy', mouth: 'happyOpen', brow: -0.2, headRot: 0.05,
        fFoot: [20, -12], bFoot: [-18, -12], fx: ['prop', 'hearts'] },
      // the portrait pose: the tablet held low at the far side, the stylus hand down by the tote
      bust: Object.assign({ mic: 'none', fHand: [16, 52], fBend: -1, fKind: 'fist', fRot: -0.3, tabRot: 0.1, bHand: [-12, 56], bBend: 1, bKind: 'point', bRot: 0.1, bFront: 1, headRot: 0.03, fx: [] }, warm),
    };
  }

  const jdSpec = {
    id: 'jordan',
    accent: 'jordan',
    skel: {},
    base: { tabRot: 0.1 },
    poses: jdPoses(),
    face: jdFaceSpec(),
    exprs: { smirk: { eyes: 'open', mouth: 'smirk', brow: 0.2 } },
    arm: { l: [26, 24], w: [17, 13], skin: J.skin, skinSh: J.skinSh, sleeve: { color: J.tee, shade: J.teeSh, len: 0.8, w0: 21, w1: 25, hi: false }, hand: { skin: J.skin, shade: J.skinSh } },
    legs: {
      w: [27, 21], color: J.pants, shade: J.pantsSh, pantsOver: true, bow: 2,
      shoe: { color: '#fffaf0', sole: '#bdf3ee', shade: '#e8dfd0', toeCap: J.teal, accent: J.teal, hi: '#ffffff', k: 1.15 },
      decor(g, hip, an) {
        const dx = an[0] - hip[0], dy = an[1] - hip[1], d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, nx = -uy, ny = ux, qx = an[0] - ux * 7, qy = an[1] - uy * 7;
        RJ.ink(g, [[qx - nx * 10, qy - ny * 10], [qx + nx * 10, qy + ny * 10]], { w: 1.6, color: C.ink, taper: 0.2, wobble: 0 });
        RJ.ink(g, [[qx - ux * 4 - nx * 9, qy - uy * 4 - ny * 9], [qx - ux * 4 + nx * 9, qy - uy * 4 + ny * 9]], { w: 1.7, color: J.teal, taper: 0.2, wobble: 0, alpha: 0.95 });
        const mx = (hip[0] + an[0]) / 2, my = (hip[1] + an[1]) / 2;
        RJ.ink(g, [[mx + nx * 5, my + ny * 5], [mx + nx * 7 + ux * 18, my + ny * 7 + uy * 18]], { w: 1.3, color: J.teal, taper: 0.5, wobble: 0, alpha: 0.5 });
      },
    },
    mic: { accent: J.teal },
    bounds: { h: 293, x0: -126, x1: 129 },       // the silhouette over all five poses (the hurt lean, the tablet's reach), not the effects
    bust: { rect: [-96, -298, 92, -76], face: [-82, -292, 80, -150], pose: 'bust' },
    layers: { backHair: jdBack, torso: jdTorso, mid: jdMid, head: jdHead, top: jdProps, fx: jdFx },
    // the stylus hand makes little drawing strokes in the idle, the sing waves and the attack flicks the stylus on the beat
    tweak(P, t) {
      if (P.pose === 'idle') { const k = Math.sin(t * 3.1); P.bHand = [P.bHand[0] + 2.2 * k, P.bHand[1] + 1.2 * Math.sin(t * 6.2)]; }
      else if (P.pose === 'attack') { const b = P.beat; P.bHand = [P.bHand[0] + 6 * b, P.bHand[1] - 6 * b]; P.bRot = -0.1 + 0.4 * b; }
      else if (P.pose === 'sing') { P.bRot = 0.2 + 0.4 * Math.sin(t * 6); }
    },
  };
  RJ.register('jordan', crewRig(jdSpec));
})();
