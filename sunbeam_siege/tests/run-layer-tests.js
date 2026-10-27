// Run layer tests (agent C2). node tests/run-layer-tests.js [--verbose]
// Loads the data files and the engine in a vm context with a stub window and a localStorage stub.
// 1. 500 map generations, validity asserted   2. determinism   3. 50 automated runs with stubbed battle results
// 4. every one of the 48 events, every choice, resolved on a fresh run   5. save/load round trip   6. coverage report
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const VERBOSE = process.argv.includes('--verbose');

function makeContext() {
  const store = {};
  const ctx = { console, Math, Date, JSON };
  ctx.window = ctx;
  ctx.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  };
  ctx.__store = store;
  vm.createContext(ctx);
  const load = f => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: path.basename(f) });
  const dataDir = path.join(root, 'src/data');
  fs.readdirSync(dataDir).filter(f => f.endsWith('.js')).sort().forEach(f => load(path.join(dataDir, f)));
  ['util', 'registry', 'content', 'card-inst', 'map', 'rewards', 'post', 'nook', 'shop', 'events-engine', 'profile', 'run'].forEach(n => {
    const f = path.join(root, 'src/engine', n + '.js');
    if (fs.existsSync(f)) load(f);
  });
  fs.readdirSync(path.join(root, 'src/engine')).filter(f => /^ops-.*\.js$/.test(f)).sort().forEach(f => load(path.join(root, 'src/engine', f)));
  return ctx;
}

const ctx = makeContext();
const SB = ctx.SB;
let failures = 0, checks = 0;
const failLog = {};
function fail(msg) { failures++; failLog[msg] = (failLog[msg] || 0) + 1; }
function ok(c, msg) { checks++; if (!c) fail(msg); return !!c; }
function guard(label, fn) {
  try { return fn(); } catch (e) { fail(label + ': ' + (e && e.message) + (VERBOSE ? '\n' + (e.stack || '').split('\n').slice(1, 4).join('\n') : '')); return undefined; }
}
const DASH = new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']');

/* ================================================================ 1. maps */
const R = SB.run;
const SEEDS = [];
for (let i = 0; i < 200; i++) SEEDS.push(R.rngFor('T', 'seed', i).next().toString(36).slice(2, 10).toUpperCase().padEnd(8, '0').slice(0, 8));
let mapCount = 0, mapBad = 0, mapFallback = 0;
const ranks = [0, 3, 5, 7, 10];
for (let i = 0; i < 500; i++) {
  const seed = SEEDS[i % SEEDS.length] , act = (i % 3) + 1, rank = ranks[i % ranks.length];
  const m = guard('generateAct', () => SB.map.generateAct(seed + (i >= 200 ? i : ''), act, { rank }));
  mapCount++;
  if (!m) { mapBad++; continue; }
  const v = SB.map.validate(m);
  if (!ok(v.ok, 'map invalid: ' + (v.errors || []).slice(0, 2).join(';'))) mapBad++;
  if (m.fallback) mapFallback++;
  ok(m.rows.length === 8, 'map has 8 rows');
  ok(m.nodes[m.boss] || m.nodes[m.bossNode], 'map has boss node');
}
// determinism
{
  const a = JSON.stringify(SB.map.generateAct('ABCD1234', 2, { rank: 0 })), b = JSON.stringify(SB.map.generateAct('ABCD1234', 2, { rank: 0 }));
  ok(a === b, 'map determinism');
  ok(a !== JSON.stringify(SB.map.generateAct('ABCD1235', 2, { rank: 0 })), 'maps differ per seed');
}

/* ================================================================ helpers for runs */
const COV = { nodeTypes: {}, events: {}, eventChoices: {}, shopBuys: {}, shopServices: {}, post: {}, nook: {}, rewards: {}, relics: {}, hooks: {}, acts: {}, champTiers: {}, gifts: {} };
function bump(o, k) { o[k] = (o[k] || 0) + 1; }
const GIFT_IDS = () => ((SB.data.meta && SB.data.meta.cradleGifts) || []).map(g => g.id);
const CLANS = ['alley', 'hearth', 'moon', 'mischief'];

function newTestRun(i, opts) {
  const clan = CLANS[i % 4], side = CLANS[(i + 1 + Math.floor(i / 4)) % 4] === clan ? CLANS[(i + 2) % 4] : CLANS[(i + 1 + Math.floor(i / 4)) % 4];
  const gifts = GIFT_IDS().filter(g => { const d = SB.data.meta.cradleGifts.find(x => x.id === g); return !d.unlock || d.unlock.type === 'start'; });
  const o = Object.assign({ seed: 'RUN' + String(1000 + i).slice(0, 5), clan, side, rank: [0, 0, 3, 5, 7, 10][i % 6], noSave: false, gift: gifts[i % Math.max(1, gifts.length)] }, opts || {});
  return R.newRun(o);
}

function fightResult(run, rng, lose) {
  const dmg = Math.min(run.warmth - 1, rng.int(0, 7));
  const plays = {};
  run.deck.forEach(c => { if (rng.chance(0.5)) plays[c.uid] = rng.int(1, 5); });
  return { outcome: lose ? 'lose' : 'win', warmth: lose ? 0 : Math.max(1, run.warmth - dmg), stats: { playsByUid: plays, plays, warmthLost: dmg, round: 4 } };
}
function claimAll(run, rng) {
  const p = run.pending;
  if (!p) return;
  const pl = p.payload;
  if (!p.cardDone) {
    const ids = pl.cardChoices || [];
    if (ids.length && rng.chance(0.8)) { const r = R.pickCard(run, rng.pick(ids)); ok(r.ok, 'pickCard ok'); bump(COV.rewards, 'card'); } else { R.skip(run, 'card'); bump(COV.rewards, 'cardSkip'); }
  }
  if (!p.relicDone && pl.relicChoices && pl.relicChoices.length) {
    const r = R.pickRelic(run, rng.pick(pl.relicChoices)); ok(r.ok, 'pickRelic ok'); bump(COV.rewards, 'relic');
  }
  if (!p.charmDone && pl.clanReward && pl.clanReward.charmChoices) {
    const cid = rng.pick(pl.clanReward.charmChoices);
    const ch = SB.rewards.charmDef(cid);
    const t = run.deck.find(c => SB.rewards.charmFits(c, ch));
    if (t) { const r = R.pickCharm(run, cid, t.uid); ok(r.ok, 'pickCharm ok ' + (r.reason || '')); bump(COV.rewards, 'charm'); }
    else R.skip(run, 'charm');
  }
  if (!p.championDone && pl.championUpgrade) {
    const opts = pl.championUpgrade.options;
    ok(opts && opts.length >= 2, 'champion upgrade has options');
    const r = R.claimChampionUpgrade(run, rng.pick(opts).id); ok(r.ok, 'champion upgrade ok ' + (r.reason || ''));
    bump(COV.champTiers, 't' + pl.championUpgrade.tier);
  }
}

function doBattle(run, rng, lose) {
  const res = R.finishBattle(run, fightResult(run, rng, lose));
  if (res && res.defeat) return 'defeat';
  claimAll(run, rng);
  if (run.status === 'reward') {
    const out = R.proceed(run);
    if (out && out.next === 'victory') return 'victory';
  }
  return 'ok';
}

function resolveEvent(run, rng, ev, forceIdx) {
  const opts = SB.event.options(run, ev).filter(o => o.enabled);
  ok(opts.length > 0, 'event ' + ev.id + ' has an enabled option');
  const o = forceIdx !== undefined ? { idx: forceIdx } : rng.pick(opts);
  const r = SB.event.choose(run, ev, o.idx, { auto: true });
  ok(r.ok, 'event choose ok ' + ev.id + ':' + o.idx + ' ' + (r.reason || ''));
  bump(COV.events, ev.id); bump(COV.eventChoices, ev.id + ':' + o.idx);
  return r;
}

function driveRun(i, opts) {
  const rng = R.rngFor('driver', 'runs', i);
  const run = newTestRun(i, opts);
  const loseAt = (i % 9 === 4) ? 8 : -1;   // some runs end in defeat
  let fights = 0, steps = 0, ended = null, savedMid = false;
  while (run.status !== 'over' && steps++ < 400) {
    if (run.status !== 'map') { fail('stuck in status ' + run.status); break; }
    const avail = R.availableNodes(run);
    if (!avail.length) { fail('no available nodes'); break; }
    // steer toward uncovered node types
    avail.sort((a, b) => (COV.nodeTypes[run.map.nodes[a].type] || 0) - (COV.nodeTypes[run.map.nodes[b].type] || 0));
    const nid = rng.chance(0.7) ? avail[0] : rng.pick(avail);
    const node = run.map.nodes[nid];
    bump(COV.nodeTypes, node.type);
    const out = guard('enterNode ' + node.type, () => R.enterNode(run, nid));
    if (!out) break;
    bump(COV.acts, run.act);
    if (out.type === 'battle' || out.type === 'elite' || out.type === 'night' || out.type === 'boss') {
      ok(out.payload && out.payload.encounter, 'battle has encounter');
      fights++;
      const r = guard('battle ' + out.type, () => doBattle(run, rng, fights === loseAt));
      if (r === 'defeat') { ended = 'lost'; break; }
      if (r === 'victory') { ended = 'won'; break; }
      if (!savedMid && run.act === 2) {
        savedMid = true;
        roundTrip(run);
      }
    } else if (out.type === 'shop') {
      guard('shop', () => playShop(run, rng));
      guard('leave', () => R.leaveNode(run));
    } else if (out.type === 'event') {
      guard('event', () => {
        const ev = out.payload.event;
        ok(ev, 'event picked');
        const r = resolveEvent(run, rng, ev);
        if (r.fight) {
          fights++;
          const rr = doBattle(run, rng, false);
          if (rr === 'defeat') ended = 'lost';
        } else {
          SB.event.autoDrafts(run);
          R.leaveNode(run);
        }
      });
      if (ended) break;
    } else if (out.type === 'post') {
      guard('post', () => playPost(run, rng));
      guard('leave', () => R.leaveNode(run));
    } else if (out.type === 'nook') {
      guard('nook', () => playNook(run, rng));
      guard('leave', () => R.leaveNode(run));
    } else if (out.type === 'treasure') {
      guard('treasure', () => { const r = R.treasure(run, rng.chance(0.7) ? 'open' : 'sit'); ok(r.ok, 'treasure ok'); });
      guard('leave', () => R.leaveNode(run));
    } else fail('unknown out type ' + out.type);
    guard('invariants', () => invariants(run));
    if (run.status === 'over') { ended = ended || run.outcome; break; }
  }
  if (run.status !== 'over') fail('run did not finish (status ' + run.status + ', steps ' + steps + ')');
  return { run, ended, fights };
}

function invariants(run) {
  ok(run.fish >= 0, 'fish never negative');
  ok(run.warmth >= 0 && run.warmth <= run.maxWarmth, 'warmth in bounds ' + run.warmth + '/' + run.maxWarmth);
  ok(run.deck.length >= 1, 'deck not empty');
  run.deck.forEach(c => { ok(SB.content.card(c.id), 'deck card exists ' + c.id); ok(c.lives >= 0 && c.lives <= 9, 'lives within bounds'); });
  ok(run.deck.filter(c => SB.run.U.isChampion(c)).length <= 1, 'one champion');
  const maxScratch = 3;
  run.deck.forEach(c => ok((c.scratches || []).length + (c.fork ? 1 : 0) <= maxScratch, 'slot cap respected'));
  ok(JSON.stringify(run).indexOf(String.fromCharCode(0x2014)) < 0, 'no em dash in run');
}

function playShop(run, rng) {
  const view = SB.shop.view(run);
  ok(view.stock.length >= 8, 'shop stock size ' + view.stock.length);
  ['card', 'relic', 'charm', 'stall', 'voucher', 'consumable'].forEach(k => ok(view.stock.some(s => s.kind === k), 'shop sells ' + k));
  ok(view.services && (view.services.shoo.price >= 75 || SB.run.mod(run, 'adoptOutFree')), 'shoo price >= 75');
  // buy things the run can afford, bias toward variety
  const kinds = view.stock.map(s => s);
  rng.shuffle(kinds);
  run.fish += rng.int(0, 400);   // test funds
  kinds.forEach(it => {
    if (it.sold) return;
    const args = {};
    if (it.needs) {
      const cands = run.deck.filter(c => it.needs === 'cat' ? SB.run.U.isCat(c) : true);
      args.uid = rng.pick(cands).uid;
      if (it.kind === 'voucher') {
        const c2 = run.deck.find(c => SB.post.forksFor(run, c).length && !c.fork);
        if (!c2) return;
        args.uid = c2.uid; args.forkId = SB.post.forksFor(run, c2)[0].id;
      }
    }
    if (!rng.chance(0.6)) return;
    const r = SB.shop.buy(run, { slot: it.slot, args }, args);
    if (r.ok) bump(COV.shopBuys, it.kind); else bump(COV.shopBuys, 'refused:' + it.kind);
    if (!r.ok && !/Fish|fit|slot|Fork|cat|plenty|Already|Pick/.test(r.reason || '')) fail('shop buy refused: ' + it.kind + ' ' + r.reason);
  });
  // services
  run.fish += 400;
  const rm = run.deck.find(c => SB.run.U.canRemove(run, c).ok);
  if (rm) { const before = SB.shop.shooPrice(run); const r = SB.shop.remove(run, rm.uid); ok(r.ok, 'shoo ok ' + (r.reason || '')); if (r.ok) { bump(COV.shopServices, 'shoo'); ok(SB.shop.shooPrice(run) >= before, 'shoo escalates'); } }
  run.fish += 100;
  if (rng.chance(0.5)) { const r = SB.shop.warmMilk(run); bump(COV.shopServices, r.ok ? 'milk' : 'milkRefused'); }
  if (rng.chance(0.5)) { const r = SB.shop.reroll(run); if (r.ok) bump(COV.shopServices, 'reroll'); }
  if (rng.chance(0.4)) { const it = SB.shop.view(run).stock.find(s => !s.sold); if (it) { const r = SB.shop.haggle(run, it.slot); if (r.ok) bump(COV.shopServices, 'haggle'); } }
  if (rng.chance(0.4)) { const c = run.deck.find(c => SB.run.U.canRemove(run, c).ok); if (c) { const r = SB.shop.sell(run, c.uid); if (r.ok) bump(COV.shopServices, 'sell'); } }
  if (rng.chance(0.3)) { const c = run.deck.find(c => SB.post.canLitter(run, c).ok); if (c) { const r = SB.shop.litter(run, c.uid); if (r.ok) bump(COV.shopServices, 'litter'); } }
  if (rng.chance(0.3)) { const c = run.deck.find(c => SB.run.U.isCat(c) && !SB.run.U.isChampion(c) && SB.post.boxSwapChoices(run, c.uid, 'probe').length); if (c) { const r = SB.shop.boxSwap(run, c.uid); if (r.ok && r.choices && r.choices.length) { const r2 = SB.shop.boxSwap(run, c.uid, r.choices[0]); if (r2.ok) bump(COV.shopServices, 'boxSwap'); } } }
  if (rng.chance(0.3)) { const c = run.deck.find(c => SB.run.U.isCat(c)); if (c) { const r = SB.shop.whittle(run, c.uid); if (r && r.ok) bump(COV.shopServices, 'whittle'); } }
  if (rng.chance(0.3)) { const c = run.deck.find(c => SB.run.U.isCat(c)); if (c) { const r = SB.shop.knead(run, c.uid, rng.chance(0.5) ? 'power' : 'health'); if (r && r.ok) bump(COV.shopServices, 'knead'); } }
  if (view.black) bump(COV.shopServices, 'blackMarketSeen');
  if (view.black) {
    const it = view.black.items[0];
    run.fish += 300;
    const args = {};
    if (it.needs === 'cat') args.uid = run.deck.find(c => SB.run.U.isCat(c)).uid;
    const r = SB.shop.buy(run, { slot: it.slot || 'b0', args }, args);
    if (r.ok) bump(COV.shopServices, 'blackMarketBuy');
  }
}

function playPost(run, rng) {
  const post = run.current.post;
  ok(post, 'post open');
  const elig = run.deck.filter(c => SB.post.isUpgradeable(run, c));
  if (elig.length) {
    const c = rng.pick(elig);
    const o = SB.post.options(run, c.uid);
    ok(o.offers.length > 0, 'post has offers');
    const pick = o.offers.find(x => x.kind === 'scratch') || o.offers[0];
    let r;
    if (pick.kind === 'fork') r = SB.post.fork(run, c.uid, pick.options[0].id, { free: true });
    else if (pick.kind === 'plus') r = SB.post.plus(run, c.uid, { free: true });
    else r = SB.post.scratch(run, c.uid, pick.id, pick.replace ? { replace: 0 } : {});
    ok(r && r.ok, 'post free pick ok ' + (r && r.reason || ''));
    bump(COV.post, pick.kind);
  } else bump(COV.post, 'nothingToUpgrade');
  // paid extras
  run.fish += 200;
  const evo = SB.post.evolvable(run);
  evo.forEach(e => { if (e.kind === 'growthSpurt') { const r = SB.post.growthSpurt(run, e.uid); if (r && r.ok) bump(COV.post, 'growthSpurt'); } else { const r = SB.post.legendCeremony(run, e.uid); if (r && r.ok) bump(COV.post, 'legend'); } });
  const c2 = run.deck.find(c => SB.post.isUpgradeable(run, c) && SB.post.freeSlots(run, c) > 0);
  if (c2) {
    const o = SB.post.options(run, c2.uid);
    const s = o.offers.find(x => x.kind === 'scratch');
    if (s) { const r = SB.post.scratch(run, c2.uid, s.id, { free: false }); if (r.ok) bump(COV.post, 'paidScratch'); }
  }
  if (SB.post.services) { const sv = SB.post.services(run); ok(sv, 'post services'); }
}

function playNook(run, rng) {
  const n = SB.nook.options(run);
  const ids = n.filter(o => o.available).map(o => o.id);
  const id = rng.pick(ids);
  const cats = run.deck.filter(c => SB.run.U.isCat(c));
  const arg = id === 'groom' ? { uid: (run.deck.find(c => SB.run.U.canRemove(run, c).ok) || {}).uid } : id === 'lick_wounds' ? { uids: cats.filter(c => c.lives < c.maxLives).slice(0, 3).map(c => c.uid) } : id === 'deep_sleep' ? { uid: rng.pick(cats).uid } : {};
  const r = SB.nook.choose(run, id, arg);
  ok(r.ok, 'nook ' + id + ' ok ' + (r.reason || ''));
  bump(COV.nook, id);
  const again = SB.nook.choose(run, 'curl_up');
  ok(!again.ok, 'nook allows one pick');
}

function roundTrip(run) {
  const saved = R.save(run);
  ok(saved, 'save returns true');
  const back = R.load();
  ok(back, 'load returns a run');
  if (back) {
    const strip = o => { const c = JSON.parse(JSON.stringify(o)); ['savedAt', 'startedAt', 'secondsBase'].forEach(k => delete c[k]); return JSON.stringify(c); };
    ok(strip(back) === strip(run), 'save/load round trip is identical');
    // determinism after reload: same map and same next-node rng
    ok(JSON.stringify(back.map) === JSON.stringify(run.map), 'map survives reload');
  }
  // corrupt save
  ctx.localStorage.setItem('nl_run_v1', '{not json');
  ok(R.load() === null && R.lastError && R.lastError.code === 'corrupt', 'corrupt save handled');
  R.save(run);
}

/* ================================================================ 3. fifty full runs */
const results = { won: 0, lost: 0, other: 0 };
const totalRuns = 50;
for (let i = 0; i < totalRuns; i++) {
  const r = guard('run ' + i, () => driveRun(i));
  if (!r) continue;
  results[r.ended === 'won' ? 'won' : r.ended === 'lost' ? 'lost' : 'other']++;
  if (VERBOSE) console.log('run', i, r.ended, 'act', r.run.act, 'fights', r.fights, 'fish', r.run.fish, 'deck', r.run.deck.length, 'relics', r.run.relics.length);
  (r.run.relics || []).forEach(x => bump(COV.relics, x.id || x));
}

/* ================================================================ 4. every event, every choice */
const evs = SB.data.events;
ok(evs.length === 48, 'there are 48 events (found ' + evs.length + ')');
evs.forEach((ev, n) => {
  ev.choices.forEach((ch, ci) => {
    guard('event ' + ev.id + ':' + ci, () => {
      const run = newTestRun(n * 5 + ci, { rank: 0 });
      run.noAutosave = false;
      run.act = ev.acts[0] === 1 || ev.homeAct === ev.acts[0] ? ev.homeAct : ev.acts[0];
      if (run.act !== 1) { R.startAct(run, run.act); }
      run.fish += 300;
      if (ch.req && ch.req.clan && run.clan !== ch.req.clan) run.side = ch.req.clan === run.clan ? run.side : ch.req.clan;
      if (ev.requires && ev.requires.flag) run.flags[ev.requires.flag] = ev.requires.flag === 'gerald_debt' ? 60 : true;
      if (ch.req && ch.req.flag) run.flags[ch.req.flag] = true;
      if (ev.id === 'evt_gerald_debt' || (ch.effects || []).some(e => e.op === 'payDebt')) run.flags.gerald_debt = 60;
      // put the run on an event node
      const row = Object.keys(run.map.nodes).find(id => run.map.nodes[id].type === 'event') || run.map.rows[0][0];
      run.pos = row; run.status = 'event';
      run.current = { nodeId: row, type: 'event', startWarmth: run.warmth };
      const picked = SB.event.pick(run, ev.id);
      ok(picked && picked.id === ev.id, 'pick by id ' + ev.id);
      // make sure requirements are satisfiable
      if (ch.req && ch.req.catLives) run.deck.forEach(c => { if (SB.run.U.isCat(c)) c.lives = Math.max(c.lives, ch.req.catLives); });
      if (ch.req && ch.req.curses) SB.run.U.addCard(run, 'curse_wet_sock', 'test');
      if ((ch.effects || []).some(e => e.op === 'evolveCard')) (ch.effects || []).filter(e => e.op === 'evolveCard').forEach(e => { if (SB.content.card(e.from)) SB.run.U.addCard(run, e.from, 'test'); });
      if ((ch.effects || []).some(e => e.op === 'removeCard' && e.mode === 'specific')) (ch.effects || []).filter(e => e.op === 'removeCard' && e.mode === 'specific').forEach(e => { if (SB.content.card(e.card)) SB.run.U.addCard(run, e.card, 'test'); });
      if ((ch.effects || []).some(e => e.op === 'removeCard' && e.curseOnly)) SB.run.U.addCard(run, 'curse_wet_sock', 'test');
      const opt = SB.event.options(run, ev)[ci];
      ok(opt.enabled, 'choice enabled after setup ' + ev.id + ':' + ci + ' ' + (opt.reqText || ''));
      const before = run.deck.length;
      const r = SB.event.choose(run, ev, ci, { auto: true });
      ok(r.ok, 'event choice resolves ' + ev.id + ':' + ci + ' ' + (r.reason || ''));
      ok(!DASH.test(r.text || ''), 'no dashes in result text');
      bump(COV.events, ev.id); bump(COV.eventChoices, ev.id + ':' + ci);
      if (r.fight) {
        ok(run.status === 'battle', 'event fight sets battle status');
        const rr = doBattle(run, R.rngFor('e', 'f', n), false);
        ok(rr === 'ok', 'event fight resolves');
      } else {
        SB.event.autoDrafts(run);
        R.leaveNode(run);
      }
      invariants(run);
    });
  });
});
// forced chains: flag set -> forced follow up chosen first in its act
['elder_student', 'roomba_met', 'kitten_adopted', 'gerald_debt'].forEach(flag => {
  const forced = evs.filter(e => e.forced && e.requires && e.requires.flag === flag);
  if (!forced.length) return;
  guard('forced ' + flag, () => {
    const act = forced[0].acts[0];
    const run = newTestRun(77, {});
    if (act > 1) R.startAct(run, act);
    run.flags[flag] = 60;
    run.current = { nodeId: 'x' };
    const e = SB.event.pick(run);
    ok(e && e.forced, 'forced follow up for ' + flag + ' is picked first (got ' + (e && e.id) + ')');
  });
});
// unmet requirement is greyed and refused
guard('unmet req', () => {
  const run = newTestRun(3, {}); run.fish = 0;
  const ev = evs.find(e => e.choices.some(c => c.req && c.req.fish));
  const idx = ev.choices.findIndex(c => c.req && c.req.fish);
  run.status = 'event'; run.current = { nodeId: 'x', eventId: ev.id };
  const o = SB.event.options(run, ev)[idx];
  ok(!o.enabled && o.reqText, 'unmet fish req greyed');
  ok(!SB.event.choose(run, ev, idx, { auto: true }).ok, 'unmet req refused');
});

/* ================================================================ rule spot checks */
guard('rules', () => {
  const run = newTestRun(0, { rank: 0 });
  ok(run.deck.length === 11, 'starting deck is 11 cards (got ' + run.deck.length + ')');
  ok(run.warmth === 40 && run.maxWarmth === 40, 'warmth starts 40/40 (' + run.warmth + '/' + run.maxWarmth + ')');
  ok(run.relics.length >= 1, 'starts with one heirloom relic');
  // fridge rule
  run.fish = 220; R.startAct(run, 2);
  ok(run.fish === 220 - Math.ceil(100 * 0.15), 'fridge rule act 2 (fish ' + run.fish + ')');
  // seeds: same seed same map
  const a = R.newRun({ seed: 'SAMESEED', clan: 'alley', side: 'hearth', noSave: true }), b = R.newRun({ seed: 'SAMESEED', clan: 'alley', side: 'hearth', noSave: true });
  ok(JSON.stringify(a.map) === JSON.stringify(b.map), 'same seed same map');
  ok(a.deck.map(c => c.id).join() === b.deck.map(c => c.id).join(), 'same seed same deck');
});
guard('no dashes in engine files', () => {
  ['map', 'rewards', 'run', 'shop', 'events-engine', 'post', 'nook', 'profile'].forEach(n => {
    const t = fs.readFileSync(path.join(root, 'src/engine', n + '.js'), 'utf8');
    ok(!DASH.test(t), 'no em or en dash in ' + n + '.js');
  });
  ok(!DASH.test(fs.readFileSync(__filename, 'utf8')), 'no dash in this test');
});
guard('profile', () => {
  const p = SB.profile.load();
  ok(p && p.level >= 1, 'profile loads');
  const rep = SB.profile.recordRun({ result: 'lost', rank: 0, nightsSurvived: 3, seed: 'TESTSEED' }, 1);
  ok(rep && rep.xp, 'profile records a run');
  ok(SB.profile.isUnlocked('clan', 'alley'), 'alley clan unlocked at start');
});

/* ================================================================ report */
const evtCovered = evs.filter(e => COV.events[e.id]).length;
const choiceTotal = evs.reduce((n, e) => n + e.choices.length, 0), choiceCovered = Object.keys(COV.eventChoices).length;
const NODE_TYPES = ['battle', 'night', 'elite', 'shop', 'event', 'post', 'nook', 'treasure', 'mystery', 'boss'];
console.log('\n=== RUN LAYER TEST REPORT ===');
console.log('maps: ' + mapCount + ' generated, ' + mapBad + ' invalid, ' + mapFallback + ' used the template fallback');
console.log('runs: ' + totalRuns + ' simulated, won ' + results.won + ', lost ' + results.lost + ', other ' + results.other);
console.log('node types entered: ' + NODE_TYPES.map(t => t + '=' + (COV.nodeTypes[t] || 0)).join(' '));
console.log('events: ' + evtCovered + '/' + evs.length + ' resolved, choices ' + choiceCovered + '/' + choiceTotal);
console.log('shop buys: ' + JSON.stringify(COV.shopBuys));
console.log('shop services: ' + JSON.stringify(COV.shopServices));
console.log('post: ' + JSON.stringify(COV.post));
console.log('nook: ' + JSON.stringify(COV.nook));
console.log('rewards: ' + JSON.stringify(COV.rewards) + ' champion tiers: ' + JSON.stringify(COV.champTiers));
console.log('acts reached: ' + JSON.stringify(COV.acts));
console.log('relics held at run end: ' + Object.keys(COV.relics).length + ' distinct');
const gaps = Object.keys(SB.event.gaps || {});
console.log('content gaps referenced by events (missing ids): ' + (gaps.length ? gaps.join(', ') : 'none'));
const gapsCov = [];
NODE_TYPES.forEach(t => { if (!COV.nodeTypes[t]) gapsCov.push('node type never entered: ' + t); });
evs.forEach(e => { if (!COV.events[e.id]) gapsCov.push('event never resolved: ' + e.id); });
['shoo', 'milk', 'reroll', 'haggle', 'sell', 'litter', 'boxSwap', 'whittle', 'knead', 'blackMarketBuy'].forEach(s => { if (!COV.shopServices[s]) gapsCov.push('shop service not exercised: ' + s); });
['card', 'relic', 'charm', 'stall', 'voucher', 'consumable'].forEach(s => { if (!COV.shopBuys[s]) gapsCov.push('shop item kind not bought: ' + s); });
['curl_up', 'knead', 'groom', 'lick_wounds', 'deep_sleep'].forEach(s => { if (!COV.nook[s]) gapsCov.push('nook option not picked: ' + s); });
['t1', 't2', 't3'].forEach(s => { if (!COV.champTiers[s]) gapsCov.push('champion tier not taken: ' + s); });
if (gapsCov.length) { console.log('coverage gaps:'); gapsCov.forEach(g => console.log('  - ' + g)); } else console.log('coverage gaps: none');
console.log('checks: ' + checks + ', failures: ' + failures);
Object.keys(failLog).sort((a, b) => failLog[b] - failLog[a]).slice(0, 40).forEach(k => console.log('FAIL x' + failLog[k] + '  ' + k));
process.exit(failures ? 1 : 0);
