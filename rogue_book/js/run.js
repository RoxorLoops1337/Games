// Inkwoven -- RUN: everything that lives for ONE run. DOM-free, clock-free, deterministic (DESIGN 4.7-4.10, 5.4).
// This header is the contract of record for the screen and GAME engineers. Plain data in, plain data out.
//
// RANDOMNESS. R stores no RNG state. Every roll builds U.rng(U.hash(R.seed, kind, R.chapter, q, r, extra)) for its own
// kind ('combat' 'reward' 'chest' 'gemcache' 'event' 'camp' 'brush' 'trialCurses' ...), so results depend on the tile and the
// choice made there and never on the order tiles were visited (the only order dependences are the ones the design asks for:
// "no event twice in a run", "no immediate encounter repeat", the rare pity counter). Shop stock comes from the map's
// content.shop.seed, relic hooks roll from their own trigger count. Reloading a saved node therefore replays the same shop,
// chest and event outcome. newRun resets the global U.uid counter, so equal seeds and actions give equal uids; keep ONE run
// alive at a time (a second newRun restarts the counter). RUN never calls META (R.unlocked, passed to newRun, gates locked
// content) and never touches COMBAT: it shapes the options for COMBAT.create and digests a finished combat (or anything with
// C.summary()). It needs only MAP.key neighbors generate paint pathToPaint canBrush applyBrush canMove move serialize deserialize.
//
// R (JSON-safe, see serialize):
//   v id seed trial daily mods(trial deltas) unlocked({card,relic,gem}|null = everything) heroes[{id,hp,maxHp}] frontIdx deck[{uid,id,up,gems}]
//   gems[gemId] relics[id] brushes[id] gold ink inkMax chapter map node pending[] stats{every LISTS.statKeys} flags{} rareOffset removals
//   seen{events[]} foes{enemyId:kills} log[{ch,msg}] done victory chapterCleared recorded, plus bookkeeping hk pendSeq opsN lastEnc.
//   done/victory: a combat was lost, or the chapter 3 boss fell (chapterEnd). chapterCleared: a boss reward was finished and
//   chapterEnd has not run yet (a save taken in that gap must route to chapterClear, not to the map). recorded: set by
//   META.recordRun so a run pays out once. foes: per-enemy kill counts for the bestiary. pending: choices that wait for the
//   player (from ops, hooks or fight wins). A gem or brush appears once per copy in R.gems and R.brushes.
//
// PUBLIC API (every function returns plain data; a refusal is {ok:false, reason} and changes nothing)
//   Setup    newRun({heroes:[idA,idB], trial=0, seed, daily=false, unlocked, nonce}) -> R (throws on a bad party)   dailyHeroes(seed) -> [idA,idB]
//            R.id comes from seed, trial, daily, heroes and `nonce`: GAME passes a clock-derived nonce so every tale has its own id (META pays
//            a run id once). Without a nonce equal inputs give equal ids, which keeps tests and the balance bot deterministic.
//            startChapter(R, n) -> {ok, chapter, log, pending}   mods(R) -> the final flat mods (DATA.modsFor(R.relics, R.mods))
//   Map      paint(R,q,r) -> {ok, tiles, cost, log, pending, mercy} | {ok:false, tiles:[], reason: done|busy|nomap|off|void|painted|unreachable|ink}
//            paintPreview(R,q,r) -> {ok, path:[[q,r]], cost, affordable, reason?}   useBrush(R, brushId, q, r, dir) -> {ok, tiles, log, pending, mercy}
//            | reason done|busy|nobrush|nothing|<MAP.canBrush reason>     canStep(R,q,r) -> bool
//            step(R,q,r) -> Node | Instant | null. null: the move was illegal (R.map.pos unchanged) or nothing waits on that tile.
//            Instant = {kind:'well', tile, gained (what fitted), amount (nominal), done:true} | {kind:'brush', tile, id, done:true}. A fable tile with
//            no eligible event resolves as {kind:'well', gained:1, fallback:'event', toast, done:true}. Instants are already applied and the tile is done.
//            Mercy: compare R.stats.mercy before and after a call to show the "the land hums back one Echo" toast (paint and useBrush also say mercy:true).
//   Combat   combatInit(R, node) -> the options for COMBAT.create (deck, heroes and mods are copies)
//            combatDone(R, C) -> Rewards | null. null: C is not over (nothing changed), or the party fell (then R.done is true). A repeat call for the
//            same fight returns the same Rewards and changes nothing. Applies HP (downed heroes revive at mods.reviveFrac of max HP, at least 1),
//            max HP gains, who leads, stats, kill Ink, gold, hooks, and rolls the rewards once; R.node becomes {kind:'reward', tile, rewards, source}.
//            claim(R, rewards, {card, relic, gem, takeBrush}) -> {ok, log, pending} | reason claimed|card|relic|owned|gem|brush (nothing applied)
//   Nodes    take(R, node, {relic:bool, gem:id|null}) -> {ok, gold?, relic?, gem?, log, pending} | reason taken|relic|gem|kind   (chest and gem cache)
//            shopBuy(R, stock, key) -> {ok, pending, log} | reason nokey|sold|gold|owned      shopRemove(R, stock, uid) -> {ok, price} | reason nostock|card|gold
//            eventChoices(R, ev|id) -> [{index,label,cost,ok,hidden,reason}] (a failed req.hero is hidden, other failed reqs are shown disabled with what is
//            missing; a choice whose every outcome can only do nothing right now, say a curse to remove with no curse in the deck, is locked too, unless it
//            would leave no open choice)
//            eventChoose(R, ev|id, i) -> {ok, text, applied[], fight?, pending?} | reason node|chosen|choice|<the req text>. A fight replaces R.node.
//            pickEvent(R, tile) -> id|null    campAction(R, action, arg) -> {ok,...} | reason node|action|used|actions|card|<socket reason>
//            campAction: 'rest' | 'sharpen' (arg uid or {uid}) | 'meditate' | 'gems' (no arg: may cutting start?; {uid,slot,gem}: one cut, the first
//            success counts as the action, more cuts stay allowed all visit; {leave:true}: ends a session, which also counts as the action)
//            forgeAction(R, 'upgrade' (arg uid) | 'gems' (as above)) one upgrade OR gem cutting; unused forges stay on the map while something is usable
//            finishNode(R) -> {chapterEnded}: marks the tile done, clears R.node and R.pending, runs the mercy check. A boss reward sets R.chapterCleared.
//            chapterEnd(R) -> {next:2|3|'victory', healed:[{id,n,hp,maxHp}], maxHp:8, log, pending}: +8 max HP, 30% heal (healMul), the next map, Ink
//            top-up, onChapterStart hooks. After the chapter 3 boss: next 'victory', R.done and R.victory, no heal.
//            checkStranded(R) -> bool (grants the Ink mercy, see DESIGN 4.8)
//   Ops      applyOps(R, ops, ctx) -> {log, pending, fight}: ctx {rng, key, tile, fight:false}. log lines are {op, text, ...}; text '' means "silent".
//            resolvePending(R, id, choice) -> {ok, log} | reason unknown|required|choice. Pending = {id, op, n, pick:'choose', filter, offers?}: deck ops
//            (removeCard upgradeCard transformCard duplicateCard) want an array of exactly min(n, candidates) uids, cardReward a card id from offers or null.
//            hook(R, name, ctx) -> {log, pending}   addRelic(R, id) -> {ok, id, log, pending} | reason unknown|owned (runs that relic's onPickup).
//            The addRelic OP with a fixed id the party owns gives a same-rarity relic instead, or (none left) logs 'Already owned.' and pays 40% of its shop price.
//            Any choice raised anywhere (a shop entry hook, a chapter start hook, a fight win) waits in R.pending: screens check it after every call.
//   Deck     addCard(R,id,{up,gems}) removeCard(R,uid) (gems return to R.gems) upgradeCard(R,uid) upgradable(R,filter) -> [uid]
//            socket(R, uid, slot, gemId) -> {ok, replaced} | reason card|slot|gem|color|same (replacing destroys the old gem; there is no unsocket)
//            forgeUsable(R) -> bool
//   Score    score(R)  summary(R) -> {score, victory, done, chapter, trial, daily, seed, id, heroes, deckSize, relics, gold, chaptersCleared, stats}
//   Save     serialize(R) -> plain object (includes the map and the uid counter)   deserialize(o) -> R | null (null when o.v differs or o is junk;
//            drops unknown cards, relics, gems and brushes; U.resetUid past every uid)
//
//   Rewards = {gold (net, what R gained), goldBase, ink, cards[] (offers), relics[] (offers), gems[] (offers), brush|null, maxHp, boss, tier,
//              source:'combat'|'event', claimed, pending[], log[]}. gold and ink are ALREADY in R; the rest are offers that claim resolves.
//   Node    = {kind, tile:{q,r}, ...}: 'combat' {tier, enc, enemies, seed, rewards, onWin, source} | 'reward' {rewards, source} | 'shop' {stock:{items,
//             removePrice}, hookLog} | 'event' {event, chosen} | 'camp' {used[]} | 'forge' {used: null|'upgrade'|'gems'} | 'chest' {loot:{gold, relic, gems[]},
//             taken} | 'gemcache' {offers[], taken}. Shop items: {key, kind:'card'|'gem'|'relic'|'brush', id, price, sale, sold, was?}.
//
// Dials data.js has no home for live below as constants: gem tier weights per chapter, elite gem and brush drop chances, brush weights.
// Deviations from the task text, all following DESIGN: no unsocket and no maxHpPct (both removed in the revised design), unlock filtering
// through R.unlocked instead of a META call (RUN never calls META), events are weighted by w (not a bare seeded shuffle).
const RUN = (() => {
  const VERSION = 1;
  const E = () => DATA.ECONOMY;
  const L = () => DATA.LISTS;

  // Dials data.js has no home for: weights for tiers 1,2,3 by chapter (gems from chests, caches, shops, drops).
  const GEM_TIERS = { 1: [60, 35, 5], 2: [30, 50, 20], 3: [10, 45, 45] };
  const DROP = { eliteGem: 0.4, bossGems: 1, eliteBrush: 0.5 };
  const BRUSH_W = { stroke: 26, fan: 22, splash: 16, halo: 16, blot: 12, wave: 8 };
  const RARITIES = ['common', 'uncommon', 'rare'];
  const CAMP_ACTIONS = ['rest', 'sharpen', 'gems', 'meditate'];
  const LOG_MAX = 80;
  const OWNED_RELIC_GOLD = 0.4;                                      // a fixed treasure the party already owns turns into this share of its shop price

  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const clampInt = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.floor(Number(v)) || 0));
  const trunc = (v) => (v < 0 ? -Math.floor(-v) : Math.floor(v));
  const uniq = (arr) => arr.filter((x, i) => arr.indexOf(x) === i);
  const strs = (a) => (Array.isArray(a) ? uniq(a.filter((x) => typeof x === 'string')) : []);

  // ---------------------------------------------------------------- small state helpers
  function newStats() {
    const s = {};
    L().statKeys.forEach((k) => { s[k] = 0; });
    return s;
  }
  const mods = (R) => DATA.modsFor(R.relics, R.mods || {});
  const partyIds = (R) => R.heroes.map((h) => h.id);
  const tileAt = (R, q, r) => (R.map && R.map.tiles ? R.map.tiles[MAP.key(q, r)] || null : null);
  const findInst = (R, uid) => R.deck.find((c) => c.uid === uid) || null;
  const cardName = (id) => (DATA.cards[id] && DATA.cards[id].name) || id;
  const relicName = (id) => (DATA.relics[id] && DATA.relics[id].name) || id;

  function note(R, msg) {
    R.log.push({ ch: R.chapter, msg });
    if (R.log.length > LOG_MAX) R.log.splice(0, R.log.length - LOG_MAX);
  }
  function syncInk(R) {
    const m = mods(R);
    R.inkMax = m.inkMax;
    if (R.ink > R.inkMax) R.ink = R.inkMax;
  }
  const rngFor = (R, kind, q, r, extra) => U.rng(U.hash(R.seed, kind, R.chapter, q, r, extra));
  const posOf = (R) => (R.map && R.map.pos ? R.map.pos : { q: 0, r: 0 });

  function allLocked() {
    const pick = (reg) => Object.keys(reg).filter((id) => reg[id] && reg[id].locked);
    return { card: pick(DATA.cards), relic: pick(DATA.relics), gem: pick(DATA.gems) };
  }
  function cleanUnlocked(u) {
    if (!u || typeof u !== 'object') return null;                // null means "everything" (DATA.isUnlocked)
    return { card: strs(u.card), relic: strs(u.relic), gem: strs(u.gem) };
  }

  // ---------------------------------------------------------------- instances and deck
  function mkInst(id, opts) {
    const def = DATA.cards[id];
    const inst = { uid: U.uid(), id, up: opts && opts.up && def && def.up ? 1 : 0, gems: ((def && def.slots) || []).map(() => null) };
    if (opts && Array.isArray(opts.gems)) opts.gems.forEach((g, i) => { if (i < inst.gems.length && typeof g === 'string') inst.gems[i] = g; });
    return inst;
  }
  function addCard(R, id, opts) {
    if (!DATA.cards[id]) return null;
    const inst = mkInst(id, opts);
    R.deck.push(inst);
    return inst;
  }
  function removeCard(R, uid) {
    const i = R.deck.findIndex((c) => c.uid === uid);
    if (i < 0) return null;
    const inst = R.deck.splice(i, 1)[0];
    inst.gems.forEach((g) => { if (g) R.gems.push(g); });         // only replacing a gem destroys it
    return inst;
  }
  function upgradeCard(R, uid) {
    const inst = findInst(R, uid);
    const def = inst && DATA.cards[inst.id];
    if (!inst || !def || !def.up || inst.up) return null;
    inst.up = 1;
    R.stats.upgrades += 1;
    return inst;
  }
  function socket(R, uid, slot, gemId) {
    const inst = findInst(R, uid);
    if (!inst) return { ok: false, reason: 'card' };
    const def = DATA.cards[inst.id];
    const slots = (def && def.slots) || [];
    if (!Number.isInteger(slot) || slot < 0 || slot >= slots.length) return { ok: false, reason: 'slot' };
    const gem = DATA.gems[gemId];
    const gi = R.gems.indexOf(gemId);
    if (!gem || gi < 0) return { ok: false, reason: 'gem' };
    if (slots[slot] !== 'any' && slots[slot] !== gem.color) return { ok: false, reason: 'color' };
    if (inst.gems[slot] === gemId) return { ok: false, reason: 'same' };
    const replaced = inst.gems[slot] || null;                       // the old gem is destroyed
    R.gems.splice(gi, 1);
    inst.gems[slot] = gemId;
    R.stats.gemsSocketed += 1;
    return { ok: true, uid, slot, gem: gemId, replaced };
  }
  function upgradable(R, filter) {
    return R.deck.filter((c) => { const d = DATA.cards[c.id]; return d && d.up && !c.up && cardMatches(d, filter); }).map((c) => c.uid);
  }
  function cardMatches(def, filter) {
    if (!filter) return true;
    if (filter.type && def.type !== filter.type) return false;
    if (filter.hero && def.hero !== filter.hero) return false;
    return true;
  }
  function forgeUsable(R) {
    if (upgradable(R).length) return true;
    return R.gems.some((g) => R.deck.some((c) => {
      const slots = (DATA.cards[c.id] && DATA.cards[c.id].slots) || [];
      return slots.some((s, i) => c.gems[i] !== g && (s === 'any' || (DATA.gems[g] && s === DATA.gems[g].color)));
    }));
  }

  // ---------------------------------------------------------------- pools, weights, offers
  const relicCandidates = (R, rarity, exclude) => DATA.relicPool(rarity, R.unlocked, partyIds(R)).filter((r) => R.relics.indexOf(r.id) < 0 && !(exclude && exclude.indexOf(r.id) >= 0));

  function rarityWeights(R, table, pity) {
    const src = E().rarity[table] || E().rarity.normal;
    let c = src.common || 0, u = src.uncommon || 0, r = src.rare || 0;
    let extra = (mods(R).rareBoost | 0) + (pity ? Math.min(R.rareOffset | 0, E().rareOffsetCap) : 0);
    if (extra > 0) {                                                 // points move from common (then uncommon) to rare
      const a = Math.min(extra, c); c -= a; extra -= a;
      const b = Math.min(extra, u); u -= b;
      r += a + b;
    }
    return { common: c, uncommon: u, rare: r };
  }
  // A permutation of the rarities: sampled by weight without replacement, zero weights last (rare first), so a
  // drained pool falls back to the next best thing instead of returning nothing.
  function rarityOrder(rng, w) {
    const rest = RARITIES.filter((k) => (w[k] || 0) > 0);
    const order = [];
    while (rest.length) {
      const pick = rng.weighted(rest.map((k) => [k, w[k]]));
      order.push(pick);
      rest.splice(rest.indexOf(pick), 1);
    }
    ['rare', 'uncommon', 'common'].forEach((k) => { if (order.indexOf(k) < 0) order.push(k); });
    return order;
  }
  // n distinct card ids for the given heroes (default the party). o: {table, n, heroes, rarity, pity, exclude}
  function offerCards(R, rng, o) {
    const heroes = o.heroes && o.heroes.length ? o.heroes : partyIds(R);
    const out = [];
    const taken = (o.exclude || []).slice();
    for (let i = 0; i < o.n; i++) {
      const order = rarityOrder(rng, o.rarity ? { [o.rarity]: 1 } : rarityWeights(R, o.table || 'normal', o.pity));
      const hs = rng.shuffle(heroes);
      let pickId = null;
      for (let a = 0; a < order.length && pickId === null; a++) {
        for (let b = 0; b < hs.length && pickId === null; b++) {
          const cands = DATA.rewardPool(hs[b], order[a], R.unlocked).filter((c) => taken.indexOf(c.id) < 0);
          if (cands.length) pickId = rng.pick(cands).id;
        }
      }
      if (pickId === null) break;
      out.push(pickId);
      taken.push(pickId);
    }
    return out;
  }
  const isRare = (id) => !!(DATA.cards[id] && DATA.cards[id].rarity === 'rare');

  // One relic of the rarity rolled from `weights` ({common, uncommon, rare}); falls back to the other common..rare pools.
  function rollRelic(R, rng, weights, exclude) {
    const order = rarityOrder(rng, weights);
    for (let i = 0; i < order.length; i++) {
      const c = relicCandidates(R, order[i], exclude);
      if (c.length) return rng.pick(c);
    }
    return null;
  }
  function bossRelics(R, rng, n) {
    const out = [];
    const boss = rng.shuffle(relicCandidates(R, 'boss'));
    boss.slice(0, n).forEach((r) => out.push(r.id));
    if (out.length < n) rng.shuffle(relicCandidates(R, 'rare', out)).slice(0, n - out.length).forEach((r) => out.push(r.id));
    return out;
  }
  function tierOrder(rng, chapter) {
    const w = GEM_TIERS[chapter] || GEM_TIERS[1];
    const rest = [1, 2, 3];
    const order = [];
    while (rest.length) {
      const pick = rng.weighted(rest.map((t) => [t, w[t - 1]]));
      order.push(pick);
      rest.splice(rest.indexOf(pick), 1);
    }
    return order;
  }
  // n distinct gems, tier by chapter weights, preferring colours not yet in the offer.
  function rollGems(R, rng, n, filter) {
    const out = [];
    for (let i = 0; i < n; i++) {
      let pickId = null;
      const order = filter && filter.tier ? [filter.tier] : tierOrder(rng, R.chapter);
      for (let a = 0; a < order.length && pickId === null; a++) {
        const cands = DATA.gemPool({ tier: order[a], color: filter && filter.color }, R.unlocked).filter((g) => out.indexOf(g.id) < 0);
        if (!cands.length) continue;
        const fresh = cands.filter((g) => !out.some((o) => DATA.gems[o].color === g.color));
        pickId = rng.pick(fresh.length ? fresh : cands).id;
      }
      if (pickId === null) break;
      out.push(pickId);
    }
    return out;
  }
  function rollBrush(rng) {
    const ids = Object.keys(DATA.brushes);
    return ids.length ? rng.weighted(ids.map((id) => [id, has(BRUSH_W, id) ? BRUSH_W[id] : 10])) : null;
  }

  // ---------------------------------------------------------------- pending choices
  function addPending(R, entry) {
    R.pendSeq += 1;
    entry.id = 'p' + R.pendSeq;
    R.pending.push(entry);
    return entry;
  }
  const isHeroCard = (def) => !!def && L().heroIds.indexOf(def.hero) >= 0;
  function deckCandidates(R, kind, filter) {
    return R.deck.filter((c) => {
      const d = DATA.cards[c.id];
      if (!d) return kind === 'removeCard';
      if (!cardMatches(d, filter)) return false;
      if (kind === 'upgradeCard') return !!d.up && !c.up;
      if (kind === 'transformCard' || kind === 'duplicateCard') return isHeroCard(d);
      return true;
    });
  }
  function transformPool(R, def, exceptId) {
    return DATA.cardsBy({ hero: def.hero, rarity: def.rarity }).filter((c) => c.id !== exceptId && c.rarity !== 'token' && DATA.isUnlocked('card', c.id, R.unlocked));
  }
  function doDeckOp(R, kind, inst, rng, log) {
    const def = DATA.cards[inst.id];
    const name = cardName(inst.id);
    if (kind === 'removeCard') {
      removeCard(R, inst.uid);
      log.push({ op: kind, id: inst.id, text: `Lost ${name}.` });
    } else if (kind === 'upgradeCard') {
      upgradeCard(R, inst.uid);
      log.push({ op: kind, id: inst.id, uid: inst.uid, text: `Upgraded ${name}.` });
    } else if (kind === 'duplicateCard') {
      const copy = addCard(R, inst.id, { up: !!inst.up });
      log.push({ op: kind, id: inst.id, uid: copy.uid, text: `Copied ${name}.` });
    } else if (kind === 'transformCard') {
      const pool = def ? transformPool(R, def, inst.id) : [];
      if (!pool.length) { log.push({ op: kind, id: inst.id, text: `${name} stays as it is.` }); return; }
      const next = rng.pick(pool);
      inst.gems.forEach((g) => { if (g) R.gems.push(g); });
      inst.uid = U.uid();
      inst.id = next.id;
      inst.up = inst.up && next.up ? 1 : 0;
      inst.gems = (next.slots || []).map(() => null);
      log.push({ op: kind, id: next.id, uid: inst.uid, from: def.id, text: `${name} became ${next.name}.` });
    }
  }
  function runDeckOp(R, o, rng, out) {
    const cands = deckCandidates(R, o.op, o.filter);
    const n = Math.min(o.n || 1, cands.length);
    if (!n) { out.log.push({ op: o.op, text: 'Nothing to choose.' }); return; }
    if (o.random) {
      rng.sample(cands, n).forEach((c) => doDeckOp(R, o.op, c, rng, out.log));
      return;
    }
    out.pending.push(addPending(R, { op: o.op, n: o.n || 1, pick: 'choose', filter: o.filter || null }));
  }

  // ---------------------------------------------------------------- run ops (events, run hooks, fight wins)
  function whoList(R, who, rng) {
    if (!who || who === 'both') return R.heroes.slice();
    if (who === 'front') return [R.heroes[R.frontIdx] || R.heroes[0]];
    if (who === 'lowest') return [R.heroes.reduce((a, b) => (b.hp < a.hp ? b : a))];
    if (who === 'random') return [rng.pick(R.heroes)];
    return R.heroes.filter((h) => h.id === who);
  }
  function fightNode(R, o, tile) {
    const enemies = o.enemies ? o.enemies.slice() : ((DATA.groupById(o.enc) || {}).enemies || []).slice();
    const tier = o.tier === 'elite' ? 'elite' : 'normal';
    return {
      kind: 'combat', tile: { q: tile.q, r: tile.r }, tier, enc: o.enc || null, enemies,
      seed: U.hash(R.seed, 'combat', R.chapter, tile.q, tile.r, 'fable'), rewards: o.rewards !== false,
      onWin: Array.isArray(o.win) && o.win.length ? U.deepCopy(o.win) : null, source: 'event',
    };
  }
  const OPS = {
    gold(R, o, ctx, out) {
      const d = o.n !== undefined ? o.n : trunc(R.gold * o.pct);
      const before = R.gold;
      R.gold = Math.max(0, R.gold + d);
      const real = R.gold - before;
      if (real > 0) R.stats.goldEarned += real;
      out.log.push({ op: 'gold', n: real, text: real > 0 ? `Found ${real} gold.` : real < 0 ? `Lost ${-real} gold.` : 'No gold changes hands.' });
    },
    ink(R, o, ctx, out) {
      const d = o.n !== undefined ? o.n : trunc(R.inkMax * o.pct);
      const before = R.ink;
      R.ink = Math.min(R.inkMax, Math.max(0, R.ink + d));
      out.log.push({ op: 'ink', n: R.ink - before, text: R.ink >= before ? `Gained ${R.ink - before} Echo.` : `Lost ${before - R.ink} Echo.` });
    },
    heal(R, o, ctx, out) {
      const healMul = mods(R).healMul;
      const done = [];
      whoList(R, o.who, ctx.rng).forEach((h) => {
        const base = o.n !== undefined ? o.n : Math.round(h.maxHp * o.pct);
        const before = h.hp;
        h.hp = Math.min(h.maxHp, h.hp + Math.max(0, Math.round(base * healMul)));
        done.push({ id: h.id, n: h.hp - before });
      });
      out.log.push({ op: 'heal', who: done, text: done.length ? 'The party is mended.' : 'Nobody to heal.' });
    },
    hurt(R, o, ctx, out) {
      const done = [];
      whoList(R, o.who, ctx.rng).forEach((h) => {
        const n = o.n !== undefined ? o.n : Math.max(1, Math.round(h.maxHp * o.pct));
        const before = h.hp;
        h.hp = Math.max(1, h.hp - n);                                // never kills
        done.push({ id: h.id, n: before - h.hp });
      });
      out.log.push({ op: 'hurt', who: done, text: done.length ? 'The party is hurt.' : 'Nobody was hurt.' });
    },
    maxHp(R, o, ctx, out) {
      const done = [];
      whoList(R, o.who, ctx.rng).forEach((h) => {
        const max = Math.max(1, h.maxHp + o.n);
        const delta = max - h.maxHp;
        h.maxHp = max;
        h.hp = Math.max(1, delta > 0 ? h.hp + delta : Math.min(h.hp, max));
        done.push({ id: h.id, n: delta });
      });
      out.log.push({ op: 'maxHp', who: done, n: o.n, text: o.n > 0 ? `Max HP up by ${o.n}.` : `Max HP down by ${-o.n}.` });
    },
    addCard(R, o, ctx, out) {
      const rng = ctx.rng;
      const heroes = o.pool === 'party' || !o.pool ? partyIds(R) : [o.pool];
      for (let i = 0; i < (o.n || 1); i++) {
        let id = o.card;
        if (!id) {
          const table = o.rarity ? null : E().rarity.normal;
          const rar = o.rarity || rng.weighted(RARITIES.map((k) => [k, table[k] || 0]));
          const got = offerCards(R, rng, { n: 1, heroes: [rng.pick(heroes)], rarity: rar });
          id = got[0];
        }
        const inst = id && addCard(R, id, { up: !!o.up });
        out.log.push(inst ? { op: 'addCard', id, uid: inst.uid, text: `Gained ${cardName(id)}.` } : { op: 'addCard', text: 'No card to gain.' });
      }
    },
    removeCard(R, o, ctx, out) { runDeckOp(R, o, ctx.rng, out); },
    upgradeCard(R, o, ctx, out) { runDeckOp(R, o, ctx.rng, out); },
    transformCard(R, o, ctx, out) { runDeckOp(R, o, ctx.rng, out); },
    duplicateCard(R, o, ctx, out) { runDeckOp(R, o, ctx.rng, out); },
    addRelic(R, o, ctx, out) {
      let id = o.id;
      if (!id) {
        const c = relicCandidates(R, o.rarity);
        id = c.length ? ctx.rng.pick(c).id : null;
      }
      if (!id) { out.log.push({ op: 'addRelic', text: 'No treasure to find.' }); return; }
      if (DATA.relics[id] && R.relics.indexOf(id) >= 0) {
        // A fixed treasure the party already carries (a peddler's lamp, the fox's mask): never "paid, got nothing". A stand-in of the same
        // rarity takes its place; with none left, the log says it is already owned and a share of its shop price comes back as gold.
        const alt = relicCandidates(R, DATA.relics[id].rarity);
        if (alt.length) id = ctx.rng.pick(alt).id;
        else {
          const n = Math.round((E().price.relic[DATA.relics[id].rarity] || E().price.relic.common) * OWNED_RELIC_GOLD);
          out.log.push({ op: 'addRelic', id, text: 'Already owned.' });
          OPS.gold(R, { n }, ctx, out);
          out.log[out.log.length - 1].text = `You already carry ${relicName(id)}, so it turns into ${n} gold.`;
          return;
        }
      }
      const res = gainRelic(R, id);
      if (!res.ok) { out.log.push({ op: 'addRelic', text: 'No treasure to find.' }); return; }
      out.log.push({ op: 'addRelic', id, text: `Found ${relicName(id)}.` });
      res.log.forEach((x) => out.log.push(x));
      res.pending.forEach((p) => out.pending.push(p));
    },
    addGem(R, o, ctx, out) {
      let id = o.id;
      if (id && !DATA.gems[id]) id = null;
      if (!id) {
        let got = rollGems(R, ctx.rng, 1, { tier: o.tier, color: o.color });
        if (!got.length) got = rollGems(R, ctx.rng, 1, { color: o.color });
        if (!got.length) got = rollGems(R, ctx.rng, 1, null);
        id = got[0] || null;
      }
      if (id) R.gems.push(id);
      out.log.push(id ? { op: 'addGem', id, text: `Found ${DATA.gems[id].name}.` } : { op: 'addGem', text: 'No gem to find.' });
    },
    addBrush(R, o, ctx, out) {
      const id = o.id === 'random' ? rollBrush(ctx.rng) : o.id;
      if (id && DATA.brushes[id]) R.brushes.push(id);
      out.log.push(id && DATA.brushes[id] ? { op: 'addBrush', id, text: `Found the ${DATA.brushes[id].name}.` } : { op: 'addBrush', text: 'No Song to find.' });
    },
    addCurse(R, o, ctx, out) {
      const ids = (DATA.FIXED.curses || []).filter((id) => DATA.cards[id]);
      for (let i = 0; i < (o.n || 1); i++) {
        const id = o.id && DATA.cards[o.id] ? o.id : (ids.length ? ctx.rng.pick(ids) : null);
        const inst = id && addCard(R, id);
        out.log.push(inst ? { op: 'addCurse', id, uid: inst.uid, text: `Cursed with ${cardName(id)}.` } : { op: 'addCurse', text: 'The curse fizzles.' });
      }
    },
    flag(R, o, ctx, out) {
      R.flags[o.k] = o.v === undefined ? 1 : o.v;
      out.log.push({ op: 'flag', k: o.k, text: '' });                  // silent line: text '' means "show nothing"
    },
    paint(R, o, ctx, out) {
      const boss = R.map && R.map.boss;
      const p = boss ? MAP.pathToPaint(R.map, boss.q, boss.r) : null;
      const cells = p && p.path ? p.path.slice(0, o.n) : [];
      const tiles = [];
      cells.forEach((c) => {
        const t = MAP.paint(R.map, c[0], c[1]);
        if (!t) return;
        tiles.push(t);
        R.stats.hexesPainted += 1;
        const h = hook(R, 'onPaint', { q: c[0], r: c[1] });
        h.log.forEach((x) => out.log.push(x));
        h.pending.forEach((x) => out.pending.push(x));
      });
      out.log.push({ op: 'paint', n: tiles.length, text: tiles.length ? `The land wakes (${U.plural(tiles.length, 'hex', 'hexes')}).` : 'The way ahead is already open.' });
    },
    cardReward(R, o, ctx, out) {
      const n = o.n || 3;
      const heroes = !o.hero || o.hero === 'party' ? partyIds(R) : [o.hero];
      const offers = offerCards(R, ctx.rng, { table: 'normal', n, heroes, rarity: o.rarity, pity: true });
      if (!offers.length) { out.log.push({ op: 'cardReward', text: 'No cards to offer.' }); return; }
      out.pending.push(addPending(R, { op: 'cardReward', n, pick: 'choose', filter: o.rarity || o.hero ? { rarity: o.rarity || null, hero: o.hero || null } : null, offers }));
    },
    fight(R, o, ctx, out) {
      if (ctx.fight === false) { out.log.push({ op: 'fight', text: 'Nothing stirs.' }); return; }
      const tile = ctx.tile || posOf(R);
      out.fight = fightNode(R, o, tile);
      out.log.push({ op: 'fight', enemies: out.fight.enemies.slice(), text: 'A fight breaks out!' });
    },
  };
  function applyOps(R, ops, ctx) {
    ctx = ctx || {};
    if (!ctx.rng) ctx = Object.assign({}, ctx, { rng: U.rng(U.hash(R.seed, 'ops', R.chapter, ctx.key !== undefined ? ctx.key : (R.opsN += 1))) });
    const out = { log: [], pending: [], fight: null };
    (ops || []).forEach((o) => {
      if (!o || out.fight || !OPS[o.op]) return;
      OPS[o.op](R, o, ctx, out);
    });
    return out;
  }

  function resolvePending(R, id, choice) {
    const i = R.pending.findIndex((p) => p.id === id);
    if (i < 0) return { ok: false, reason: 'unknown', log: [] };
    const p = R.pending[i];
    const log = [];
    if (p.op === 'cardReward') {
      if (choice !== null && choice !== undefined) {
        if (p.offers.indexOf(choice) < 0) return { ok: false, reason: 'choice', log };
        addCard(R, choice);
        if (isRare(choice)) R.rareOffset = 0;
        log.push({ op: 'cardReward', id: choice, text: `Gained ${cardName(choice)}.` });
      }
      R.pending.splice(i, 1);
      return { ok: true, log };
    }
    const uids = Array.isArray(choice) ? choice : (isNum(choice) ? [choice] : null);
    if (!uids) return { ok: false, reason: 'required', log };
    const cands = deckCandidates(R, p.op, p.filter);
    const need = Math.min(p.n, cands.length);
    const set = uniq(uids);
    if (set.length !== need || uids.length !== need || !set.every((u) => cands.some((c) => c.uid === u))) return { ok: false, reason: 'choice', log };
    const rng = U.rng(U.hash(R.seed, 'pending', R.chapter, p.id, set.join(',')));
    set.forEach((u) => { const inst = findInst(R, u); if (inst) doDeckOp(R, p.op, inst, rng, log); });
    R.pending.splice(i, 1);
    return { ok: true, log };
  }

  // ---------------------------------------------------------------- relics and run hooks
  const hookGuard = {};
  let hookDepth = 0;
  function filterOk(filter, ctx) {
    if (!filter) return true;
    if (filter.tier !== undefined) {
      const want = Array.isArray(filter.tier) ? filter.tier : [filter.tier];
      if (want.indexOf(ctx.tier) < 0) return false;
    }
    return true;
  }
  function hook(R, name, ctx) {
    ctx = ctx || {};
    const res = { log: [], pending: [] };
    if (hookDepth > 6) return res;
    R.relics.slice().forEach((rid) => {
      if (ctx.only && ctx.only !== rid) return;
      const def = DATA.relics[rid];
      if (!def || !Array.isArray(def.hooks)) return;
      def.hooks.forEach((h, idx) => {
        if (h.on !== name || !filterOk(h.filter, ctx)) return;
        const key = rid + '#' + idx;
        const gkey = name + ':' + key;
        if (hookGuard[gkey]) return;                                  // a hook never re-enters itself (onPaint + paint)
        const st = R.hk[key] || (R.hk[key] = { n: 0, ch: 0, once: 0 });
        if (h.once && st.once) return;
        st.n += 1;                                                   // every counts triggers per run
        if (h.every && st.n % h.every !== 0) return;
        if (h.limit && st.ch >= h.limit) return;                     // limit is per chapter
        st.ch += 1;
        if (h.once) st.once = 1;
        hookGuard[gkey] = true;
        hookDepth += 1;
        try {
          const out = applyOps(R, h.fx, { rng: U.rng(U.hash(R.seed, 'hook', R.chapter, name, key, st.n)), fight: false, src: rid });
          res.log.push({ op: 'relic', id: rid, hook: name, text: '' });
          out.log.forEach((x) => res.log.push(Object.assign({ src: rid }, x)));
          out.pending.forEach((x) => res.pending.push(x));
        } finally {
          hookDepth -= 1;
          delete hookGuard[gkey];
        }
      });
    });
    return res;
  }
  function gainRelic(R, id) {
    if (!DATA.relics[id]) return { ok: false, reason: 'unknown', log: [], pending: [] };
    if (R.relics.indexOf(id) >= 0) return { ok: false, reason: 'owned', log: [], pending: [] };
    R.relics.push(id);
    syncInk(R);
    R.stats.relicsFound += 1;
    note(R, `Found ${relicName(id)}.`);
    const h = hook(R, 'onPickup', { only: id });
    return { ok: true, id, log: h.log, pending: h.pending };
  }

  // ---------------------------------------------------------------- new run and chapters
  function dailyHeroes(seed) {
    return U.rng(U.hash(seed, 'daily', 'heroes')).shuffle(L().heroIds).slice(0, 2);
  }
  function newRun(opts) {
    opts = opts || {};
    const daily = !!opts.daily;
    const seed = (isNum(opts.seed) ? opts.seed : 1) >>> 0;
    let heroes = opts.heroes;
    if (daily && (!Array.isArray(heroes) || heroes.length !== 2)) heroes = dailyHeroes(seed);
    if (!Array.isArray(heroes) || heroes.length !== 2 || heroes[0] === heroes[1] || !heroes.every((id) => DATA.heroes[id])) throw new Error('RUN.newRun: heroes must be two distinct hero ids');
    const trial = daily ? 0 : clampInt(opts.trial, 0, 10);
    U.resetUid(1);                                                   // equal seeds and actions give equal uids
    const R = {
      v: VERSION, id: 'rb' + U.hash(seed, trial, daily ? 'daily' : 'run', heroes.join(','), ...(opts.nonce === undefined ? [] : [opts.nonce])).toString(36), seed, trial, daily,
      mods: U.deepCopy(DATA.trialDeltas(trial)), unlocked: daily ? allLocked() : cleanUnlocked(opts.unlocked),
      heroes: heroes.map((id) => ({ id, hp: DATA.heroes[id].maxHp, maxHp: DATA.heroes[id].maxHp })), frontIdx: 0,
      deck: [], gems: [], relics: [], brushes: ['stroke'], gold: 0, ink: 0, inkMax: 0, chapter: 0, map: null, node: null, pending: [],
      stats: newStats(), flags: {}, rareOffset: 0, removals: 0, seen: { events: [] }, foes: {}, log: [], done: false, victory: false,
      chapterCleared: false, recorded: false, hk: {}, pendSeq: 0, opsN: 0, lastEnc: null,
    };
    const m = mods(R);
    R.gold = m.startGold;
    R.inkMax = m.inkMax;
    heroes.forEach((id) => DATA.heroes[id].starter.forEach((cid) => addCard(R, cid)));
    const curses = (DATA.FIXED.curses || []).filter((id) => DATA.cards[id]);
    if (curses.length) {
      const rng = U.rng(U.hash(R.seed, 'trialCurses'));
      for (let i = 0; i < m.curses; i++) addCard(R, rng.pick(curses));
    }
    startChapter(R, 1);
    return R;
  }
  function startChapter(R, n) {
    if (L().chapters.indexOf(n) < 0) throw new Error('RUN.startChapter: bad chapter ' + n);
    R.chapter = n;
    R.map = MAP.generate({ chapter: n, seed: U.hash(R.seed, 'ch' + n, 'map') });
    R.node = null;
    R.pending = [];
    R.chapterCleared = false;
    R.lastEnc = null;
    Object.keys(R.hk).forEach((k) => { R.hk[k].ch = 0; });
    const m = mods(R);
    R.inkMax = m.inkMax;
    R.ink = Math.min(m.inkMax, Math.max(R.ink, m.startInk));       // chapter 1: startInk; later chapters top up to it
    note(R, `Verse ${n} begins.`);
    const h = hook(R, 'onChapterStart', {});
    return { ok: true, chapter: n, log: h.log, pending: h.pending };
  }

  // ---------------------------------------------------------------- painting, brushes, mercy
  function paintPreview(R, q, r) {
    const none = (reason) => ({ ok: false, path: [], cost: 0, affordable: false, reason });
    if (!R.map) return none('nomap');
    const t = tileAt(R, q, r);
    if (!t) return none('off');
    if (t.type === 'block') return none('void');
    if (t.painted) return none('painted');
    const p = MAP.pathToPaint(R.map, q, r);
    if (!p || !p.path || !p.path.length) return none('unreachable');
    const cost = p.path.length * E().paintCost;
    return { ok: true, path: p.path, cost, affordable: R.ink >= cost };
  }
  function paint(R, q, r) {
    if (R.done) return { ok: false, tiles: [], reason: 'done' };
    if (R.node) return { ok: false, tiles: [], reason: 'busy' };
    const pre = paintPreview(R, q, r);
    if (!pre.ok) return { ok: false, tiles: [], reason: pre.reason };
    if (!pre.affordable) return { ok: false, tiles: [], reason: 'ink' };
    R.ink -= pre.cost;                                               // all or nothing: checked above
    const res = { ok: true, tiles: [], cost: pre.cost, log: [], pending: [] };
    pre.path.forEach((c) => {
      const t = MAP.paint(R.map, c[0], c[1]);
      if (!t) return;
      res.tiles.push(t);
      R.stats.hexesPainted += 1;
      const h = hook(R, 'onPaint', { q: c[0], r: c[1] });
      h.log.forEach((x) => res.log.push(x));
      h.pending.forEach((x) => res.pending.push(x));
    });
    res.mercy = checkStranded(R);
    return res;
  }
  function useBrush(R, brushId, q, r, dir) {
    if (R.done) return { ok: false, tiles: [], reason: 'done' };
    if (R.node) return { ok: false, tiles: [], reason: 'busy' };
    const bi = R.brushes.indexOf(brushId);
    if (bi < 0) return { ok: false, tiles: [], reason: 'nobrush' };
    const can = MAP.canBrush(R.map, brushId, q, r, dir);
    if (!can || !can.ok) return { ok: false, tiles: [], reason: (can && can.reason) || 'invalid' };
    const painted = MAP.applyBrush(R.map, brushId, q, r, dir) || [];
    if (!painted.length) return { ok: false, tiles: [], reason: 'nothing' };
    R.brushes.splice(bi, 1);
    R.stats.brushesUsed += 1;
    const res = { ok: true, tiles: painted, log: [], pending: [] };
    painted.forEach((t) => {
      R.stats.hexesPainted += 1;
      const h = hook(R, 'onPaint', { q: t.q, r: t.r });
      h.log.forEach((x) => res.log.push(x));
      h.pending.forEach((x) => res.pending.push(x));
    });
    res.mercy = checkStranded(R);
    return res;
  }
  // Mercy rule (4.8): out of Ink and brushes with nothing unresolved reachable over painted ground -> exactly paintCost Ink.
  function unresolvedReachable(R) {
    const M = R.map;
    const seen = {};
    const stack = [[M.pos.q, M.pos.r]];
    seen[MAP.key(M.pos.q, M.pos.r)] = true;
    while (stack.length) {
      const cur = stack.pop();
      const t = M.tiles[MAP.key(cur[0], cur[1])];
      if (t && !t.done && t.type !== 'empty' && t.type !== 'start' && t.type !== 'block') return true;
      MAP.neighbors(M, cur[0], cur[1]).forEach((nb) => {
        const k = MAP.key(nb[0], nb[1]);
        const nt = M.tiles[k];
        if (seen[k] || !nt || !nt.painted || nt.type === 'block') return;
        seen[k] = true;
        stack.push([nb[0], nb[1]]);
      });
    }
    return false;
  }
  function checkStranded(R) {
    if (!R || R.done || R.node || !R.map || !R.map.pos) return false;
    const cost = E().paintCost;
    if (R.ink >= cost || R.brushes.length > 0) return false;
    if (unresolvedReachable(R)) return false;
    R.ink = Math.min(R.inkMax, R.ink + cost);
    R.stats.mercy += 1;
    note(R, 'The land hums back one Echo.');
    return true;
  }

  // ---------------------------------------------------------------- stepping onto tiles
  function canStep(R, q, r) {
    return !!R.map && !R.done && !R.node && !!MAP.canMove(R.map, q, r);
  }
  function pickGroup(R, tile, kind) {
    const groups = (DATA.encounters[R.chapter] && DATA.encounters[R.chapter][kind]) || [];
    if (!groups.length) return null;
    const diff = isNum(tile.diff) ? tile.diff : 0;
    let pool = DATA.eligibleGroups(R.chapter, kind, diff);
    if (!pool.length) pool = groups;
    const rng = rngFor(R, 'combat', tile.q, tile.r, 'enc');
    let g = rng.weighted(pool, (x) => x.w);
    if (g && g.id === R.lastEnc && pool.length > 1) g = rng.weighted(pool.filter((x) => x.id !== R.lastEnc), (x) => x.w);
    return g;
  }
  function combatNode(R, tile) {
    const tier = tile.type === 'boss' ? 'boss' : tile.type === 'elite' ? 'elite' : 'normal';
    let enemies, enc = null;
    if (tier === 'boss') {
      const boss = (DATA.encounters[R.chapter] && DATA.encounters[R.chapter].boss) || DATA.FIXED.bosses[R.chapter];
      enemies = boss ? [boss] : [];
    } else {
      let g = tile.content && tile.content.enc ? DATA.groupById(tile.content.enc) : null;
      if (!g) g = pickGroup(R, tile, tier);
      enc = g ? g.id : null;
      enemies = g ? g.enemies.slice() : [];
    }
    if (enc) R.lastEnc = enc;
    return { kind: 'combat', tile: { q: tile.q, r: tile.r }, tier, enc, enemies, seed: U.hash(R.seed, 'combat', R.chapter, tile.q, tile.r), rewards: true, onWin: null, source: 'combat' };
  }
  function chestNode(R, tile) {
    const c = tile.content || {};
    const rng = rngFor(R, 'chest', tile.q, tile.r);
    const gold = Math.round((isNum(c.gold) ? c.gold : rng.int(E().gold.chest[0], E().gold.chest[1])) * mods(R).goldMul);
    let relic = null, gems = [];
    if (c.relic) {
      const w = { common: 0, uncommon: 0, rare: 0 };
      w[c.relic] = 1;
      const rel = rollRelic(R, rng, w);
      relic = rel ? rel.id : null;
    }
    if (!relic) gems = rollGems(R, rng, 3);
    return { kind: 'chest', tile: { q: tile.q, r: tile.r }, loot: { gold, relic, gems }, taken: false };
  }
  function buildShop(R, tile) {
    const shopSeed = tile.content && tile.content.shop && tile.content.shop.seed;
    const base = shopSeed !== undefined ? shopSeed : U.hash(R.seed, 'shop', R.chapter, tile.q, tile.r);
    const sub = (name) => U.rng(U.hash(base, 'shop', name));
    const m = mods(R);
    const price = (n) => Math.max(1, Math.round(n * m.priceMul));
    const party = partyIds(R);
    const items = [];
    const add = (letter, kind, id, cost, sale) => {
      const idx = items.filter((x) => x.kind === kind).length;
      items.push({ key: letter + idx, kind, id, price: cost, sale: !!sale, sold: false });
    };
    const cr = sub('cards');
    const order = cr.shuffle(party);
    const ids = [];
    for (let i = 0; i < E().shop.cards; i++) {
      const hero = i < order.length ? order[i] : cr.pick(party);
      const got = offerCards(R, cr, { table: 'shop', n: 1, heroes: [hero], exclude: ids });
      if (!got.length) continue;
      ids.push(got[0]);
    }
    const saleAt = ids.length ? cr.int(0, ids.length - 1) : -1;
    ids.forEach((id, i) => {
      const full = price(E().price.card[DATA.cards[id].rarity] || E().price.card.common);
      const sale = i === saleAt;
      add('c', 'card', id, sale ? Math.max(1, Math.round(full * E().price.saleFrac)) : full, sale);
      if (sale) items[items.length - 1].was = full;
    });
    rollGems(R, sub('gems'), E().shop.gems).forEach((g) => add('g', 'gem', g, price(E().price.gem[DATA.gems[g].tier])));
    const rr = sub('relics');
    const picked = [];
    const shopRelics = relicCandidates(R, 'shop');
    if (shopRelics.length) picked.push(rr.pick(shopRelics));
    while (picked.length < E().shop.relics) {
      const rel = rollRelic(R, rr, E().relicWeights.shop, picked.map((x) => x.id));
      if (!rel) break;
      picked.push(rel);
    }
    picked.forEach((rel) => add('r', 'relic', rel.id, price(E().price.relic[rel.rarity] || E().price.relic.common)));
    for (let i = 0; i < E().shop.brushes; i++) { const b = rollBrush(sub('brush' + i)); if (b) add('b', 'brush', b, price(E().price.brush)); }
    return { items, removePrice: removePrice(R) };
  }
  const removePrice = (R) => Math.max(1, Math.round((E().price.remove + E().price.removeStep * R.removals) * mods(R).priceMul));

  // What a flag-locked choice tells the player: a hint at the story beat that is missing.
  const FLAG_HINTS = { fox_spared: 'Not yet: you never freed the fox', fox_bond: 'Not yet: the fox has not befriended you' };
  const pct = (f) => Math.round(f * 100) + '%';
  function eventReq(R, req) {
    if (!req) return { ok: true };
    const live = R.heroes.filter((h) => h.hp > 0);
    if (req.hero !== undefined && partyIds(R).indexOf(req.hero) < 0) return { ok: false, hidden: true, reason: 'hero' };
    if (req.gold !== undefined && R.gold < req.gold) return { ok: false, reason: `Needs ${req.gold} gold` };
    if (req.hpPct !== undefined && !live.every((h) => h.hp >= req.hpPct * h.maxHp)) return { ok: false, reason: `Every hero needs ${pct(req.hpPct)} HP` };
    if (req.hpBelow !== undefined && !live.some((h) => h.hp < req.hpBelow * h.maxHp)) return { ok: false, reason: `Needs a hero below ${pct(req.hpBelow)} HP` };
    if (req.relic !== undefined && R.relics.indexOf(req.relic) < 0) return { ok: false, reason: `Needs the ${relicName(req.relic)}` };
    if (req.flag !== undefined && !R.flags[req.flag]) return { ok: false, reason: FLAG_HINTS[req.flag] || 'Not yet: the journey has not led here' };
    if (req.chapter !== undefined && R.chapter !== req.chapter) return { ok: false, reason: `Verse ${req.chapter} only` };
    return { ok: true };
  }
  // Ops that can only do nothing right now: a curse to remove with no curse in the deck, a card to sharpen with every card sharp, a fixed treasure
  // the party already carries. A choice whose every outcome holds one is locked with the reason, rather than taking the player's gold or HP for nothing.
  const DEAD_DECK_TEXT = { removeCard: 'No card to remove', upgradeCard: 'Nothing left to sharpen', transformCard: 'Nothing to transform', duplicateCard: 'Nothing to copy' };
  const DECK_GROWERS = ['addCard', 'addCurse', 'cardReward'];             // ops after one of these depend on cards it adds: not judged
  function deadOp(R, o) {
    if (DEAD_DECK_TEXT[o.op]) {
      if (deckCandidates(R, o.op, o.filter).length) return null;
      return o.op === 'removeCard' && o.filter && o.filter.type === 'curse' ? 'You carry no curse' : DEAD_DECK_TEXT[o.op];
    }
    if (o.op === 'addRelic' && o.id && DATA.relics[o.id] && R.relics.indexOf(o.id) >= 0) return `You already carry the ${relicName(o.id)}`;
    return null;
  }
  function deadReason(R, ops) {
    for (let i = 0; i < (ops || []).length; i += 1) {
      const o = ops[i];
      if (!o || DECK_GROWERS.indexOf(o.op) >= 0) return null;
      const why = deadOp(R, o);
      if (why) return why;
    }
    return null;
  }
  function choiceDead(R, choice) {
    const outs = Array.isArray(choice.out) ? choice.out : [];
    if (!outs.length) return null;
    const why = outs.map((o) => deadReason(R, o && o.ops));
    return why.every(Boolean) ? why[0] : null;
  }
  function eventWhen(R, when) {
    if (!when) return true;
    if (when.flag !== undefined && !R.flags[when.flag]) return false;
    if (when.relic !== undefined && R.relics.indexOf(when.relic) < 0) return false;
    if (when.hero !== undefined && partyIds(R).indexOf(when.hero) < 0) return false;
    return true;
  }
  // Fable tile: allowed here and now, weighted by w, preferring unseen; once events never repeat; null when nothing qualifies.
  function pickEvent(R, tile) {
    const seen = R.seen.events;
    const ok = Object.keys(DATA.events).map((id) => DATA.events[id]).filter((e) => e && (!e.chapters || e.chapters.indexOf(R.chapter) >= 0) && eventWhen(R, e.when) && !(e.once && seen.indexOf(e.id) >= 0));
    const fresh = ok.filter((e) => seen.indexOf(e.id) < 0);
    const pool = fresh.length ? fresh : ok.filter((e) => !e.once);
    if (!pool.length) return null;
    const rng = rngFor(R, 'event', tile.q, tile.r, 'pick');
    return rng.weighted(pool, (e) => (isNum(e.w) ? e.w : 1)).id;
  }
  function eventChoices(R, ev) {
    const def = typeof ev === 'string' ? DATA.events[ev] : ev;
    if (!def) return [];
    const rows = def.choices.map((c, i) => {
      const s = eventReq(R, c.req);
      return { index: i, label: c.label, cost: c.cost || null, ok: !!s.ok, hidden: !!s.hidden, reason: s.reason || null, dead: s.ok ? choiceDead(R, c) : null };
    });
    // a fable never locks itself: the dead-end locks only apply while some other choice stays open
    const lock = rows.some((r) => r.ok && !r.dead);
    return rows.map((r) => { const dead = lock ? r.dead : null; return { index: r.index, label: r.label, cost: r.cost, ok: r.ok && !dead, hidden: r.hidden, reason: dead || r.reason }; });
  }
  function eventNode(R, tile) {
    let id = tile.content && tile.content.id && DATA.events[tile.content.id] ? tile.content.id : null;
    if (!id) id = pickEvent(R, tile);
    if (!id) return null;
    if (R.seen.events.indexOf(id) < 0) R.seen.events.push(id);
    R.stats.eventsSeen += 1;
    return { kind: 'event', tile: { q: tile.q, r: tile.r }, event: id, chosen: null };
  }
  function eventChoose(R, ev, i) {
    const node = R.node;
    const def = typeof ev === 'string' ? DATA.events[ev] : ev;
    if (!def || !node || node.kind !== 'event') return { ok: false, reason: 'node', applied: [] };
    if (node.chosen !== null && node.chosen !== undefined) return { ok: false, reason: 'chosen', applied: [] };
    const choice = def.choices[i];
    if (!choice) return { ok: false, reason: 'choice', applied: [] };
    const st = eventChoices(R, def)[i];
    if (!st.ok) return { ok: false, reason: st.reason || 'req', applied: [] };
    const rng = rngFor(R, 'event', node.tile.q, node.tile.r, i);
    const outcome = rng.weighted(choice.out, (o) => o.w);
    const res = applyOps(R, outcome.ops, { rng, tile: node.tile, key: 'event' });
    node.chosen = i;
    note(R, def.title ? `${def.title}: ${choice.label}.` : 'A fable unfolds.');
    const out = { ok: true, text: outcome.text, applied: res.log };
    if (res.pending.length) out.pending = res.pending;
    if (res.fight) { R.node = res.fight; out.fight = res.fight; }
    return out;
  }

  function wellNode(R, tile) {
    const m = mods(R);
    const base = isNum(tile.content && tile.content.ink) ? tile.content.ink : E().wellInk;
    const amount = Math.max(1, base + (m.wellInk - E().wellInk));
    const before = R.ink;
    R.ink = Math.min(R.inkMax, R.ink + amount);
    R.stats.wellsDrunk += 1;
    tile.done = true;
    return { kind: 'well', tile: { q: tile.q, r: tile.r }, gained: R.ink - before, amount, done: true };
  }
  function enterTile(R, t) {
    const at = { q: t.q, r: t.r };
    switch (t.type) {
      case 'well': return wellNode(R, t);
      case 'brush': {
        let id = t.content && t.content.id;
        if (!id || id === 'random') id = rollBrush(rngFor(R, 'brush', t.q, t.r));
        if (id) R.brushes.push(id);
        t.done = true;
        return { kind: 'brush', tile: at, id, done: true };
      }
      case 'enemy': case 'elite': case 'boss': return (R.node = combatNode(R, t));
      case 'chest': return (R.node = chestNode(R, t));
      case 'gemcache': return (R.node = { kind: 'gemcache', tile: at, offers: rollGems(R, rngFor(R, 'gemcache', t.q, t.r), 3), taken: false });
      case 'camp': return (R.node = { kind: 'camp', tile: at, used: [] });
      case 'forge': return (R.node = { kind: 'forge', tile: at, used: null });
      case 'shop': {
        R.stats.shopsVisited += 1;
        R.node = { kind: 'shop', tile: at, stock: buildShop(R, t) };
        const h = hook(R, 'onShopEnter', { q: t.q, r: t.r });
        R.node.hookLog = h.log;
        return R.node;
      }
      case 'event': {
        const n = eventNode(R, t);
        if (n) return (R.node = n);
        R.ink = Math.min(R.inkMax, R.ink + 1);
        t.done = true;
        return { kind: 'well', tile: at, gained: 1, amount: 1, fallback: 'event', toast: 'The fable has nothing left to tell. You find a little Echo.', done: true };
      }
      default: return null;
    }
  }
  function step(R, q, r) {
    if (!canStep(R, q, r)) return null;
    const t = MAP.move(R.map, q, r);
    let res = null;
    if (t && !t.done) res = enterTile(R, t);
    checkStranded(R);
    return res;
  }

  // ---------------------------------------------------------------- combat
  function combatInit(R, node) {
    node = node || R.node;
    return {
      heroes: R.heroes.map((h) => ({ id: h.id, hp: h.hp, maxHp: h.maxHp })), frontIdx: R.frontIdx, deck: U.deepCopy(R.deck),
      enemies: node.enemies.slice(), tier: node.tier, chapter: R.chapter, seed: node.seed, mods: mods(R), relics: R.relics.slice(), gold: R.gold,
    };
  }
  function mergeCombatStats(R, stats, kills, tier, win) {
    const keys = L().statKeys, max = L().statMax;
    Object.keys(stats).forEach((k) => {
      if (k === 'kills' || keys.indexOf(k) < 0 || !isNum(stats[k])) return;
      R.stats[k] = max.indexOf(k) >= 0 ? Math.max(R.stats[k], stats[k]) : R.stats[k] + stats[k];
    });
    R.stats.kills += kills.length;
    R.stats.elites += kills.filter((k) => k.tier === 'elite').length;
    kills.forEach((k) => { if (k.def) R.foes[k.def] = (R.foes[k.def] || 0) + 1; });
    if (win && tier === 'boss') {
      R.stats.bossKills += 1;
      R.stats['boss' + R.chapter + 'Kills'] += 1;
      if (!stats.damageTaken) R.stats.flawlessBosses += 1;
    }
  }
  function combatDone(R, C) {
    if (R.node && R.node.kind === 'reward') return R.node.rewards;      // already digested: a repeat call changes nothing
    const S = typeof C.summary === 'function' ? C.summary() : C;
    if (!S || (S.result !== 'win' && S.result !== 'lose')) return null;
    const node = R.node && R.node.kind === 'combat' ? R.node : null;
    const tile = node ? node.tile : { q: posOf(R).q, r: posOf(R).r };
    const tier = node ? node.tier : (C.tier || S.tier || 'normal');
    const stats = S.stats || {};
    const kills = Array.isArray(stats.kills) ? stats.kills : (Array.isArray(S.kills) ? S.kills : []);
    const win = S.result === 'win';
    mergeCombatStats(R, stats, kills, tier, win);
    if (!win) {
      R.done = true;
      R.victory = false;
      R.node = null;
      note(R, 'The party fell.');
      return null;
    }
    const m = mods(R);
    const gains = S.maxHpGain || {};
    let maxHpTotal = 0;
    (S.heroes || []).forEach((sh) => {
      const h = R.heroes.find((x) => x.id === sh.id);
      if (!h) return;
      const g = gains[sh.id] | 0;
      h.maxHp += g;
      maxHpTotal += g;
      const hp = sh.down || !(sh.hp > 0) ? Math.round(h.maxHp * m.reviveFrac) : sh.hp;
      h.hp = Math.min(h.maxHp, Math.max(1, hp));
    });
    const front = typeof C.front === 'function' ? C.front() : null;
    const fi = front ? R.heroes.findIndex((h) => h.id === front.id) : (Number.isInteger(S.frontIdx) ? S.frontIdx : -1);
    if (fi >= 0 && fi < R.heroes.length) R.frontIdx = fi;
    note(R, tier === 'boss' ? 'A keeper fell.' : 'Fight won.');

    const won = hook(R, 'onFightWon', { tier });
    const pending = won.pending.slice();
    const log = won.log.slice();
    const on = !node || node.rewards !== false;
    const gr = rngFor(R, 'reward', tile.q, tile.r, 'gold');
    const range = E().gold[tier] || E().gold.normal;
    const goldBase = on ? Math.round(gr.int(range[0], range[1]) * m.goldMul) : 0;
    const extraGold = isNum(S.gold) ? S.gold : 0;
    const before = R.gold;
    R.gold = Math.max(0, R.gold + goldBase + extraGold);
    R.stats.goldEarned += goldBase + Math.max(0, extraGold);
    const killInk = kills.reduce((s, k) => s + (E().killInk[k.tier] || 0), 0);
    const inkGain = killInk + (isNum(S.ink) ? S.ink : 0);
    R.ink = Math.min(R.inkMax, Math.max(0, R.ink + inkGain));

    const table = tier === 'boss' ? 'boss' : tier === 'elite' ? 'elite' : 'normal';
    const cards = on ? offerCards(R, rngFor(R, 'reward', tile.q, tile.r, 'cards'), { table, n: m.cardChoices, pity: table !== 'boss' }) : [];
    if (on && table !== 'boss' && cards.length && !cards.some(isRare)) R.rareOffset += 1;
    let relics = [], gems = [], brush = null;
    if (on) {
      const rr = rngFor(R, 'reward', tile.q, tile.r, 'relic');
      if (tier === 'boss') relics = bossRelics(R, rr, 3);
      else if (tier === 'elite') { const rel = rollRelic(R, rr, E().relicWeights.elite); if (rel) relics = [rel.id]; }
      const gr2 = rngFor(R, 'reward', tile.q, tile.r, 'gem');
      if (tier === 'boss') gems = rollGems(R, gr2, DROP.bossGems);
      else if (tier === 'elite' && gr2.chance(DROP.eliteGem)) gems = rollGems(R, gr2, 1);
      const br = rngFor(R, 'reward', tile.q, tile.r, 'brush');
      if ((tier === 'elite' && br.chance(DROP.eliteBrush)) || (node && node.source === 'event')) brush = rollBrush(br);
    }
    if (node && node.onWin) {
      const out = applyOps(R, node.onWin, { rng: rngFor(R, 'reward', tile.q, tile.r, 'win'), tile, fight: false, key: 'win' });
      out.log.forEach((x) => log.push(x));
      out.pending.forEach((x) => pending.push(x));
    }
    const rewards = {
      gold: R.gold - before, goldBase, ink: inkGain, cards, relics, gems, brush, maxHp: maxHpTotal, boss: tier === 'boss', tier,
      source: node ? node.source : 'combat', claimed: false, pending, log,
    };
    R.node = { kind: 'reward', tile: { q: tile.q, r: tile.r }, rewards, source: rewards.source };
    return rewards;
  }
  function claim(R, rewards, choice) {
    choice = choice || {};
    if (!rewards || rewards.claimed) return { ok: false, reason: 'claimed', log: [], pending: [] };
    if (choice.card && rewards.cards.indexOf(choice.card) < 0) return { ok: false, reason: 'card', log: [], pending: [] };
    if (choice.relic && rewards.relics.indexOf(choice.relic) < 0) return { ok: false, reason: 'relic', log: [], pending: [] };
    if (choice.relic && R.relics.indexOf(choice.relic) >= 0) return { ok: false, reason: 'owned', log: [], pending: [] };
    if (choice.gem && rewards.gems.indexOf(choice.gem) < 0) return { ok: false, reason: 'gem', log: [], pending: [] };
    if (choice.takeBrush && !rewards.brush) return { ok: false, reason: 'brush', log: [], pending: [] };
    const res = { ok: true, log: [], pending: [] };
    if (choice.card) {
      addCard(R, choice.card);
      if (isRare(choice.card)) R.rareOffset = 0;
      res.log.push({ op: 'addCard', id: choice.card, text: `Gained ${cardName(choice.card)}.` });
    }
    if (choice.relic) {
      const g = gainRelic(R, choice.relic);
      res.log.push({ op: 'addRelic', id: choice.relic, text: `Found ${relicName(choice.relic)}.` });
      g.log.forEach((x) => res.log.push(x));
      g.pending.forEach((x) => res.pending.push(x));
    }
    if (choice.gem) { R.gems.push(choice.gem); res.log.push({ op: 'addGem', id: choice.gem, text: `Found ${DATA.gems[choice.gem].name}.` }); }
    if (choice.takeBrush) { R.brushes.push(rewards.brush); res.log.push({ op: 'addBrush', id: rewards.brush, text: 'Learned the Song.' }); }
    rewards.claimed = true;
    if (R.node && R.node.rewards && R.node.rewards !== rewards) R.node.rewards.claimed = true;
    checkStranded(R);
    return res;
  }
  function take(R, node, choice) {
    node = node || R.node;
    choice = choice || {};
    if (!node || node.taken) return { ok: false, reason: 'taken' };
    const done = (extra) => { node.taken = true; if (R.node && R.node !== node && R.node.kind === node.kind) R.node.taken = true; return extra; };
    if (node.kind === 'chest') {
      if (choice.relic && !node.loot.relic) return { ok: false, reason: 'relic' };
      if (choice.gem && node.loot.gems.indexOf(choice.gem) < 0) return { ok: false, reason: 'gem' };
      R.gold += node.loot.gold;
      R.stats.goldEarned += node.loot.gold;
      R.stats.chestsOpened += 1;
      const res = { ok: true, gold: node.loot.gold, log: [], pending: [] };
      if (choice.relic) { const g = gainRelic(R, node.loot.relic); res.log.push(...g.log); res.pending.push(...g.pending); res.relic = node.loot.relic; }
      if (choice.gem) { R.gems.push(choice.gem); res.gem = choice.gem; }
      checkStranded(R);
      return done(res);
    }
    if (node.kind === 'gemcache') {
      if (choice.gem && node.offers.indexOf(choice.gem) < 0) return { ok: false, reason: 'gem' };
      if (choice.gem) R.gems.push(choice.gem);
      checkStranded(R);
      return done({ ok: true, gem: choice.gem || null });
    }
    return { ok: false, reason: 'kind' };
  }

  // ---------------------------------------------------------------- shop
  function shopSync(R, stock, key, removePriceNow) {
    const live = R.node && R.node.kind === 'shop' ? R.node.stock : null;
    if (!live || live === stock) return;
    if (key) { const a = live.items.find((x) => x.key === key), b = stock.items.find((x) => x.key === key); if (a && b) a.sold = b.sold; }
    if (removePriceNow !== undefined) live.removePrice = removePriceNow;
  }
  function shopBuy(R, stock, key) {
    const item = stock && stock.items.find((x) => x.key === key);
    if (!item) return { ok: false, reason: 'nokey' };
    if (item.sold) return { ok: false, reason: 'sold' };
    if (R.gold < item.price) return { ok: false, reason: 'gold' };
    if (item.kind === 'relic' && R.relics.indexOf(item.id) >= 0) return { ok: false, reason: 'owned' };
    R.gold -= item.price;                                            // pay first: a pickup hook may change gold
    R.stats.goldSpent += item.price;
    R.stats.purchases += 1;
    item.sold = true;
    const res = { ok: true, pending: [], log: [] };
    if (item.kind === 'card') addCard(R, item.id);
    else if (item.kind === 'gem') R.gems.push(item.id);
    else if (item.kind === 'brush') R.brushes.push(item.id);
    else if (item.kind === 'relic') {
      const g = gainRelic(R, item.id);
      res.pending = g.pending; res.log = g.log;
    }
    shopSync(R, stock, key);
    return res;
  }
  function shopRemove(R, stock, uid) {
    if (!stock) return { ok: false, reason: 'nostock' };
    const price = stock.removePrice;
    if (!findInst(R, uid)) return { ok: false, reason: 'card' };
    if (R.gold < price) return { ok: false, reason: 'gold' };
    removeCard(R, uid);
    R.gold -= price;
    R.stats.goldSpent += price;
    R.stats.purchases += 1;
    R.removals += 1;
    stock.removePrice = removePrice(R);
    shopSync(R, stock, null, stock.removePrice);
    return { ok: true, price };
  }

  // ---------------------------------------------------------------- camp and forge
  function campMax(R) {
    return Math.min(3, Math.max(1, mods(R).campActions + (R.flags.extraCampActions | 0)));
  }
  function uidArg(arg) { return arg && typeof arg === 'object' ? arg.uid : arg; }
  function campAction(R, action, arg) {
    const node = R.node;
    if (!node || node.kind !== 'camp') return { ok: false, reason: 'node' };
    if (CAMP_ACTIONS.indexOf(action) < 0) return { ok: false, reason: 'action' };
    const used = node.used || (node.used = []);
    const first = used.indexOf(action) < 0;
    const gemsAgain = action === 'gems' && !first;                   // Cut Gems stays open for the whole visit once started
    if (!first && !gemsAgain) return { ok: false, reason: 'used' };
    if (first && used.length >= campMax(R)) return { ok: false, reason: 'actions' };
    if (action === 'rest') {
      const healMul = mods(R).healMul;
      const healed = R.heroes.map((h) => {
        const before = h.hp;
        h.hp = Math.min(h.maxHp, h.hp + Math.round(h.maxHp * E().camp.restPct * healMul));
        return { id: h.id, n: h.hp - before, hp: h.hp, maxHp: h.maxHp };
      });
      used.push('rest');
      R.stats.campRests += 1;
      const h = hook(R, 'onRest', { q: node.tile.q, r: node.tile.r });
      return { ok: true, healed, log: h.log, pending: h.pending };
    }
    if (action === 'sharpen') {
      const uid = uidArg(arg);
      if (upgradable(R).indexOf(uid) < 0) return { ok: false, reason: 'card' };
      const inst = upgradeCard(R, uid);
      used.push('sharpen');
      return { ok: true, uid, id: inst.id };
    }
    if (action === 'meditate') {
      const rng = rngFor(R, 'camp', node.tile.q, node.tile.r, 'meditate');
      const before = R.ink;
      R.ink = Math.min(R.inkMax, R.ink + E().campInk);
      const brush = rollBrush(rng);
      if (brush) R.brushes.push(brush);
      used.push('meditate');
      return { ok: true, ink: R.ink - before, brush };
    }
    // gems: no arg asks whether cutting may start; {leave:true} ends a session (it then counts as an action); {uid, slot, gem} cuts
    if (arg === undefined || arg === null) return { ok: true, open: true };
    if (arg.leave) { if (first) used.push('gems'); return { ok: true, left: true }; }
    const res = socket(R, arg.uid, arg.slot, arg.gem);
    if (res.ok && first) used.push('gems');
    return res;
  }
  function forgeAction(R, action, arg) {
    const node = R.node;
    if (!node || node.kind !== 'forge') return { ok: false, reason: 'node' };
    if (action !== 'upgrade' && action !== 'gems') return { ok: false, reason: 'action' };
    if (node.used === 'upgrade' || (node.used === 'gems' && action === 'upgrade')) return { ok: false, reason: 'used' };   // one upgrade OR gem cutting
    if (action === 'upgrade') {
      const uid = uidArg(arg);
      if (upgradable(R).indexOf(uid) < 0) return { ok: false, reason: 'card' };
      const inst = upgradeCard(R, uid);
      node.used = 'upgrade';
      return { ok: true, uid, id: inst.id };
    }
    if (arg === undefined || arg === null) return { ok: true, open: true };
    const res = socket(R, arg.uid, arg.slot, arg.gem);
    if (res.ok) node.used = 'gems';
    return res;
  }

  // ---------------------------------------------------------------- finishing nodes and chapters
  function finishNode(R) {
    const node = R.node;
    if (!node) return { chapterEnded: false };
    const t = node.tile ? tileAt(R, node.tile.q, node.tile.r) : null;
    const boss = (node.kind === 'reward' && node.rewards && node.rewards.boss) || (node.kind === 'combat' && node.tier === 'boss');
    const keep = node.kind === 'forge' && !node.used && forgeUsable(R);       // an unused forge can be visited again
    if (t && !keep) t.done = true;
    R.node = null;
    R.pending = [];
    if (boss) R.chapterCleared = true;
    checkStranded(R);
    return { chapterEnded: !!boss };
  }
  function chapterEnd(R) {
    const ce = E().chapterEnd;
    if (R.chapter >= L().chapters[L().chapters.length - 1]) {
      R.done = true;
      R.victory = true;
      R.chapterCleared = false;
      R.node = null;
      note(R, 'The last note rings out.');
      return { next: 'victory', healed: [], maxHp: 0, log: [], pending: [] };
    }
    const healMul = mods(R).healMul;
    const healed = R.heroes.map((h) => {
      h.maxHp += ce.maxHp;
      h.hp += ce.maxHp;
      const before = h.hp;
      h.hp = Math.min(h.maxHp, h.hp + Math.round(h.maxHp * ce.healPct * healMul));
      return { id: h.id, n: h.hp - before, hp: h.hp, maxHp: h.maxHp };
    });
    const s = startChapter(R, R.chapter + 1);
    return { next: R.chapter, healed, maxHp: ce.maxHp, log: s.log, pending: s.pending };
  }

  // ---------------------------------------------------------------- score, summary, save
  function score(R) {
    const s = E().score, st = R.stats;
    const deck = R.deck;
    const upgraded = deck.filter((c) => c.up).length;
    const filled = deck.reduce((n, c) => n + c.gems.filter(Boolean).length, 0);
    const curses = deck.filter((c) => DATA.cards[c.id] && DATA.cards[c.id].hero === 'curse').length;
    const v = s.chapter * st.bossKills + s.boss * st.bossKills + s.elite * st.elites + Math.floor(R.gold / s.goldDiv)
      + s.maxHp * R.heroes.reduce((n, h) => n + h.maxHp, 0) + s.upgraded * upgraded + s.gemSlot * filled + s.curse * curses - Math.floor(st.turns / s.turnDiv);
    return Math.max(0, v);
  }
  function summary(R) {
    return {
      score: score(R), victory: !!R.victory, done: !!R.done, chapter: R.chapter, trial: R.trial, daily: R.daily, seed: R.seed, id: R.id,
      heroes: R.heroes.map((h) => ({ id: h.id, hp: h.hp, maxHp: h.maxHp })), deckSize: R.deck.length, relics: R.relics.slice(), gold: R.gold,
      chaptersCleared: R.stats.bossKills, stats: U.deepCopy(R.stats),
    };
  }
  function serialize(R) {
    const o = U.deepCopy(Object.assign({}, R, { map: null }));
    o.map = R.map ? (typeof MAP.serialize === 'function' ? MAP.serialize(R.map) : U.deepCopy(R.map)) : null;
    o.uid = U.uidPeek();
    return o;
  }
  function deserialize(o) {
    if (!o || typeof o !== 'object' || o.v !== VERSION || !Array.isArray(o.heroes) || o.heroes.length !== 2 || !Array.isArray(o.deck)) return null;
    const R = U.deepCopy(Object.assign({}, o, { map: null }));
    if (!R.heroes.every((h) => h && DATA.heroes[h.id] && isNum(h.hp) && isNum(h.maxHp))) return null;
    let map = null;
    if (o.map) {
      map = typeof MAP.deserialize === 'function' ? MAP.deserialize(U.deepCopy(o.map)) : U.deepCopy(o.map);
      if (!map) return null;
    }
    R.map = map;
    R.deck = R.deck.filter((c) => c && DATA.cards[c.id] && isNum(c.uid)).map((c) => {
      const slots = DATA.cards[c.id].slots || [];
      return { uid: c.uid, id: c.id, up: c.up && DATA.cards[c.id].up ? 1 : 0, gems: slots.map((s, i) => (typeof (c.gems || [])[i] === 'string' && DATA.gems[c.gems[i]] ? c.gems[i] : null)) };
    });
    R.gems = (Array.isArray(R.gems) ? R.gems : []).filter((g) => typeof g === 'string' && DATA.gems[g]);   // duplicates are real: two copies of one gem
    R.relics = strs(R.relics).filter((r) => DATA.relics[r]);
    R.brushes = (Array.isArray(R.brushes) ? R.brushes : []).filter((b) => typeof b === 'string' && DATA.brushes[b]);
    const dflt = { stats: newStats(), flags: {}, seen: { events: [] }, foes: {}, log: [], pending: [], hk: {}, mods: {}, pendSeq: 0, opsN: 0, lastEnc: null, rareOffset: 0, removals: 0, chapterCleared: false, recorded: false, done: false, victory: false, node: null, frontIdx: 0 };
    Object.keys(dflt).forEach((k) => { if (R[k] === undefined) R[k] = dflt[k]; });
    R.stats = Object.assign(newStats(), R.stats);
    if (!Array.isArray(R.seen.events)) R.seen.events = [];
    const maxUid = R.deck.reduce((n, c) => Math.max(n, c.uid), 0);
    U.resetUid(Math.max(isNum(o.uid) ? o.uid : 1, maxUid + 1));
    delete R.uid;
    return R;
  }

  return {
    VERSION, newRun, dailyHeroes, startChapter, mods, paint, paintPreview, useBrush, canStep, step, combatInit, combatDone, claim, take,
    shopBuy, shopRemove, eventChoices, eventChoose, pickEvent, campAction, forgeAction, finishNode, chapterEnd, checkStranded,
    applyOps, resolvePending, hook, addRelic: gainRelic, addCard, removeCard, upgradeCard, socket, upgradable, forgeUsable, score, summary, serialize, deserialize,
  };
})();
