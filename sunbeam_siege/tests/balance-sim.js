// SUNBEAM SIEGE balance simulator.  node tests/balance-sim.js [--seeds N] [--ranks 0,3] [--workers N] [--json out.json] [--quick]
// Plays whole runs (map walk, drafts, shops, posts, nooks, events, bosses) with a heuristic bot over every
// champion x side clan x seed x mischief rank, then prints win rates and diagnostics.
// Loads data and engine in a vm sandbox like tests/run-tests.js (ops-*.js included). Reads src/, never edits it.
// No em or en dashes anywhere.
const fs = require('fs'), vm = require('vm'), path = require('path'), cp = require('child_process');
const root = process.env.NL_ROOT || path.join(__dirname, '..');
const args = process.argv.slice(2);
function opt(name, dflt) { const i = args.indexOf('--' + name); return i >= 0 && args[i + 1] !== undefined && !args[i + 1].startsWith('--') ? args[i + 1] : (i >= 0 ? true : dflt); }
const SEEDS = parseInt(opt('seeds', opt('quick', false) ? 3 : 12), 10);
const RANKS = String(opt('ranks', '0,3')).split(',').map(Number);
const WORKERS = parseInt(opt('workers', 2), 10);
const JSON_OUT = opt('json', null);
const ONLY_CHAMP = opt('champ', null);
const QUIET = !!opt('quiet', false);
if (opt('tweak', null) && opt('tweak', null) !== true) process.env.BS_TWEAK = path.resolve(opt('tweak', null));
if (opt('params', null) && opt('params', null) !== true) process.env.BS_PARAMS = opt('params', null);

const CLANS = ['alley', 'hearth', 'moon', 'mischief'];

function makeSB() {
  const store = {};
  const ctx = { console, Math, Date, JSON };
  ctx.window = ctx;
  ctx.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  vm.createContext(ctx);
  const load = f => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: path.basename(f) });
  const dataDir = path.join(root, 'src/data');
  fs.readdirSync(dataDir).filter(f => f.endsWith('.js')).sort().forEach(f => load(path.join(dataDir, f)));
  // optional experiment hook: --tweak file.js runs after the data files and before the engine (data patches only)
  if (process.env.BS_TWEAK) { ctx.__PARAMS = process.env.BS_PARAMS || '{}'; vm.runInContext(fs.readFileSync(process.env.BS_TWEAK, 'utf8'), ctx, { filename: 'tweak.js' }); }
  ['util', 'content', 'registry', 'card-inst', 'battle', 'battle-ai', 'run', 'rewards', 'map', 'profile', 'shop', 'post', 'nook', 'events-engine'].forEach(n => {
    const f = path.join(root, 'src/engine', n + '.js');
    if (fs.existsSync(f)) load(f);
  });
  fs.readdirSync(path.join(root, 'src/engine')).filter(f => /^ops-.*\.js$/.test(f)).sort().forEach(f => load(path.join(root, 'src/engine', f)));
  ctx.SB.util.quiet = true;
  return ctx.SB;
}

// small deterministic rng for the bot's own choices (never used inside battles)
function mk(seed) { let a = seed >>> 0; const f = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; f.int = (lo, hi) => lo + Math.floor(f() * (hi - lo + 1)); f.pick = a => a[Math.floor(f() * a.length)]; return f; }
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/* ======================================================================== the bot */
function makeBot(SB, run, rnd) {
  const R = SB.run, U = SB.run.U, CC = SB.content;
  const isCatDef = d => d && (d.type === 'unit' || d.type === 'champion');

  /* ---------------- battle ---------------- */
  function pestThreat(B, p) {
    const it = (B.state.intents || []).find(i => i.pestUid === p.uid);
    return (it && it.dmg) || 1;
  }
  function floorScore(B, f) {
    const fl = B.state.floors[f];
    const pests = fl.pests.length;
    const hp = fl.pests.reduce((s, p) => s + p.hp, 0);
    const cats = fl.cats.length;
    return (pests ? 4 + hp * 0.25 : 0) + (cats === 0 && pests ? 6 : 0) - cats * 2.5 + (cats === 0 && f === 2 ? 1.5 : 0) + (f === 0 ? 0.3 : 0);
  }
  function chooseTarget(B, h, chk) {
    const T = chk.targets || [];
    if (chk.needsTarget === 'floor') {
      const sorted = T.slice().sort((a, b) => floorScore(B, b.floor) - floorScore(B, a.floor) || a.floor - b.floor);
      const isUnit = h.card.type === 'unit' || h.card.type === 'champion';
      // attack-ish spells prefer floors with pests, units prefer the neediest floor
      return { floor: sorted[0].floor };
    }
    if (chk.needsTarget === 'pest') {
      const all = B.pests ? B.pests() : [];
      const best = T.slice().sort((a, b) => {
        const pa = all.find(p => p.uid === a.pestUid), pb = all.find(p => p.uid === b.pestUid);
        if (!pa || !pb) return 0;
        const sa = pestThreat(B, pa) * 3 - pa.hp * 0.2 + (pa.floor === 0 ? 1 : 0);
        const sb = pestThreat(B, pb) * 3 - pb.hp * 0.2 + (pb.floor === 0 ? 1 : 0);
        return sb - sa;
      })[0];
      return { pestUid: best.pestUid };
    }
    if (chk.needsTarget === 'cat') {
      const cats = [].concat.apply([], B.state.floors.map(f => f.cats));
      const text = (h.card.text || '').toLowerCase();
      if (/\bnaps?\b/.test(text)) {
        // only nap cats that are hurt, or idle on a floor with no pests (Rested is stored for a Stretch later)
        const okc = T.map(t => cats.find(c => c.uid === t.catUid)).filter(c => c && !c.napping && (c.maxHealth - c.health >= 3 || (!B.state.floors[c.floor].pests.length && B.state.floors.some(f => f.pests.length === 0) && c.floor !== 0)));
        if (!okc.length) return null;
        okc.sort((a, b) => (b.maxHealth - b.health) - (a.maxHealth - a.health));
        return { catUid: okc[0].uid };
      }
      const heal = /heal|fluff|life|rested|nap/.test(text);
      const pick = T.slice().sort((a, b) => {
        const ca = cats.find(c => c.uid === a.catUid), cb = cats.find(c => c.uid === b.catUid);
        if (!ca || !cb) return 0;
        return heal ? (ca.health / ca.maxHealth) - (cb.health / cb.maxHealth) : (cb.power - ca.power);
      })[0];
      return { catUid: pick.catUid };
    }
    return {};
  }
  function cardScore(B, h) {
    const c = h.card, isUnit = c.type === 'unit' || c.type === 'champion';
    let s = 0;
    if (isUnit) {
      const catsOut = B.state.floors.reduce((n, f) => n + f.cats.length, 0);
      s += catsOut < 3 ? 40 : catsOut < 6 ? 20 : 8;
      s += (c.power || 0) * 0.5 + (c.health || 0) * 0.15;
      if (c.type === 'champion') s += 30;
    } else if (c.type === 'spell') s += 15;
    else s += 12;   // toys, rooms
    s -= c.cost * 0.8;
    return s;
  }
  function loopFlags(B, flags) {
    const S = B.state;
    S.floors.forEach(f => {
      if (f.cats.some(c => (c.statuses.claws || 0) >= 5 || (c.statuses.frenzy || 0) >= 2)) flags.alley = true;
      if ((f.statuses.purr || 0) >= 10) flags.hearth = true;
      if (f.cats.length >= 4) flags.pile = (flags.pile || 0) + 1;
      if (f.cats.filter(c => c.boxed).length >= 2) flags.mischief = true;
    });
    if ((S.bank || 0) >= 3) flags.moon = true;
    if (S.nip && S.nip.surge) flags.mischief = true;
  }
  // champion / cat activated abilities. Free ones first (they can pay for the turn), paid ones with leftover Zoomies.
  function useAbilities(B, freePass) {
    let used = 0;
    const cats = [].concat.apply([], B.state.floors.map(f => f.cats));
    // Life-for-Zoomies style abilities only when a card in hand is just out of reach
    const stuck = B.state.hand.some(h => h.card.cost > B.state.zoomies && h.card.cost <= B.state.zoomies + 1);
    cats.forEach(c => {
      (c.activated || []).forEach((a, idx) => {
        const free = !!a.free || !a.cost;
        if (free !== freePass) return;
        for (let rep = 0; rep < 3; rep++) {
          let target;
          if (a.targeting === 'cat') {
            // lives are run-long currency: keep a reserve (champion 5+, others 3+), at most 3 per fight, only when it unlocks a play
            B.__od = B.__od || 0;
            const cand = cats.filter(t => t.lives >= (t.maxLives >= 9 ? 5 : 3)).sort((x, y) => y.lives - x.lives);
            if (!cand.length || !stuck || B.__od >= 3) return;
            target = { catUid: cand[0].uid };
          } else if (a.targeting === 'floor') {
            const fl = B.state.floors.map((f, i) => ({ i, n: f.pests.length })).sort((x, y) => y.n - x.n)[0];
            if (!fl || !fl.n) return;
            target = { floor: fl.i };
          }
          let r;
          try { r = B.useAbility(c.uid, idx, target); } catch (e) { r = { ok: false }; }
          if (!r || !r.ok) return;
          if (a.targeting === 'cat') B.__od++;
          used++;
        }
      });
    });
    return used;
  }
  function botTurn(B, fx) {
    let guard = 0;
    (B.state.attached || []).slice().forEach(a => { if (a.host) B.scratchOff(a.host); });
    // wake cats that have banked enough Rested (or healed up) and have something to hit
    B.state.floors.forEach(fl => fl.cats.slice().forEach(c => {
      if (!c.napping) return;
      const rested = (c.statuses && c.statuses.rested) || 0;
      const anyPest = B.state.floors.some(f => f.pests.length);
      if (anyPest && (rested >= 2 || c.health >= c.maxHealth)) { try { B.toggleNap(c.uid); } catch (e) { /* ignore */ } }
    }));
    let abilityTries = 0;
    while (B.state.turn === 'player' && !B.state.over && guard++ < 40) {
      const hand = B.state.hand.slice().sort((a, b) => cardScore(B, b) - cardScore(B, a));
      let played = false;
      for (const h of hand) {
        const chk = B.canPlay(h.uid);
        if (!chk.ok) continue;
        if (chk.needsTarget && chk.needsTarget !== 'none' && (!chk.targets || !chk.targets.length)) continue;
        const tgt = chooseTarget(B, h, chk);
        if (!tgt) continue;
        if (B.playCard(h.uid, tgt).ok) { played = true; break; }
      }
      if (!played) {
        if (abilityTries++ < 2 && useAbilities(B, true)) continue;
        break;
      }
    }
    useAbilities(B, false);
    if (fx) { loopFlags(B, fx.flags); if (fx.trace) fx.trace(B); }
    B.endTurn();
  }
  function fight(enc, nodeId, meta, trace) {
    const B = SB.battle.create(run, enc, { seed: R.battleSeed(run, nodeId) });
    const fx = { flags: {}, knocks: 0, surges: 0, banks: 0, zooms: 0, trace };
    B.on(e => {
      if (e.type === 'knock') fx.knocks++;
      else if (e.type === 'surge') { fx.surges++; fx.flags.mischief = true; }
      else if (e.type === 'bank') { if (e.amount > 0) fx.banks++; }
      else if (e.type === 'zoom') fx.zooms++;
      else if (e.type === 'lifeSpent') { if (e.voluntary) fx.volLives = (fx.volLives || 0) + (e.amount || 1); else fx.deathLives = (fx.deathLives || 0) + (e.amount || 1); }
    });
    let rounds = 0;
    while (!B.state.over && rounds++ < 80) botTurn(B, fx);
    if (fx.knocks >= 4) fx.flags.mischief = true;
    if (fx.banks >= 3) fx.flags.moon = true;
    if ((fx.flags.pile || 0) >= 2) fx.flags.hearth = true;
    let res = B.state.over ? B.result() : { outcome: 'lose', warmth: 0, stats: { round: rounds, killedBy: 'stall' } };
    return { res, fx, rounds };
  }

  /* ---------------- drafting ---------------- */
  function deckStats() {
    const cats = run.deck.filter(U.isCat).length;
    return { size: run.deck.length, cats, spells: run.deck.length - cats };
  }
  // rough "what does this card do right now" value from its stats and text, so drafting does not just chase rarity
  function cardValue(d) {
    const t = d.text || '';
    const num = re => { const m = re.exec(t); return m ? +m[1] : 0; };
    const st = d.stats || {};
    let v = 0;
    if (d.type === 'unit' || d.type === 'champion') {
      v += (st.power || 0) * 1.0 + (st.health || 0) * 0.3 + ((st.lives || 2) - 2) * 0.5;
      v += num(/Pounce (\d+)/) * 1.0 + num(/Fluff (\d+)/) * 0.15 + num(/Purr (\d+)/) * 0.3 + num(/Claws (\d+)/) * 0.5;
      v += num(/[Dd]raw (\d+)/) * 0.9 + (/Reborn/.test(t) ? 1.2 : 0) + (/Mark/.test(t) ? 0.5 : 0) + (/Knock/.test(t) ? 0.8 : 0) + (/Yarn/.test(t) ? 0.6 : 0);
      v -= d.cost * 1.1;
    } else if (d.type === 'spell') {
      const dmg = num(/(\d+) damage/);
      v += dmg * 0.8 * (/every pest|each pest|all pests|every enemy/i.test(t) ? 1.8 : 1) * (/twice/i.test(t) ? 2 : 1);
      v += num(/[Dd]raw (\d+)/) * 1.2 + num(/gains? (\d+) Zoomies/) * 1.2 + num(/[Hh]eals? (\d+)/) * 0.25 + num(/Fluff (\d+)/) * 0.2;
      v += (/Knock/.test(t) ? 1.5 : 0) + (/Yarn/.test(t) ? 1.2 : 0) + (/Mark/.test(t) ? 1.0 : 0) + (/Life/.test(t) ? 0.8 : 0) + (/Rested|Nap/.test(t) ? 0.5 : 0);
      v -= d.cost * 1.3;
    } else v += 2.5 - d.cost * 0.6;   // toys and rooms
    if (/Witching Hour/.test(t)) v -= 1.2;
    if (/Cornered/.test(t)) v -= 0.8;
    if (/Spend/.test(t)) v -= 0.5;
    if (/Banked|bank/.test(t)) v -= 0.4;
    return v;
  }
  function draftScore(id) {
    const d = CC.card(id);
    if (!d) return -99;
    const clan = CC.clanId ? CC.clanId(d.clan) : d.clan;
    let s = 2.5 + cardValue(d) * 0.9 + ({ common: 0, uncommon: 0.6, rare: 1.2 }[d.rarity] || 0);
    if (clan === run.clan) s += 0.8; else if (clan === run.side) s += 0.3;
    const ds = deckStats();
    if (d.type === 'unit') { if (ds.cats >= 14) s -= 3; else if (ds.cats <= 5) s += 1; }
    else if (ds.spells >= 12) s -= 2.5;
    const have = run.deck.filter(c => c.id === id).length;
    s -= have * 1.6;
    if (ds.size >= 26) s -= (ds.size - 25) * 0.9;
    return s + rnd() * 1.0;
  }
  function claim(pl) {
    const log = { picked: null, offered: (pl.cardChoices || []).slice() };
    const p = run.pending;
    if (!p.cardDone) {
      const ids = pl.cardChoices || [];
      let best = null, bs = 1.6;   // below threshold: skip
      ids.forEach(id => { const s = draftScore(id); if (s > bs) { bs = s; best = id; } });
      if (best) { R.pickCard(run, best); log.picked = best; } else R.skip(run, 'card');
    }
    if (!p.relicDone && pl.relicChoices && pl.relicChoices.length) {
      const id = rnd.pick(pl.relicChoices);
      const r = R.pickRelic(run, id);
      log.relic = id;
    }
    if (!p.charmDone && pl.clanReward && pl.clanReward.charmChoices) {
      let done = false;
      for (const cid of pl.clanReward.charmChoices) {
        const ch = SB.rewards.charmDef(cid);
        const t = run.deck.filter(c => SB.rewards.charmFits(c, ch)).sort((a, b) => (U.isChampion(b) ? 1 : 0) - (U.isChampion(a) ? 1 : 0))[0];
        if (t) { R.pickCharm(run, cid, t.uid); done = true; break; }
      }
      if (!done) R.skip(run, 'charm');
    }
    if (!p.championDone && pl.championUpgrade) {
      const opts = pl.championUpgrade.options;
      const o = rnd.pick(opts);
      R.claimChampionUpgrade(run, o.id);
      log.champOpt = o.id;
    }
    return log;
  }

  /* ---------------- non battle nodes ---------------- */
  function playShop() {
    const view = SB.shop.view(run);
    const buys = [];
    const tryBuy = (it, a) => { const r = SB.shop.buy(run, { slot: it.slot, args: a || {} }, a || {}); return r.ok; };
    // heal first if hurt
    if (run.warmth < run.maxWarmth * 0.6 && view.services.warm_milk.available && run.fish >= view.services.warm_milk.price + 30) {
      SB.shop.warmMilk(run);
    }
    // relics first (best rarity affordable), then cards that score well, then life items
    let guard = 0;
    while (guard++ < 12) {
      const v = SB.shop.view(run);
      const cands = v.stock.filter(s => !s.sold && s.finalPrice <= run.fish);
      let best = null, bs = 0;
      cands.forEach(it => {
        let sc = 0;
        if (it.kind === 'relic') sc = 30 + ({ common: 0, uncommon: 8, rare: 16 }[it.rarity] || 0) - it.finalPrice * 0.08;
        else if (it.kind === 'card') sc = (draftScore(it.id) - 3.5) * 5 - it.finalPrice * 0.12;
        else if (it.kind === 'consumable' && it.needs === 'cat') { const low = U.cats(run).filter(c => c.lives < c.maxLives).length; sc = low >= 2 ? 14 : low ? 6 : 0; sc -= it.finalPrice * 0.08; }
        else if (it.kind === 'charm') sc = 10 - it.finalPrice * 0.1;
        if (sc > bs && sc > 4) { bs = sc; best = it; }
      });
      if (!best) break;
      let a = {};
      if (best.needs === 'cat') { const t = U.cats(run).sort((x, y) => (x.lives / x.maxLives) - (y.lives / y.maxLives))[0]; if (!t) break; a.uid = t.uid; }
      else if (best.needs === 'card') {
        const ch = best.kind === 'charm' ? SB.rewards.charmDef(best.id) : null;
        const t = run.deck.find(c => !ch || SB.rewards.charmFits(c, ch));
        if (!t) break; a.uid = t.uid;
      }
      if (!tryBuy(best, a)) { best.sold = true; shopBlock.add(best.slot); }
      else buys.push(best);
      if (shopBlock.size > 6) break;
    }
    // remove a weak card when rich (curses first)
    if (run.fish >= SB.shop.shooPrice(run) + 40 && run.deck.length > 14) {
      const junk = run.deck.filter(c => !U.isChampion(c) && U.canRemove(run, c).ok).sort((a, b) => scoreKeep(a) - scoreKeep(b))[0];
      if (junk && scoreKeep(junk) < 3) SB.shop.remove(run, junk.uid);
    }
    return buys;
  }
  const shopBlock = new Set();
  function scoreKeep(inst) {
    const d = CC.card(inst.id);
    if (!d) return 0;
    if (d.clan === 'curse' || (d.tags || []).indexOf('curse') >= 0) return -5;
    if (/basic|swat|catnap|cardboard/.test(inst.id) && (d.rarity === 'basic' || d.rarity === 'starter')) return 1;
    return 4;
  }
  function playPost() {
    const post = run.current.post;
    const cats = run.deck.filter(c => SB.post.isUpgradeable(run, c));
    if (!cats.length) return;
    const champ = cats.find(c => U.isChampion(c));
    const pool = cats.filter(c => U.isCat(c));
    let target = champ && SB.post.freeSlots(run, champ) > 0 ? champ : (pool.filter(c => SB.post.freeSlots(run, c) > 0)[0] || cats[0]);
    const o = SB.post.options(run, target.uid);
    const pick = o.offers.find(x => x.kind === 'fork') || o.offers.find(x => x.kind === 'scratch') || o.offers[0];
    if (pick) {
      if (pick.kind === 'fork') SB.post.fork(run, target.uid, pick.options[0].id, { free: true });
      else if (pick.kind === 'plus') SB.post.plus(run, target.uid, { free: true });
      else SB.post.scratch(run, target.uid, pick.id, pick.replace ? { replace: 0 } : {});
    }
    // paid scratches while comfortable
    for (let k = 0; k < 2; k++) {
      if (run.fish < 120) break;
      const t2 = run.deck.filter(c => SB.post.isUpgradeable(run, c) && SB.post.freeSlots(run, c) > 0).sort((a, b) => (U.isChampion(b) ? 1 : 0) - (U.isChampion(a) ? 1 : 0))[0];
      if (!t2) break;
      const oo = SB.post.options(run, t2.uid).offers.find(x => x.kind === 'scratch');
      if (!oo || oo.cost > run.fish - 60) break;
      SB.post.scratch(run, t2.uid, oo.id, { free: false });
    }
    try { SB.post.evolvable(run).forEach(e => { if (e.kind === 'growthSpurt') SB.post.growthSpurt(run, e.uid); else if (run.fish > SB.post.legendPrice(run) + 40) SB.post.legendCeremony(run, e.uid); }); } catch (e) { /* ignore */ }
  }
  function playNook() {
    const n = SB.nook.options(run).filter(o => o.available);
    const ids = n.map(o => o.id);
    const cats = U.cats(run);
    const hurt = run.warmth < run.maxWarmth * 0.65;
    const lowLives = cats.filter(c => c.lives < c.maxLives).length;
    let id = hurt ? 'curl_up' : lowLives >= 3 ? 'lick_wounds' : run.warmth < run.maxWarmth * 0.85 ? 'curl_up' : 'knead';
    if (ids.indexOf(id) < 0) id = 'curl_up';
    const arg = id === 'lick_wounds' ? { uids: cats.filter(c => c.lives < c.maxLives).sort((a, b) => a.lives - b.lives).slice(0, 3).map(c => c.uid) } : {};
    SB.nook.choose(run, id, arg);
  }
  function playEvent(ev) {
    const opts = SB.event.options(run, ev).filter(o => o.enabled);
    const o = rnd.pick(opts);
    const r = SB.event.choose(run, ev, o.idx, { auto: true });
    return { r, evId: ev.id, idx: o.idx };
  }
  function chooseNode(avail) {
    const hurt = run.warmth / run.maxWarmth;
    const w = avail.map(id => {
      const t = run.map.nodes[id].type;
      switch (t) {
        case 'nook': return hurt < 0.6 ? 5 : 1;
        case 'shop': return run.fish >= 90 ? 4 : 1;
        case 'post': return 3;
        case 'treasure': return 3.5;
        case 'event': return 1.5;
        case 'mystery': return 1.5;
        case 'elite': return hurt > 0.6 ? 2 : 0.4;
        case 'boss': return 10;
        default: return 2;
      }
    });
    let tot = w.reduce((a, b) => a + b, 0), x = rnd() * tot;
    for (let i = 0; i < avail.length; i++) { x -= w[i]; if (x <= 0) return avail[i]; }
    return avail[avail.length - 1];
  }
  return { fight, claim, playShop, playPost, playNook, playEvent, chooseNode, draftScore };
}

/* ======================================================================== one run */
function playRun(job) {
  const SB = makeSB();
  const R = SB.run, U = SB.run.U;
  const rnd = mk(hash(job.seed));
  const gifts = ['hearthrug', 'plump_wallet'];
  const run = R.newRun({ seed: job.seed, clan: job.clan, side: job.side, championId: job.champ, rank: job.rank, noSave: true, gift: gifts[hash(job.seed) % gifts.length] });
  run.noAutosave = true;
  const bot = makeBot(SB, run, rnd);
  const rec = {
    seed: job.seed, clan: job.clan, side: job.side, champ: job.champ, rank: job.rank, outcome: null, act: 1,
    fights: [], offers: [], picks: [], champOpts: [], events: {}, killedBy: null, startFlags: {}, loops: { alley: 0, hearth: 0, moon: 0, mischief: 0 }, loopFights: 0
  };
  let steps = 0;
  rec.got = [];   // {k:'card'|'relic', id, idx}: what was acquired after how many fights
  let seenCards = {}, seenRelics = {};
  run.deck.forEach(c => { seenCards[c.uid] = 1; }); run.relics.forEach((r, i) => { seenRelics[(r.id || r) + i] = 1; });
  function trackGains() {
    run.deck.forEach(c => { if (!seenCards[c.uid]) { seenCards[c.uid] = 1; if (!/^token_|^curse_/.test(c.id)) rec.got.push({ k: 'card', id: c.id, idx: rec.fights.length }); } });
    run.relics.forEach((r, i) => { const id = r.id || r; if (!seenRelics[id + i]) { seenRelics[id + i] = 1; rec.got.push({ k: 'relic', id, idx: rec.fights.length }); } });
  }
  function doBattle(kind, nodeId, nightNo) {
    const enc = run.current.encounter;
    const w0 = run.warmth, act = run.act;
    const { res, fx, rounds } = bot.fight(enc, nodeId);
    const fin = R.finishBattle(run, res);
    const lost = Math.max(0, w0 - (typeof res.warmth === 'number' ? res.warmth : 0));
    rec.volLives = (rec.volLives || 0) + (fx.volLives || 0); rec.deathLives = (rec.deathLives || 0) + (fx.deathLives || 0);
    rec.fights.push({ act, kind, night: nightNo || enc.nightNo || null, enc: enc.id, boss: enc.bossId || null, elite: enc.eliteId || null, win: res.outcome === 'win', lost: res.outcome === 'win' ? lost : w0, rounds, deckSize: run.deck.length });
    if (act >= 2 || kind === 'boss') {
      rec.loopFights++;
      Object.keys(rec.loops).forEach(k => { if (fx.flags[k]) rec.loops[k]++; });
    }
    if (fin && fin.defeat) { rec.killedBy = fin.killedBy || res.killedBy || null; return 'defeat'; }
    const log = bot.claim(fin);
    if (log.offered.length) rec.offers.push({ offered: log.offered, picked: log.picked });
    if (log.champOpt) rec.champOpts.push(log.champOpt);
    if (run.status === 'reward') {
      const out = R.proceed(run);
      if (out && out.next === 'victory') return 'victory';
    }
    return 'ok';
  }
  let ended = null;
  while (run.status !== 'over' && steps++ < 300 && !ended) {
    if (run.status !== 'map') { rec.error = 'stuck ' + run.status; break; }
    const avail = R.availableNodes(run);
    if (!avail.length) { rec.error = 'no nodes'; break; }
    const nid = bot.chooseNode(avail);
    let out;
    try { out = R.enterNode(run, nid); } catch (e) { rec.error = 'enter: ' + e.message; break; }
    try {
      if (out.type === 'battle' || out.type === 'elite' || out.type === 'night' || out.type === 'boss') {
        const r = doBattle(out.type, nid);
        if (r === 'defeat') ended = 'lost'; else if (r === 'victory') ended = 'won';
      } else if (out.type === 'shop') { bot.playShop(); R.leaveNode(run); }
      else if (out.type === 'event') {
        const ev = out.payload.event;
        const e = bot.playEvent(ev);
        rec.events[e.evId + ':' + e.idx] = 1;
        if (e.r.fight) {
          const r = doBattle('event', nid);
          if (r === 'defeat') ended = 'lost';
        } else { SB.event.autoDrafts(run); R.leaveNode(run); }
      }
      else if (out.type === 'post') { bot.playPost(); R.leaveNode(run); }
      else if (out.type === 'nook') { bot.playNook(); R.leaveNode(run); }
      else if (out.type === 'treasure') { R.treasure(run, 'open'); R.leaveNode(run); }
      else { rec.error = 'unknown ' + out.type; break; }
    } catch (e) { rec.error = (e.stack || e).toString().split('\n').slice(0, 3).join(' | '); break; }
    if (run.status === 'over') ended = ended || run.outcome;
    rec.act = run.act;
    trackGains();
  }
  rec.outcome = ended || run.outcome || 'error';
  rec.actReached = run.act;
  rec.deck = run.deck.map(c => c.id);
  rec.relics = run.relics.map(r => r.id || r);
  rec.deckSize = run.deck.length;
  rec.fish = run.fish;
  rec.maxWarmth = run.maxWarmth;
  return rec;
}

/* ======================================================================== job list and workers */
// 8 character run seeds from the engine alphabet (the engine truncates anything else, which would make runs collide)
function mkSeed(key) { const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; const r = mk(hash(key) ^ 0x9e3779b9); let o = ''; for (let i = 0; i < 8; i++) o += A.charAt(Math.floor(r() * 32)); return o; }
function buildJobs() {
  const SB = makeSB();
  const champs = SB.content.champions().map(c => ({ id: c.id, clan: c.clan }));
  const jobs = [];
  RANKS.forEach(rank => champs.forEach(ch => {
    if (ONLY_CHAMP && ch.id !== ONLY_CHAMP) return;
    CLANS.filter(c => c !== ch.clan).forEach(side => {
      for (let s = 0; s < SEEDS; s++) jobs.push({ rank, champ: ch.id, clan: ch.clan, side, seed: mkSeed(rank + ':' + ch.id + ':' + side + ':' + s) });
    });
  }));
  return jobs;
}

if (require.main !== module) { module.exports = { makeSB, makeBot, playRun, mk, hash }; }
else if (process.env.BS_WORKER) {
  const jobs = JSON.parse(process.env.BS_JOBS);
  const out = [];
  jobs.forEach(j => { try { out.push(playRun(j)); } catch (e) { out.push({ seed: j.seed, clan: j.clan, side: j.side, champ: j.champ, rank: j.rank, outcome: 'error', error: String(e.stack || e).split('\n').slice(0, 3).join(' | '), fights: [], offers: [], champOpts: [], events: {}, loops: {}, deck: [], relics: [] }); } });
  fs.writeFileSync(process.env.BS_OUT, JSON.stringify(out));
  process.exit(0);
}

/* ======================================================================== reporting */
const pct = (n, d) => d ? (100 * n / d).toFixed(1) + '%' : '-';
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
function table(rows, cols) {
  const widths = cols.map((c, i) => Math.max(c.length, ...rows.map(r => String(r[i]).length)));
  const line = r => r.map((v, i) => String(v).padEnd(widths[i])).join('  ');
  console.log(line(cols)); rows.forEach(r => console.log(line(r)));
}
function report(recs, SB) {
  const ranksSeen = [...new Set(recs.map(r => r.rank))].sort((a, b) => a - b);
  const errs = recs.filter(r => r.outcome === 'error' || r.error);
  console.log('runs: ' + recs.length + ', errors: ' + errs.length);
  errs.slice(0, 5).forEach(r => console.log('  ERR ' + r.champ + ' ' + r.side + ' ' + r.seed + ': ' + r.error));
  ranksSeen.forEach(rank => {
    const rs = recs.filter(r => r.rank === rank);
    const won = rs.filter(r => r.outcome === 'won').length;
    console.log('\n================ MISCHIEF RANK ' + rank + ' : full run win ' + pct(won, rs.length) + ' (' + won + '/' + rs.length + ')');
    // act survival
    const fights = [].concat.apply([], rs.map(r => r.fights.map(f => Object.assign({ run: r }, f))));
    console.log('\nPer act (fights won / fought, run reached act):');
    const rowsA = [1, 2, 3].map(a => {
      const f = fights.filter(x => x.act === a);
      const reached = rs.filter(r => r.fights.some(x => x.act === a)).length;
      const cleared = rs.filter(r => r.fights.some(x => x.act === a && x.kind === 'boss' && x.win)).length;
      return ['Act ' + a, pct(f.filter(x => x.win).length, f.length), f.length, reached, pct(cleared, reached), avg(f.filter(x => x.win).map(x => x.lost)).toFixed(1)];
    });
    table(rowsA, ['act', 'fight win', 'fights', 'runs in', 'act cleared', 'warmth lost/win']);
    console.log('\nPer fight kind (win%, avg warmth lost on wins):');
    const kinds = {};
    fights.forEach(f => { const k = 'A' + f.act + ' ' + (f.kind === 'night' ? 'night' + f.night : f.kind); (kinds[k] = kinds[k] || []).push(f); });
    table(Object.keys(kinds).sort().map(k => { const f = kinds[k]; return [k, f.length, pct(f.filter(x => x.win).length, f.length), avg(f.filter(x => x.win).map(x => x.lost)).toFixed(1), avg(f.map(x => x.rounds)).toFixed(1)]; }), ['fight', 'n', 'win', 'lost/win', 'rounds']);
    console.log('\nPer boss:');
    const bosses = {};
    fights.filter(f => f.kind === 'boss').forEach(f => { (bosses[f.boss || f.enc] = bosses[f.boss || f.enc] || []).push(f); });
    table(Object.keys(bosses).sort().map(k => { const f = bosses[k]; return [k, f.length, pct(f.filter(x => x.win).length, f.length), avg(f.filter(x => x.win).map(x => x.lost)).toFixed(1)]; }), ['boss', 'n', 'win', 'lost/win']);
    console.log('\nPer elite (win%):');
    const elites = {};
    fights.filter(f => f.kind === 'elite').forEach(f => { (elites[f.elite || f.enc] = elites[f.elite || f.enc] || []).push(f); });
    table(Object.keys(elites).sort().map(k => { const f = elites[k]; return [k, f.length, pct(f.filter(x => x.win).length, f.length), avg(f.filter(x => x.win).map(x => x.lost)).toFixed(1)]; }), ['elite', 'n', 'win', 'lost/win']);
    // clan / champion / side
    const grp = (keyf, label) => {
      const m = {};
      rs.forEach(r => { const k = keyf(r); (m[k] = m[k] || []).push(r); });
      console.log('\nBy ' + label + ':');
      table(Object.keys(m).sort().map(k => { const g = m[k]; return [k, g.length, pct(g.filter(r => r.outcome === 'won').length, g.length), avg(g.map(r => r.actReached)).toFixed(2), avg(g.map(r => avg(r.fights.filter(f => f.win).map(f => f.lost)))).toFixed(1)]; }), [label, 'runs', 'win', 'avg act', 'lost/fight']);
    };
    grp(r => r.clan, 'main clan'); grp(r => r.champ, 'champion'); grp(r => r.side, 'side clan'); grp(r => r.clan + '+' + r.side, 'pair');
    // loops
    console.log('\nClan loops (share of Act 2+/boss fights where the loop condition showed up):');
    const lm = {};
    rs.forEach(r => { (lm[r.clan] = lm[r.clan] || { f: 0, alley: 0, hearth: 0, moon: 0, mischief: 0 }); const l = lm[r.clan]; l.f += r.loopFights; ['alley', 'hearth', 'moon', 'mischief'].forEach(k => l[k] += (r.loops[k] || 0)); });
    table(Object.keys(lm).sort().map(c => [c + ' decks', lm[c].f, pct(lm[c].alley, lm[c].f), pct(lm[c].hearth, lm[c].f), pct(lm[c].moon, lm[c].f), pct(lm[c].mischief, lm[c].f)]), ['main clan', 'fights', 'alley loop', 'hearth loop', 'moon loop', 'mischief loop']);
  });
  // cards and relics, all ranks combined for volume
  const rs0 = recs.filter(r => r.fights.length);
  const wins = r => r.outcome === 'won';
  // expected win rate for a run of this main clan that got past `idx` fights (removes the bias that late pickups only exist in survivors)
  const baseCache = {};
  function expected(clan, idx) {
    const key = clan + ':' + idx;
    if (baseCache[key] === undefined) {
      const set = rs0.filter(r => r.clan === clan && (r.fights.length > idx || wins(r)));
      baseCache[key] = set.length ? set.filter(wins).length / set.length : 0;
    }
    return baseCache[key];
  }
  const gm = { card: {}, relic: {} };
  rs0.forEach(r => {
    const seen = {};
    r.got.forEach(g => {
      const k = g.k, id = g.id;
      const o = gm[k][id] = gm[k][id] || { n: 0, w: 0, exp: 0, runs: {} };
      o.n++; if (wins(r)) o.w++; o.exp += expected(r.clan, g.idx);
    });
  });
  const cm = {};
  rs0.forEach(r => { r.offers.forEach(o => { o.offered.forEach(id => { const c = cm[id] = cm[id] || { offered: 0, picked: 0 }; c.offered++; if (o.picked === id) c.picked++; }); }); });
  const lift = (o) => 100 * (o.w - o.exp) / o.n;
  console.log('\n================ CARDS: win-rate LIFT in points = (win rate of runs that took the card) minus (expected win rate of equally far, same-clan runs); field win ' + pct(rs0.filter(wins).length, rs0.length));
  const crow = Object.keys(gm.card).filter(id => gm.card[id].n >= 25 && !/^(neutral_swat|neutral_catnap|neutral_cardboard)/.test(id)).map(id => ({ id, n: gm.card[id].n, lift: lift(gm.card[id]), off: (cm[id] || {}).offered || 0, pick: cm[id] && cm[id].offered ? cm[id].picked / cm[id].offered : 0 })).sort((a, b) => b.lift - a.lift);
  const frow = c => [c.id, c.n, (c.lift >= 0 ? '+' : '') + c.lift.toFixed(1), c.off, (100 * c.pick).toFixed(0) + '%'];
  console.log('Top 15 (n>=25 takes):'); table(crow.slice(0, 15).map(frow), ['card', 'takes', 'lift', 'offered', 'pick rate']);
  console.log('Bottom 12:'); table(crow.slice(-12).map(frow), ['card', 'takes', 'lift', 'offered', 'pick rate']);
  const popular = crow.filter(c => c.off >= 40).sort((a, b) => b.pick - a.pick);
  console.log('Most picked when offered (offered>=40):'); table(popular.slice(0, 8).map(frow), ['card', 'takes', 'lift', 'offered', 'pick rate']);
  console.log('Least picked when offered:'); table(popular.slice(-6).map(frow), ['card', 'takes', 'lift', 'offered', 'pick rate']);
  console.log('\n================ RELICS (lift, n>=20)');
  const rrow = Object.keys(gm.relic).filter(id => gm.relic[id].n >= 20).map(id => ({ id, n: gm.relic[id].n, lift: lift(gm.relic[id]) })).sort((a, b) => b.lift - a.lift);
  const rfmt = c => [c.id, c.n, (c.lift >= 0 ? '+' : '') + c.lift.toFixed(1)];
  console.log('Top 12:'); table(rrow.slice(0, 12).map(rfmt), ['relic', 'runs', 'lift']);
  console.log('Bottom 8:'); table(rrow.slice(-8).map(rfmt), ['relic', 'runs', 'lift']);
  const kb = {};
  recs.filter(r => r.outcome === 'lost').forEach(r => { const k = r.killedBy || '?'; kb[k] = (kb[k] || 0) + 1; });
  console.log('\nKilled by (top 10):'); table(Object.keys(kb).sort((a, b) => kb[b] - kb[a]).slice(0, 10).map(k => [k, kb[k]]), ['pest', 'runs']);
}

/* ======================================================================== main */
function main() {
  const t0 = Date.now();
  if (opt('report', null) && opt('report', null) !== true) { report(JSON.parse(fs.readFileSync(opt('report', null), 'utf8')), null); return; }
  const jobs = buildJobs();
  const sc = path.join(process.env.TMPDIR || '/tmp', 'bsim-' + process.pid);
  fs.mkdirSync(sc, { recursive: true });
  const chunks = Array.from({ length: WORKERS }, () => []);
  jobs.forEach((j, i) => chunks[i % WORKERS].push(j));
  let done = 0, all = [];
  chunks.forEach((ch, i) => {
    const out = path.join(sc, 'out' + i + '.json');
    const p = cp.spawn(process.execPath, [__filename], { env: Object.assign({}, process.env, { BS_WORKER: '1', BS_JOBS: JSON.stringify(ch), BS_OUT: out }), stdio: 'inherit' });
    p.on('exit', code => {
      if (code === 0 && fs.existsSync(out)) all = all.concat(JSON.parse(fs.readFileSync(out, 'utf8')));
      else console.log('worker ' + i + ' failed (' + code + ')');
      if (++done === chunks.length) {
        try { fs.rmSync(sc, { recursive: true, force: true }); } catch (e) { /* ignore */ }
        if (JSON_OUT && JSON_OUT !== true) fs.writeFileSync(JSON_OUT, JSON.stringify(all));
        console.log('simulated ' + all.length + ' runs in ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
        report(all, null);
      }
    });
  });
}
if (require.main === module && !process.env.BS_WORKER) main();
