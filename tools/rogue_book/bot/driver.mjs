// Inkwoven balance bot: the run driver. playRun() plays ONE complete run through the real RUN / COMBAT / MAP APIs and returns a
// plain-JSON record of everything the report needs (fights, picks, deaths, economy, final deck). Deterministic for a seed.
//
//   playRun(G, { heroes:[a,b], trial:0, seed:1, unlocked:'all'|'none', style:'normal'|'rush'|'explore'|'max', combat:'ai'|'greedy', draftNoise, maxSteps })
//
// The loop is the same one the real game runs: map step (visit, brush, paint, walk) -> node (combat, reward, shop, event, camp, forge,
// chest, gem cache) -> finishNode -> chapterEnd. A global step cap and per-node stall guards make an infinite loop impossible; hitting
// either marks the run result 'stall' so the test suite and the report can see it.
import { createValuer } from './cardval.mjs';
import { createCombatAI } from './combat_ai.mjs';
import { createPolicies } from './policies.mjs';
import { isNum, asList } from './game.mjs';

const STYLE = {
  rush: { fights: [3, 3, 3], extra: 4, eliteMin: 0.9, fightMin: 0.5, brushMin: 2.5 },
  normal: { fights: [6, 6, 6], extra: 12, eliteMin: 0.62, fightMin: 0.42, brushMin: 3.0 },
  explore: { fights: [9, 9, 9], extra: 24, eliteMin: 0.55, fightMin: 0.38, brushMin: 3.5 },
  // max: paint and fight for as long as the Ink and the party's HP allow (the Ink economy probe: how far can one chapter's Ink go?)
  max: { fights: [99, 99, 99], extra: 99, eliteMin: 0.5, fightMin: 0.35, brushMin: 3.5 },
};

const cache = new WeakMap();
// Opt-in calibration probe (bot.mjs --awake-report): when on, every boss fight records the woken share of the map at that moment.
// Read-only: nothing here touches a run, an RNG stream or a record. Needs --jobs 1 (worker threads have their own copy).
export const AWAKE_REPORT = { on: false, list: [] };
function toolsFor(G, cfg) {
  const k = JSON.stringify([cfg.draftNoise, cfg.pickBias, cfg.archetype, cfg.beam, cfg.depth, cfg.potential, cfg.effort, cfg.combat === 'beam', !!cfg.clairvoyant]);
  let m = cache.get(G.DATA);
  if (!m) { m = new Map(); cache.set(G.DATA, m); }
  if (m.has(k)) return m.get(k);
  const V = createValuer(G);
  // search effort by fight: cheap for early normals, heavy for elites and bosses (override everything with cfg.beam / cfg.depth)
  const EFFORT = {
    fast: { normal: { 1: [1, 5, 40], 2: [1, 5, 40], 3: [1, 6, 50] }, elite: [1, 6, 50], boss: [1, 6, 60] },
    normal: { normal: { 1: [1, 6, 50], 2: [2, 7, 80], 3: [2, 8, 90] }, elite: [2, 8, 100], boss: [3, 9, 130] },
    deep: { normal: { 1: [3, 8, 120], 2: [3, 8, 120], 3: [3, 8, 120] }, elite: [4, 10, 180], boss: [4, 10, 180] },
  }[cfg.effort || 'normal'] || null;
  const mk = (t) => createCombatAI(G, V, { beam: cfg.beam || t[0], depth: cfg.depth || t[1], maxReplays: cfg.beam ? undefined : t[2], potential: cfg.potential, debugTurn: cfg.debugTurn, mode: cfg.combat === 'beam' ? 'beam' : 'rollout', clairvoyant: !!cfg.clairvoyant });
  const AI = { 1: mk(EFFORT.normal[1]), 2: mk(EFFORT.normal[2]), 3: mk(EFFORT.normal[3]) };
  const AIelite = mk(EFFORT.elite);
  const AIboss = mk(EFFORT.boss);
  const P = createPolicies(G, V, { draftNoise: cfg.draftNoise, archetype: cfg.archetype, pickBias: cfg.pickBias });
  const t = { V, AI, AIboss, AIelite, P };
  m.set(k, t);
  return t;
}

export function playRun(G, cfg) {
  const { U, DATA, MAP, RUN, COMBAT } = G;
  cfg = Object.assign({ trial: 0, seed: 1, unlocked: 'all', style: 'normal', combat: 'ai', maxSteps: 1500 }, cfg || {});
  const style = STYLE[cfg.style] || STYLE.normal;
  const { V, AI, AIboss, AIelite, P } = toolsFor(G, cfg);
  const unlocked = cfg.unlocked === 'none' ? { card: [], relic: [], gem: [] } : null;
  const R = RUN.newRun({ heroes: cfg.heroes, trial: cfg.trial, seed: cfg.seed, unlocked });
  const rng = U.rng(U.hash(cfg.seed, 'bot', cfg.heroes.join(','), cfg.trial));
  const rec = {
    seed: cfg.seed, pair: cfg.heroes.join(','), trial: cfg.trial, style: cfg.style, combat: cfg.combat, effort: cfg.effort || 'normal', unlocked: cfg.unlocked, draftNoise: cfg.draftNoise, pickBias: cfg.pickBias, clairvoyant: !!cfg.clairvoyant,
    result: 'cap', chapter: 1, chaptersCleared: 0, death: null, steps: 0,
    fights: [], picks: [], buys: [], events: [], relics: [], gems: [], chapters: [], camps: [], flags: {},
    forcedFights: 0, starve: 0, replays: 0, finalDeck: [], finalRelics: [], finalGold: 0,
  };
  let step = 0;
  const chap = { fights: 0, startInk: R.ink, inkPaint: 0, goldStart: R.gold, startedAtStep: 0 };
  let curChapter = { ch: 1, fights: 0, painted: 0, mercy0: 0, hpStart: 0 };
  const startChapterRec = () => {
    curChapter = { ch: R.chapter, fights: 0, inkStart: R.ink, goldStart: R.gold, mercy0: R.stats.mercy, painted0: R.stats.hexesPainted, wells0: R.stats.wellsDrunk, brush0: R.stats.brushesUsed, kills0: R.stats.kills, deckStart: R.deck.length };
  };
  startChapterRec();
  void chap;

  const deckIds = () => R.deck.map((c) => c.id + (c.up ? '+' : ''));
  const hf = () => P.hpFrac(R);

  // ------------------------------------------------------------------ combat
  function doCombat(node) {
    if (AWAKE_REPORT.on && node.tier === 'boss') AWAKE_REPORT.list.push({ ch: R.chapter, frac: MAP.progress(R.map).frac });
    const opts = RUN.combatInit(R, node);
    opts.maxTurns = 60;
    const hpBefore = R.heroes.map((h) => h.hp);
    const maxBefore = R.heroes.map((h) => h.maxHp);
    const goldBefore = R.gold;
    let C, replays = 0;
    const t0 = cfg.timing ? Date.now() : 0;
    if (cfg.combat === 'greedy') {
      const s = COMBAT.simulate(Object.assign({}, opts));
      C = s.C;
    } else {
      const ai = node.tier === 'boss' ? AIboss : node.tier === 'elite' ? AIelite : AI[R.chapter] || AI[3];
      const r = ai.fight(opts, cfg.fightTrace ? { trace: (t) => cfg.fightTrace(node, t) } : undefined);
      C = r.C; replays = r.replays;
    }
    rec.replays += replays;
    if (cfg.timing) cfg.timing.push({ tier: node.tier, ch: R.chapter, turns: C.turn, ms: Date.now() - t0, replays, actions: C.events.filter((e) => e.type === 'play').length });
    const S = C.summary();
    const fight = {
      ch: R.chapter, tier: node.tier, enc: node.enc, enemies: node.enemies.slice(), source: node.source, turns: C.turn, result: S.result,
      hp0: hpBefore.slice(), max0: maxBefore.slice(), deck: deckIds(), relics: R.relics.slice(), gemsOn: R.deck.reduce((a, c) => { c.gems.forEach((g) => { if (g) a.push(g); }); return a; }, []),
      dmgDealt: S.stats.damageDealt, dmgTaken: S.stats.damageTaken, cards: S.stats.cardsPlayed, swaps: S.stats.swaps, blockGained: S.stats.blockGained,
      heroDowns: S.stats.heroDowns, kills: S.kills.map((k) => k.def + ':' + k.by), diff: 0, gold0: goldBefore, ink0: R.ink,
    };
    // damage to heroes per enemy def (HP actually lost), from the event log
    const byEnemy = {};
    let lastHit = null;
    C.events.forEach((e) => {
      if (e.type === 'hit' && e.dst && e.dst.kind === 'hero' && e.src && e.src.kind === 'enemy') {
        const def = String(e.src.id).split('#')[0];
        byEnemy[def] = (byEnemy[def] || 0) + e.amount;
        if (e.amount > 0) lastHit = def;
      } else if (e.type === 'hurt' && e.dst && e.dst.kind === 'hero' && (e.cause === 'poison' || e.cause === 'burn')) {
        byEnemy[e.cause] = (byEnemy[e.cause] || 0) + e.amount;
      }
    });
    fight.byEnemy = byEnemy;
    fight.lastHit = lastHit;
    const plays = {};
    C.events.forEach((e) => { if (e.type === 'play' && e.card) plays[e.card.id] = (plays[e.card.id] || 0) + 1; });
    fight.plays = plays;
    const rewards = RUN.combatDone(R, C);
    fight.hp1 = R.heroes.map((h) => h.hp);
    fight.max1 = R.heroes.map((h) => h.maxHp);
    fight.hpLost = S.heroes.reduce((s, h, i) => s + Math.max(0, hpBefore[i] + (S.maxHpGain[h.id] || 0) - Math.max(0, h.hp)), 0);
    if (S.result !== 'win' || !rewards) {
      fight.result = 'lose';
      if (S.result === null) fight.timeout = true;                   // the combat hit the turn cap: a stall, not a defeat
      rec.fights.push(fight);
      curChapter.fights += 1;
      rec.result = 'lose';
      // who killed the party: the enemy that dealt the most damage in the final fight, plus the last one to land a hit
      const top = Object.keys(byEnemy).sort((a, b) => byEnemy[b] - byEnemy[a])[0] || null;
      rec.death = { ch: R.chapter, tier: node.tier, enc: node.enc, enemies: node.enemies.slice(), top, last: lastHit, turn: C.turn, source: node.source, timeout: S.result === null };
      return false;
    }
    fight.gold1 = R.gold;
    fight.rewardGold = rewards.gold;
    rec.fights.push(fight);
    curChapter.fights += 1;
    return true;
  }

  // ------------------------------------------------------------------ reward screen
  function doReward(node) {
    const rw = node.rewards;
    const choice = { card: null, relic: null, gem: null, takeBrush: !!rw.brush };
    const offered = rw.cards.slice();
    if (offered.length) {
      const boss = rw.tier === 'boss';
      const r = P.chooseCard(R, offered, rng, { forced: boss });
      choice.card = r.id;
      rec.picks.push({ ch: R.chapter, src: rw.tier, offered, picked: r.id, net: round2(r.net), thr: round2(r.thr), deck: R.deck.length });
    }
    if (rw.relics.length) {
      let best = null;
      rw.relics.forEach((id) => { const s = P.relicScore(R, id); if (!best || s > best.s) best = { id, s }; });
      if (best && best.s > -2) choice.relic = best.id;
      rec.relics.push({ ch: R.chapter, src: rw.tier, offered: rw.relics.slice(), picked: choice.relic, scores: rw.relics.map((id) => round1(P.relicScore(R, id))) });
    }
    if (rw.gems.length) {
      const b = P.bestGemOf(R, rw.gems);
      if (b) choice.gem = b.id;
    }
    const res = RUN.claim(R, rw, choice);
    if (!res.ok) { RUN.claim(R, rw, { takeBrush: !!rw.brush }); }
    if (choice.relic) rec.relics[rec.relics.length - 1].taken = true;
    if (choice.gem) rec.gems.push({ ch: R.chapter, id: choice.gem, src: 'reward' });
    P.resolvePendingChoices(R, rng);
    P.socketAll(R, false);
    return finish();
  }

  function finish() {
    P.resolvePendingChoices(R, rng);
    const r = RUN.finishNode(R);
    if (r.chapterEnded) endChapter();
    return true;
  }
  function endChapter() {
    rec.chapters.push(Object.assign({}, curChapter, { ink1: R.ink, gold1: R.gold, mercy: R.stats.mercy - curChapter.mercy0, painted: R.stats.hexesPainted - curChapter.painted0, wells: R.stats.wellsDrunk - curChapter.wells0, brushesUsed: R.stats.brushesUsed - curChapter.brush0, deckEnd: R.deck.length, hp: R.heroes.map((h) => h.hp + '/' + h.maxHp) }));
    rec.chaptersCleared = R.stats.bossKills;
    const ce = RUN.chapterEnd(R);
    if (ce.pending && ce.pending.length) P.resolvePendingChoices(R, rng);
    if (!R.done) { rec.chapter = R.chapter; startChapterRec(); }
  }

  // ------------------------------------------------------------------ other nodes
  function doShop(node) {
    const before = R.gold;
    const log = P.shopVisit(R, node, cfg.shopRatio);
    log.forEach((b) => rec.buys.push(Object.assign({ ch: R.chapter }, b)));
    const left = P.shopLeft(R, node);
    rec.camps.push({ ch: R.chapter, kind: 'shop', spent: before - R.gold, gold: before, goldAfter: R.gold, buys: log.length, left: left.filter((x) => x.price <= R.gold).map((x) => x.kind + ':' + x.id + '@' + x.price + ':' + x.ratio), unaffordable: left.filter((x) => x.price > R.gold).length });
    return finish();
  }
  function doEvent(node) {
    const evId = node.event;
    const pick = P.chooseEventOption(R, evId);
    if (!pick) return finish();
    const res = RUN.eventChoose(R, evId, pick.index);
    rec.events.push({ ch: R.chapter, id: evId, choice: pick.index, v: round1(pick.v), ok: !!res.ok, fight: !!res.fight });
    if (!res.ok) return finish();
    if (res.fight) return true;                                       // R.node is now the combat node
    return finish();
  }
  function doCamp(node, state) {
    const maxActs = Math.min(3, RUN.mods(R).campActions + (R.flags.extraCampActions | 0));
    const used = [];
    for (let k = 0; k < maxActs; k++) {
      const u = P.campUtilities(R, node, state);
      const opts = ['rest', 'sharpen', 'gems', 'meditate'].filter((a) => node.used.indexOf(a) < 0 || a === 'gems').map((a) => ({ a, v: u[a] })).sort((x, y) => y.v - x.v);
      const top = opts[0];
      if (!top || top.v < 3) break;
      let res;
      if (top.a === 'rest') res = RUN.campAction(R, 'rest');
      else if (top.a === 'sharpen') { const b = P.bestUpgrade(R); res = b ? RUN.campAction(R, 'sharpen', b.uid) : { ok: false }; }
      else if (top.a === 'meditate') res = RUN.campAction(R, 'meditate');
      else if (top.a === 'gems') {
        res = RUN.campAction(R, 'gems');
        if (res.ok) {
          const n = cutViaCamp();
          if (!n) RUN.campAction(R, 'gems', { leave: true });
        }
      }
      if (res && res.ok) used.push(top.a);
      else if (!res || !res.ok) { u[top.a] = 0; if (top.a === 'gems') break; }
      if (R.pending.length) P.resolvePendingChoices(R, rng);
    }
    rec.camps.push({ ch: R.chapter, kind: 'camp', used, hp: R.heroes.map((h) => h.hp + '/' + h.maxHp) });
    return finish();
  }
  // cut gems through the camp API (the camp counts the first successful cut as its action)
  function cutViaCamp() {
    let n = 0;
    for (let guard = 0; guard < 12; guard++) {
      const prof = P.profileOf(R);
      let best = null;
      const seen = new Set();
      R.gems.forEach((g) => { if (seen.has(g)) return; seen.add(g); const s = P.bestSocket(R, g, prof, 0.6); if (s && (!best || s.gain > best.gain)) best = s; });
      if (!best) break;
      const res = RUN.campAction(R, 'gems', { uid: best.uid, slot: best.slot, gem: best.gem });
      if (!res.ok) break;
      rec.gems.push({ ch: R.chapter, id: best.gem, src: 'camp', card: best.id });
      n += 1;
    }
    return n;
  }
  function doForge(node) {
    const up = P.bestUpgrade(R);
    const gains = P.socketGain(R) * 6;
    const upV = up ? Math.max(0, up.gain) * 6 + 2 : 0;
    if (upV >= gains && up && upV > 3) RUN.forgeAction(R, 'upgrade', up.uid);
    else if (gains > 3) {
      const o = RUN.forgeAction(R, 'gems');
      if (o.ok) {
        for (let guard = 0; guard < 12; guard++) {
          const prof = P.profileOf(R);
          let best = null;
          const seen = new Set();
          R.gems.forEach((g) => { if (seen.has(g)) return; seen.add(g); const s = P.bestSocket(R, g, prof, 0.6); if (s && (!best || s.gain > best.gain)) best = s; });
          if (!best) break;
          const res = RUN.forgeAction(R, 'gems', { uid: best.uid, slot: best.slot, gem: best.gem });
          if (!res.ok) break;
          rec.gems.push({ ch: R.chapter, id: best.gem, src: 'forge', card: best.id });
        }
      }
    }
    rec.camps.push({ ch: R.chapter, kind: 'forge', used: R.node && R.node.used });
    return finish();
  }
  function doChest(node) {
    const loot = node.loot;
    const choice = { relic: false, gem: null };
    if (loot.relic) choice.relic = P.relicScore(R, loot.relic) > -2;
    else if (loot.gems.length) { const b = P.bestGemOf(R, loot.gems); if (b) choice.gem = b.id; }
    const res = RUN.take(R, node, choice);
    if (res.ok && choice.relic) rec.relics.push({ ch: R.chapter, src: 'chest', offered: [loot.relic], picked: loot.relic, taken: true });
    if (res.ok && choice.gem) rec.gems.push({ ch: R.chapter, id: choice.gem, src: 'chest' });
    return finish();
  }
  function doGemcache(node) {
    const b = P.bestGemOf(R, node.offers);
    RUN.take(R, node, { gem: b ? b.id : node.offers[0] });
    if (b) rec.gems.push({ ch: R.chapter, id: b.id, src: 'cache' });
    P.socketAll(R, false);
    return finish();
  }

  // ------------------------------------------------------------------ map: analysis helpers
  const key = MAP.key;
  function nbrs(M, t) { return MAP.neighbors(M, t.q, t.r).map((c) => M.tiles[key(c[0], c[1])]).filter((x) => x && x.type !== 'block'); }
  // 0-1 BFS from the painted ground the party can WALK on (islands painted by a Blot brush or an event are not connected to the party).
  // cost(entering a tile) = 0 if painted (or in extra) else 1. Returns Map key -> dist
  function distFromPainted(M, extra, parents, reachIn) {
    const dist = new Map();
    const reach = reachIn || MAP.reachable(M);
    const dq = [];
    reach.forEach((k) => { const t = M.tiles[k]; if (t && t.type !== 'block') { dist.set(k, 0); dq.push(t); } });
    let cur = dq, next = [], d = 0;
    while (cur.length) {
      for (let i = 0; i < cur.length; i++) {
        const t = cur[i];
        const k = key(t.q, t.r);
        if (dist.get(k) !== d) continue;
        for (const n of nbrs(M, t)) {
          const nk = key(n.q, n.r);
          const c = n.painted || (extra && extra.has(nk)) ? 0 : 1;
          const nd = d + c;
          if (!dist.has(nk) || dist.get(nk) > nd) { dist.set(nk, nd); if (parents) parents.set(nk, k); (c === 0 ? cur : next).push(n); }
        }
      }
      cur = next; next = []; d += 1;
    }
    return dist;
  }
  // f[x] = cost of the path from x (excluded) to the boss (included), unpainted tiles cost 1
  function distToBoss(M) {
    const b = M.tiles[key(M.boss.q, M.boss.r)];
    const f = new Map();
    f.set(key(b.q, b.r), 0);
    let cur = [b], next = [], d = 0;
    while (cur.length) {
      for (let i = 0; i < cur.length; i++) {
        const x = cur[i];
        const xk = key(x.q, x.r);
        if (f.get(xk) !== d) continue;
        const cx = x.painted ? 0 : 1;
        for (const y of nbrs(M, x)) {
          const yk = key(y.q, y.r);
          const nd = d + cx;
          if (!f.has(yk) || f.get(yk) > nd) { f.set(yk, nd); (cx === 0 ? cur : next).push(y); }
        }
      }
      cur = next; next = []; d += 1;
    }
    return f;
  }
  const bossCost = (M, extra, reach) => { const d = distFromPainted(M, extra, null, reach); const v = d.get(key(M.boss.q, M.boss.r)); return v === undefined ? 99 : v; };

  // ------------------------------------------------------------------ map: brushes
  function tryBrush(inkShort) {
    if (!R.brushes.length) return false;
    const M = R.map;
    const reach = MAP.reachable(M);
    const dP = distFromPainted(M, null, null, reach);
    const f = distToBoss(M);
    const bossKey = key(M.boss.q, M.boss.r);
    const base = dP.get(bossKey) === undefined ? 99 : dP.get(bossKey);
    // tiles on some cheapest chain to the boss: a brush that covers them saves Ink one for one
    const onPath = new Set();
    dP.forEach((d, k) => { const x = f.get(k); if (x !== undefined && !M.tiles[k].painted && d + x === base) onPath.add(k); });
    const cands = [];
    const ids = Array.from(new Set(R.brushes));
    for (const id of ids) {
      const anchors = MAP.brushAnchors(M, id) || [];
      for (const a of anchors) {
        for (const dir of a.dirs) {
          const cells = MAP.brushCells(M, id, a.q, a.r, dir);
          if (!cells.length) continue;
          let on = 0;
          cells.forEach((c) => { if (onPath.has(key(c[0], c[1]))) on += 1; });
          cands.push({ id, q: a.q, r: a.r, dir, cells, s0: on + 0.45 * cells.length });
        }
      }
    }
    if (!cands.length) return false;
    cands.sort((x, y) => y.s0 - x.s0);
    let best = null;
    cands.slice(0, 6).forEach((c) => {
      const extra = new Set(c.cells.map((x) => key(x[0], x[1])));
      const gain = base - bossCost(M, extra, reach);
      const score = gain + 0.45 * c.cells.length;
      if (!best || score > best.score) best = { id: c.id, q: c.q, r: c.r, dir: c.dir, score, gain, n: c.cells.length };
    });
    if (!best || best.score < (inkShort ? 1.2 : style.brushMin)) return false;
    const res = RUN.useBrush(R, best.id, best.q, best.r, best.dir);
    if (res.ok && res.pending && res.pending.length) P.resolvePendingChoices(R, rng);
    return !!res.ok;
  }

  // ------------------------------------------------------------------ map: walking and visiting
  function walkTo(t, allowTrouble) {
    const M = R.map;
    let guard = 0;
    while (!R.node && !R.done && (M.pos.q !== t.q || M.pos.r !== t.r) && guard++ < 80) {
      // own BFS that refuses to cross unresolved content other than the target, falling back to MAP.walkPath
      const path = pathAvoiding(M, t, allowTrouble);
      if (!path || !path.length) return false;
      let moved = false;
      for (const c of path) {
        const res = RUN.step(R, c[0], c[1]);
        if (cfg.trace) cfg.trace.push(`    step ${c[0]},${c[1]} -> ${res ? res.kind || 'x' : 'null'} pos ${M.pos.q},${M.pos.r}`);
        moved = true;
        if (R.node || R.done) break;
        if (res && res.kind && res.kind !== 'well' && res.kind !== 'brush') break;
      }
      if (!moved) return false;
    }
    return true;
  }
  function pathAvoiding(M, t, allowTrouble) {
    const sk = key(M.pos.q, M.pos.r), tk = key(t.q, t.r);
    const prev = new Map([[sk, null]]);
    const q = [sk];
    const trouble = (x) => !x.done && x.type !== 'empty' && x.type !== 'start' && x.type !== 'well' && x.type !== 'brush';
    for (let i = 0; i < q.length; i++) {
      const k = q[i];
      if (k === tk) break;
      const cur = M.tiles[k];
      for (const n of nbrs(M, cur)) {
        const nk = key(n.q, n.r);
        if (prev.has(nk) || !n.painted) continue;
        if (nk !== tk && trouble(n) && !allowTrouble) continue;
        prev.set(nk, k);
        q.push(nk);
      }
    }
    if (!prev.has(tk)) {
      if (!allowTrouble) return pathAvoiding(M, t, true);
      return null;
    }
    const out = [];
    for (let k = tk; k !== sk; k = prev.get(k)) { const tt = M.tiles[k]; out.push([tt.q, tt.r]); }
    return out.reverse();
  }

  function reachableUnresolved(M) {
    return MAP.unresolved(M).filter((t) => t.type !== 'boss');
  }
  function tileWant(t, ctxm) {
    const h = hf();
    switch (t.type) {
      case 'well': return R.ink <= R.inkMax - 2 ? 9.5 : (ctxm.forced ? 3 : 0);
      case 'brush': return 8;
      case 'chest': return 8;
      case 'gemcache': return 7.5;
      case 'forge': return RUN.forgeUsable(R) ? 7 : 0;
      case 'camp': {
        if (ctxm.only === 'camp') return 9;
        const missing = h.missing / R.heroes.reduce((s, x) => s + x.maxHp, 0);
        if (missing >= 0.22 || h.min < 0.45) return 9 + missing * 10;
        if (ctxm.bossNear && missing >= 0.1) return 8;
        if (ctxm.bossNear && P.bestUpgrade(R)) return 6;
        if (ctxm.forced) return 2;
        return 0;
      }
      case 'shop': {
        const junk = R.deck.some((c) => P.isJunk(c.id));
        if (R.gold >= 55 || (junk && R.gold >= 75) || (R.gems.length && P.socketGain(R) > 1)) return 6 + Math.min(4, R.gold / 100);
        return ctxm.forced ? 0.5 : 0;
      }
      case 'event': return h.avg > 0.28 || ctxm.forced ? 5.5 : 0;
      case 'enemy': return ((h.avg >= style.fightMin && h.min >= 0.22 && curChapter.fights < fightTarget() + 1) || ctxm.forced) ? 4 : 0;
      case 'elite': return ((h.avg >= style.eliteMin && h.min >= 0.4 && curChapter.fights < fightTarget() + 2) || ctxm.forced) ? 5.2 : 0;
      default: return 0;
    }
  }
  const fightTarget = () => style.fights[Math.min(2, R.chapter - 1)];
  const visits = new Map();
  function visitStep(ctxm) {
    const M = R.map;
    const list = reachableUnresolved(M);
    let best = null;
    // distance for tie-breaks
    list.forEach((t) => {
      if (ctxm.only && t.type !== ctxm.only) return;
      if ((visits.get(R.chapter + ':' + key(t.q, t.r)) || 0) >= 3) return;                 // a tile that did not resolve three times is left alone
      const w = tileWant(t, ctxm);
      if (w <= 0) return;
      const d = MAP.dist(M.pos.q, M.pos.r, t.q, t.r);
      const s = w - 0.12 * d;
      if (!best || s > best.s) best = { t, s };
    });
    if (!best) return false;
    const before = R.stats.kills;
    void before;
    if (cfg.trace) cfg.trace.push(`  visit ${best.t.type} at ${best.t.q},${best.t.r}`);
    const vk = R.chapter + ':' + key(best.t.q, best.t.r);
    // a visit that got somewhere (arrived, was cut short by a node on the way, or came closer) is progress and costs nothing; only a walk that
    // goes nowhere counts against the three-strikes rule (a tile that does not resolve is then left alone)
    const d0 = MAP.dist(M.pos.q, M.pos.r, best.t.q, best.t.r);
    const nodes0 = R.stats.eventsSeen + R.stats.shopsVisited + R.stats.kills + R.stats.chestsOpened + R.stats.wellsDrunk + R.stats.brushesUsed;
    walkTo(best.t, false);
    const nodes1 = R.stats.eventsSeen + R.stats.shopsVisited + R.stats.kills + R.stats.chestsOpened + R.stats.wellsDrunk + R.stats.brushesUsed;
    const progressed = R.node || R.done || nodes1 !== nodes0 || MAP.dist(M.pos.q, M.pos.r, best.t.q, best.t.r) < d0;
    visits.set(vk, (visits.get(vk) || 0) + (progressed ? 0.15 : 1));
    return true;
  }

  // Paint the cheapest chain from the WALKABLE painted ground to a tile, one hex at a time (so the chain always connects to the party,
  // which RUN.paint's own chain does not guarantee when an island of painted hexes exists). Paints at most maxHexes hexes.
  function paintTo(M, target, maxHexes) {
    const parents = new Map();
    const dist = distFromPainted(M, null, parents);
    const tk = key(target.q, target.r);
    if (!dist.has(tk)) return { ok: false, cost: 0 };
    const chain = [];
    for (let k = tk; parents.has(k); k = parents.get(k)) { const t = M.tiles[k]; if (!t.painted) chain.push(t); }
    chain.reverse();
    let cost = 0;
    for (const t of chain) {
      if (cost >= maxHexes || R.ink < 1) break;
      const res = RUN.paint(R, t.q, t.r);
      if (!res.ok) break;
      cost += res.cost;
      if (res.pending && res.pending.length) P.resolvePendingChoices(R, rng);
      if (R.done) break;
    }
    curChapter.inkPaint = (curChapter.inkPaint || 0) + cost;
    return { ok: cost > 0, cost };
  }

  // ------------------------------------------------------------------ map: explore or go for the boss
  function mapStep() {
    const M = R.map;
    const h = hf();
    const bossKey = key(M.boss.q, M.boss.r);
    const bossTile = M.tiles[bossKey];
    const an = distFromPainted(M);
    const dBoss = an.get(bossKey) === undefined ? 99 : an.get(bossKey);
    const bossReach = dBoss === 0;
    const ctxm = { bossNear: dBoss <= 3, forced: false };
    if (cfg.trace) cfg.trace.push(`ch${R.chapter} ink${R.ink} dBoss${dBoss} hp${h.avg.toFixed(2)} fights${curChapter.fights} pos${M.pos.q},${M.pos.r} brushes${R.brushes.join('+')}`);

    // 1. things already painted and worth the walk
    if (visitStep(ctxm)) return true;

    if (curChapter.base === undefined) curChapter.base = dBoss;
    const reserve = bossReach ? 0 : 1;
    const budgetHexes = curChapter.base + style.extra - (R.stats.hexesPainted - curChapter.painted0);     // hexes the style allows us to paint this chapter
    const surplus = Math.min(R.ink - dBoss - reserve, budgetHexes - dBoss);
    const wantMore = curChapter.fights < style.fights[Math.min(2, R.chapter - 1)];
    const inkShort = R.ink < dBoss && R.brushes.length === 0;

    // 2. a brush that saves Ink or reveals plenty
    if (!bossReach && tryBrush(R.ink < dBoss)) return true;

    // 3. boss already painted and the party is hurt: camp first
    if (bossReach && h.avg < 0.62 && reachableUnresolved(M).some((t) => t.type === 'camp')) {
      if (visitStep({ bossNear: true, forced: false, only: 'camp' })) return true;
    }

    // 4. explore while Ink allows and more fights are wanted (or HP needs a camp)
    const f = distToBoss(M);
    if (surplus >= 1 || (h.avg < 0.6 && surplus >= 0)) {
      let best = null;
      const goldNow = R.gold;
      Object.values(M.tiles).forEach((t) => {
        if (t.painted || t.type === 'block') return;
        const tk = key(t.q, t.r);
        const dp = an.get(tk);
        if (dp === undefined) return;
        let val = 0;
        if (t.type === 'camp') val = 3 + 14 * (1 - h.avg) + (P.bestUpgrade(R) ? 2.5 : 0);
        else if (t.type === 'shop') val = goldNow >= 90 ? 5 + Math.min(5, goldNow / 60) : 1.2;
        else if (t.type === 'forge') val = 6.5;
        else if (t.type === 'chest') val = 7.5;
        else if (t.type === 'elite') val = h.avg >= style.eliteMin && curChapter.fights < fightTarget() + 1 ? (wantMore ? 8.5 : 5) : 0;
        if (val <= 0) return;
        const fx = f.get(tk);
        if (fx === undefined) return;
        const detour = dp + fx - dBoss;
        if (detour > surplus + (h.avg < 0.6 && t.type === 'camp' ? 1 : 0)) return;
        if (R.ink < dp) return;
        const score = val / (dp + 0.6 * Math.max(0, detour) + 0.4);
        if (!best || score > best.score) best = { t, score, dp, detour };
      });
      if (best) {
        if (cfg.trace) cfg.trace.push(`  explore landmark ${best.t.type} dp${best.dp} detour${best.detour}`);
        const res = paintTo(M, best.t, best.dp);
        if (res.ok) return true;
      }
      if (wantMore && surplus >= 1) {
        // generic exploration: a hidden hex touching the painted area, near the cheapest route (wells and fights crowd it)
        const spine = MAP.spine(M) || [];
        const cands = [];
        Object.values(M.tiles).forEach((t) => {
          if (t.painted || t.type === 'block') return;
          const tk = key(t.q, t.r);
          if (an.get(tk) !== 1) return;
          const fx = f.get(tk);
          if (fx === undefined) return;
          const detour = bossReach ? 0 : 1 + fx - dBoss;
          if (detour > Math.min(2, surplus)) return;
          let ds = 99;
          spine.forEach((c) => { const d = MAP.dist(t.q, t.r, c[0], c[1]); if (d < ds) ds = d; });
          cands.push({ t, detour, fx, ds });
        });
        if (cands.length) {
          cands.sort((a, b) => a.detour - b.detour || a.ds - b.ds || a.fx - b.fx);
          const topD = cands[0].detour, topS = cands[0].ds;
          const pool = cands.filter((c) => c.detour === topD && c.ds <= topS + 1);
          const pick = pool[Math.floor(rng() * pool.length)];
          if (cfg.trace) cfg.trace.push(`  explore generic ${pick.t.q},${pick.t.r} detour${pick.detour} ds${pick.ds}`);
          const res = paintTo(M, pick.t, 1);
          if (res.ok) return true;
        }
      }
    }

    // 3b. boss painted and connected: go
    if (bossReach) {
      if (walkTo(bossTile, true)) return true;
      return false;
    }

    // 5. head for the boss: paint the cheapest chain (as far as the Ink goes)
    if (cfg.trace) cfg.trace.push('  head for boss');
    if (R.ink >= 1) {
      const res = paintTo(M, bossTile, R.ink);
      if (res.ok) return true;
    }
    // 6. out of Ink: take whatever is reachable (forced), else the mercy rule has already fired or will on the next check
    ctxm.forced = true;
    if (visitStep(ctxm)) { rec.forcedFights += 1; rec.starve += 1; return true; }
    if (RUN.checkStranded(R)) { rec.starve += 1; return true; }
    void inkShort;
    return false;
  }

  // ------------------------------------------------------------------ the loop
  while (!R.done && step < cfg.maxSteps) {
    step += 1;
    const sig = R.node ? R.node.kind : 'map';
    if (R.pending.length && !R.node) P.resolvePendingChoices(R, rng);
    if (R.node) {
      const node = R.node;
      let ok = true;
      if (node.kind === 'combat') ok = doCombat(node);
      else if (node.kind === 'reward') ok = doReward(node);
      else if (node.kind === 'shop') ok = doShop(node);
      else if (node.kind === 'event') ok = doEvent(node);
      else if (node.kind === 'camp') ok = doCamp(node, { preBoss: nearBoss(), inkShort: R.ink < 6 });
      else if (node.kind === 'forge') ok = doForge(node);
      else if (node.kind === 'chest') ok = doChest(node);
      else if (node.kind === 'gemcache') ok = doGemcache(node);
      else ok = finish();
      if (!ok) break;
      continue;
    }
    if (R.chapterCleared) { endChapter(); continue; }
    const moved = mapStep();
    if (cfg.debugIslands) { const M = R.map; const painted = Object.values(M.tiles).filter((t) => t.painted && t.type !== 'block').length; const reach = MAP.reachable(M).size; if (painted > reach) cfg.debugIslands.push({ ch: R.chapter, painted, reach, step }); }
    if (!moved) {
      rec.stall = (rec.stall || 0) + 1;
      if (rec.stall > 6) { rec.result = 'stall'; if (cfg.debugStall) cfg.debugStall(R); break; }
    }
    void sig;
  }
  rec.steps = step;
  function nearBoss() {
    const M = R.map;
    const bt = M.tiles[key(M.boss.q, M.boss.r)];
    if (bt.painted) return true;
    const d = distFromPainted(M).get(key(M.boss.q, M.boss.r));
    return d !== undefined && d <= 3;
  }

  if (R.done && R.victory) { rec.result = 'win'; rec.chaptersCleared = 3; }
  else if (R.done && rec.result !== 'lose') rec.result = 'lose';
  if (step >= cfg.maxSteps && !R.done) rec.result = 'cap';
  rec.chapter = R.chapter;
  rec.finalDeck = deckIds();
  rec.finalRelics = R.relics.slice();
  rec.finalGold = R.gold;
  rec.finalHeroes = R.heroes.map((h) => ({ id: h.id, hp: h.hp, maxHp: h.maxHp }));
  rec.stats = {
    turns: R.stats.turns, kills: R.stats.kills, elites: R.stats.elites, goldEarned: R.stats.goldEarned, goldSpent: R.stats.goldSpent, purchases: R.stats.purchases,
    hexesPainted: R.stats.hexesPainted, brushesUsed: R.stats.brushesUsed, wellsDrunk: R.stats.wellsDrunk, chestsOpened: R.stats.chestsOpened, shopsVisited: R.stats.shopsVisited,
    campRests: R.stats.campRests, upgrades: R.stats.upgrades, gemsSocketed: R.stats.gemsSocketed, relicsFound: R.stats.relicsFound, eventsSeen: R.stats.eventsSeen,
    mercy: R.stats.mercy, heroDowns: R.stats.heroDowns, damageDealt: R.stats.damageDealt, damageTaken: R.stats.damageTaken, cardsPlayed: R.stats.cardsPlayed,
  };
  rec.score = RUN.score(R);
  rec.deckSize = R.deck.length;
  rec.upgraded = R.deck.filter((c) => c.up).length;
  rec.gemsFilled = R.deck.reduce((n, c) => n + c.gems.filter(Boolean).length, 0);
  rec.curses = R.deck.filter((c) => P.isJunk(c.id)).length;
  rec.finalGems = R.deck.reduce((a, c) => { c.gems.forEach((g) => { if (g) a.push(g); }); return a; }, []);
  rec.unusedGems = R.gems.slice();
  return rec;
}

const round1 = (x) => Math.round(x * 10) / 10;
const round2 = (x) => Math.round(x * 100) / 100;
void isNum; void asList;
