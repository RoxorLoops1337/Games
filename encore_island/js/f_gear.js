'use strict';
// Encore Island — BUILD system: Gear (4 slots, rarities, perks, scrap + upgrades), Smelter recipes, Songs cast on perfect-beat kills.
// One feature ('gear', keep:true) with three Heroes tabs: Gear, Songs, Recipes. Everything is wrapped in an IIFE so no globals leak.
// Test hook: regFeature's object carries `api` (EI.FEATS.find(f => f.id === 'gear').api).
(function () {
  const SLOTS = [
    { id: 'mic', name: 'Mic', icon: 'mic', main: 'dmg', names: ['Karaoke Mic', 'Studio Mic', 'Disco Mic', 'Echo Mic'] },
    { id: 'shoe', name: 'Sneakers', icon: 'speed', main: 'speed', names: ['Hi-top Sneakers', 'Glitter Sneakers', 'Roller Skates', 'Dance Kicks'] },
    { id: 'outfit', name: 'Outfit', icon: 'hp', main: 'hp', names: ['Stage Jacket', 'Sequin Dress', 'Tour Hoodie', 'Star Cape'] },
    { id: 'charm', name: 'Charm', icon: 'star', main: 'coin', names: ['Lucky Pin', 'Heart Locket', 'Star Badge', 'Note Charm'] },
  ];
  const SLOT_IX = { mic: 0, shoe: 1, outfit: 2, charm: 3 };
  const RM = [1, 1.5, 2.2, 3.2], RP = [0.7, 1, 1.3, 1.7], RSCRAP = [6, 16, 40, 100], RCOST = [1, 1.5, 2.2, 3.2];
  const MAIN_BASE = { dmg: 0.10, speed: 0.06, hp: 0.12, coin: 0.10 };
  const MAX_UP = 10, BAG0 = 16;
  const STATS = { // perk pool: base value (fraction) and plain-language line
    dmg: { b: 0.06, t: v => '+' + pc(v) + '% damage' },
    rate: { b: 0.05, t: v => '+' + pc(v) + '% fire rate' },
    coin: { b: 0.06, t: v => '+' + pc(v) + '% coins' },
    hp: { b: 0.06, t: v => '+' + pc(v) + '% max health' },
    speed: { b: 0.04, t: v => '+' + pc(v) + '% move speed' },
    magnet: { b: 0.10, t: v => '+' + pc(v) + '% pickup range' },
    crit: { b: 0.02, t: v => '+' + pc(v) + '% crit chance' },
    critmult: { b: 0.15, t: v => '+' + v.toFixed(2) + 'x crit damage' },
    cap: { b: 1, t: v => '+' + v + ' carry slot' + (v > 1 ? 's' : '') },
    xp: { b: 0.08, t: v => '+' + pc(v) + '% XP' },
    vamp: { b: 0.004, t: v => '+' + pc(v) + '% health per kill' },
    groove: { b: 0.12, t: v => '+' + pc(v) + '% groove fill' },
  };
  const KEYS = Object.keys(STATS);
  const MAIN_KEYS = ['dmg', 'speed', 'hp', 'coin'];
  function pc(v) { const x = Math.round(v * 1000) / 10; return String(x); } // 0.0625 -> "6.3"
  function statLine(k, v) { return STATS[k].t(v); }

  const SONGS = [
    { id: 'heart', name: 'Heart Beat', icon: 'hp', col: ['#ff9ac8', '#e8407f'], sfx: 'pet', desc: L => 'Heals you for ' + (15 + 3 * (L - 1)) + '% of your health.' },
    { id: 'cash', name: 'Cash Cow', icon: 'coin', col: ['#ffe98a', '#f0b422'], sfx: 'coin', desc: L => 'A shower of coins, worth about ' + (20 + 10 * L) + ' kills of loot.' },
    { id: 'thunder', name: 'Thunder Clap', icon: 'boom', col: ['#ffb27a', '#e8601f'], sfx: 'boom', desc: L => 'A shockwave hits every creature near you for ' + (3 + L) + 'x your damage.' },
    { id: 'lullaby', name: 'Lullaby', icon: 'sound', col: ['#9ad8ff', '#4a8be0'], sfx: 'ui_open', desc: L => 'Creatures walk very slowly for ' + (4 + 0.5 * (L - 1)) + ' seconds.' },
    { id: 'magnet', name: 'Magnet Song', icon: 'magnet', col: ['#c6a8ff', '#8a5cf0'], sfx: 'pick', desc: L => 'Pulls all loot on the island to you for ' + (2 + 0.4 * (L - 1)).toFixed(1) + ' seconds.' },
    { id: 'rock', name: 'Rock Solid', icon: 'tower', col: ['#e6dcff', '#8a7ac0'], sfx: 'built', desc: L => 'A shield blocks all damage for ' + (3 + 0.5 * (L - 1)) + ' seconds.' },
    { id: 'encore', name: 'Encore Boost', icon: 'groove', col: ['#ff9ac8', '#9af0b4'], sfx: 'encore', desc: L => 'Fills ' + (2 + L) + ' notches of your groove bar at once.' },
    { id: 'frenzy', name: 'Fan Frenzy', icon: 'drums', col: ['#9af0b4', '#25a84f'], sfx: 'combo', desc: L => 'Your fighter fans sing twice as fast for ' + (6 + L) + ' seconds.' },
  ];
  const SONG_NEED = [6, 5, 4, 4, 3];
  const songDef = (id) => SONGS.find(s => s.id === id);
  const songNeed = (L) => SONG_NEED[Math.max(1, Math.min(5, L)) - 1];
  const SONG_GEMS = 10;

  const RECIPES = [
    { id: 'metro', name: 'Metronome Mix', perk: 'groove', hint: 'Defeat 100 creatures', test: () => S.stats.kills >= 100, prog: () => Math.min(100, S.stats.kills) + '/100' },
    { id: 'loud', name: 'Loud Mic Brew', perk: 'dmg', hint: 'Defeat 3 headliners', test: () => S.stats.bosses >= 3, prog: () => Math.min(3, S.stats.bosses) + '/3' },
    { id: 'rapid', name: 'Rapid Remix', perk: 'rate', hint: 'Smelt 50 bars at the Smelter', test: () => S.stats.crafted >= 50, prog: () => Math.min(50, S.stats.crafted) + '/50' },
    { id: 'treas', name: 'Treasure Tune', perk: 'coin', hint: 'Open 10 treasure chests', test: () => S.stats.chests >= 10, prog: () => Math.min(10, S.stats.chests) + '/10' },
    { id: 'fang', name: 'Fang Vinyl', perk: 'vamp', hint: 'Reach land 4', test: () => S.lands.length >= 4, prog: () => Math.min(4, S.lands.length) + '/4' },
    { id: 'step', name: 'Quick Step Stitch', perk: 'speed', hint: 'Defeat 500 creatures', test: () => S.stats.kills >= 500, prog: () => Math.min(500, S.stats.kills) + '/500' },
    { id: 'plush', name: 'Cozy Plush', perk: 'hp', hint: 'Land 200 perfect-beat kills', test: () => S.stats.perfect >= 200, prog: () => Math.min(200, S.stats.perfect) + '/200' },
    { id: 'spark', name: 'Spotlight Spark', perk: 'crit', hint: 'Reach land 8', test: () => S.lands.length >= 8, prog: () => Math.min(8, S.lands.length) + '/8' },
    { id: 'pass', name: 'Backstage Pass', perk: 'cap', hint: 'Defeat 15 headliners', test: () => S.stats.bosses >= 15, prog: () => Math.min(15, S.stats.bosses) + '/15' },
    { id: 'mate', name: "Bandmate's Brew", perk: 'xp', hint: 'Reach hero level 20', test: () => S.level >= 20, prog: () => Math.min(20, S.level) + '/20' },
  ];
  const REC_MIN_R = [1, 2, 3]; // chooseable minimum rarity: Rare, Epic, Legendary
  const recCost = (ri) => ({ coins: Math.ceil(helmVal(Math.max(1, S.lands.length)) * 220 * [1, 4, 16][ri]), scrap: [20, 60, 180][ri], beats: [15, 30, 60][ri] });

  // ---- state ----
  function initSt(st) {
    if (!st.inv) st.inv = [];
    if (!st.eq) st.eq = {};
    for (const s of SLOTS) if (st.eq[s.id] === undefined) st.eq[s.id] = null;
    if (st.scrap === undefined) st.scrap = 0;
    if (!st.seq) st.seq = 1;
    if (st.beats === undefined) st.beats = 0;
    if (!st.rec) st.rec = {};
    if (!st.songs) st.songs = {};
    if (!st.eqs) st.eqs = [null, null, null];
    if (st.charge === undefined) st.charge = 0;
    if (st.nx === undefined) st.nx = 0;
    if (st.sbuy === undefined) st.sbuy = '';
    if (!st.nw) st.nw = {};
    if (st.found === undefined) st.found = 0;
    if (st.cards === undefined) st.cards = 0;
    dirty = true;
  }
  const G = () => fs('gear');
  let dirty = true, cacheSt = null, SUM = null, pending = false, acc = 0;
  const T = { shield: 0, magnet: 0, frenzy: 0 }; // short song timers (not saved)
  const FLY = []; // cosmetic gems flying to the bag
  const CASTFX = { slot: -1, t: 9 };
  let sel = null; // {eq:true,s:'mic'} | {id}
  let recSel = {}, songSel = null;

  function mainKey(it) { return SLOTS[SLOT_IX[it.s]].main; }
  function lvF(lv) { return Math.min(Math.max(lv, 1), 40) - 1; }
  function mainVal(it) { const k = mainKey(it); return MAIN_BASE[k] * RM[it.r] * (1 + 0.03 * lvF(it.lv)) * (1 + 0.10 * it.up); }
  function itemStats(it) { const a = [[mainKey(it), mainVal(it)]]; for (const p of it.p) a.push(p); return a; }
  function mkSum() { return { dmg: 0, rate: 0, coin: 0, hp: 0, speed: 0, magnet: 0, crit: 0, critmult: 0, cap: 0, xp: 0, vamp: 0, groove: 0 }; }
  const ZERO = mkSum();
  function sums() {
    const st = S && S.feat && S.feat.gear;
    if (!st || !st.eq) return ZERO;
    if (!dirty && cacheSt === st) return SUM;
    SUM = mkSum(); cacheSt = st; dirty = false;
    for (const s of SLOTS) { const it = st.eq[s.id]; if (!it) continue; for (const [k, v] of itemStats(it)) SUM[k] += v; }
    return SUM;
  }
  regMod('dmg', () => 1 + sums().dmg);
  regMod('rate', () => 1 + sums().rate);
  regMod('coin', () => 1 + sums().coin);
  regMod('hp', () => 1 + sums().hp);
  regMod('speed', () => 1 + sums().speed);
  regMod('magnet', () => 1 + sums().magnet);
  regMod('xp', () => 1 + sums().xp);
  regMod('cap', () => sums().cap);
  regMod('crit', () => sums().crit);
  regMod('critmult', () => sums().critmult);

  // ---- item generation ----
  function rollRarity(L, rng, minR, bonus) {
    const l = Math.min(Math.max(L, 1), 30) - 1, b = bonus || 1;
    const w = [60 * Math.pow(0.93, l), 27 + 0.4 * l, (10 + 0.5 * l) * b, (3 + 0.25 * l) * b];
    for (let i = 0; i < (minR || 0); i++) w[i] = 0;
    let tot = 0; for (const x of w) tot += x;
    let x = rng() * tot; for (let i = 0; i < 4; i++) { x -= w[i]; if (x < 0) return i; }
    return Math.max(minR || 0, 0);
  }
  function perkVal(k, r, lv, rng) {
    if (k === 'cap') return r >= 2 ? 2 : 1;
    return Math.round(STATS[k].b * RP[r] * (0.8 + 0.4 * rng()) * (1 + 0.02 * lvF(lv)) * 10000) / 10000;
  }
  function rollItem(slot, r, lv, rng, force) {
    rng = rng || vrnd;
    const sIx = typeof slot === 'number' ? slot : SLOT_IX[slot], sl = SLOTS[sIx];
    const it = { id: 0, s: sl.id, r, lv: Math.max(1, lv | 0), up: 0, n: Math.floor(rng() * sl.names.length) % sl.names.length, p: [] };
    let cnt = r === 0 ? (rng() < 0.5 ? 0 : 1) : r === 1 ? 1 + (rng() < 0.4 ? 1 : 0) : r === 2 ? 2 + (rng() < 0.3 ? 1 : 0) : 3;
    if (force) cnt = Math.max(cnt, 1);
    const pool = KEYS.filter(k => k !== sl.main && k !== force);
    if (force && force !== sl.main) { it.p.push([force, perkVal(force, r, lv, rng)]); cnt--; }
    while (cnt-- > 0 && pool.length) { const i = Math.floor(rng() * pool.length) % pool.length, k = pool.splice(i, 1)[0]; it.p.push([k, perkVal(k, r, lv, rng)]); }
    return it;
  }
  const itemName = (it) => RARITY[it.r].name + ' ' + SLOTS[SLOT_IX[it.s]].names[it.n || 0];
  const bagCap = () => BAG0 + 4 * townTierIdx();
  const salvageVal = (it) => Math.ceil(RSCRAP[it.r] * (1 + 0.08 * lvF(it.lv)) + it.up * RSCRAP[it.r] * 0.4);
  const rank = (it) => it.r * 1e6 + it.lv * 100 + it.up;
  function upCost(it) { const n = it.up + 1; return { scrap: Math.ceil(RSCRAP[it.r] * 0.9 * Math.pow(n, 1.35)), coins: Math.ceil(helmVal(Math.max(1, S.lands.length)) * 150 * Math.pow(n, 1.7) * RCOST[it.r]) }; }
  function sortBag(st) { st.inv.sort((a, b) => rank(b) - rank(a)); }
  function bagUpgradeForEmpty() { const st = G(); for (const it of st.inv) if (!st.eq[it.s]) return true; return false; }

  // add to the bag (auto-salvaging the weakest if it is full). Returns the item or null when the new item itself was salvaged.
  function giveItem(it, x, y, silent) {
    const st = G(); it.id = st.seq++; st.found++;
    let kept = it;
    if (st.inv.length >= bagCap()) {
      let low = it; for (const o of st.inv) if (rank(o) < rank(low)) low = o;
      st.scrap += salvageVal(low);
      if (low === it) kept = null; else st.inv.splice(st.inv.indexOf(low), 1);
    }
    if (kept) { st.inv.push(kept); sortBag(st); st.nw.gear = 1; }
    if (!silent && x !== undefined && S.player) {
      FLY.push({ x0: x, y0: y, t: 0, r: it.r, s: SLOT_IX[it.s] }); if (FLY.length > 24) FLY.shift();
      if (it.r >= 2) { toast((it.r === 3 ? 'LEGENDARY ' : 'EPIC ') + SLOTS[SLOT_IX[it.s]].name + ' found!', 'gift'); sfx('gem', true); starBurst(x, y - 20, 14, [RARITY[it.r].col, '#fff4c0'], 260); }
      else sfx('pick');
    }
    return kept;
  }
  function dropGear(x, y, o) {
    o = o || {}; const L = Math.max(1, S.lands.length), rng = o.rng || vrnd;
    const r = rollRarity(L, rng, o.minR || 0, o.bonus);
    const it = rollItem(o.slot !== undefined ? o.slot : Math.floor(rng() * 4) % 4, r, L, rng);
    return giveItem(it, x, y, o.silent) || it;
  }
  function equip(id) {
    const st = G(), i = st.inv.findIndex(o => o.id === id); if (i < 0) return false;
    const it = st.inv.splice(i, 1)[0], prev = st.eq[it.s]; st.eq[it.s] = it; if (prev) { st.inv.push(prev); sortBag(st); }
    dirty = true; sel = { eq: true, s: it.s }; sfx('built', true);
    const p = S.player; p.maxHp = pMaxHp(); starBurst(p.x, p.y - 36, 10, [RARITY[it.r].col, '#fff4c0'], 200); ringFx(p.x, p.y - 10, 60, RARITY[it.r].col, 0.35);
    return true;
  }
  function unequip(s) {
    const st = G(), it = st.eq[s]; if (!it) return false;
    if (st.inv.length >= bagCap()) { toast('Your bag is full', 'lock'); sfx('hurt'); return false; }
    st.eq[s] = null; st.inv.push(it); sortBag(st); dirty = true; sel = { id: it.id }; sfx('ui_tap'); return true;
  }
  function salvage(id) {
    const st = G(), i = st.inv.findIndex(o => o.id === id); if (i < 0) return 0;
    const it = st.inv.splice(i, 1)[0], v = salvageVal(it); st.scrap += v; sel = null; sfx('smelt'); return v;
  }
  function upgrade(it) {
    if (!it || it.up >= MAX_UP) return false;
    const c = upCost(it), st = G();
    if (S.wallet < c.coins || st.scrap < c.scrap) { sfx('hurt'); return false; }
    S.wallet -= c.coins; st.scrap -= c.scrap; it.up++; dirty = true; sfx('unlock', true);
    const p = S.player; starBurst(p.x, p.y - 36, 12, [RARITY[it.r].col, '#ffe98a'], 220); S.player.maxHp = pMaxHp();
    return true;
  }
  function selItem() { const st = G(); if (!sel) return null; if (sel.eq) return st.eq[sel.s] || null; return st.inv.find(o => o.id === sel.id) || null; }

  // ---- recipes ----
  function checkRecipes() {
    if (!S.started) return;
    const st = G(); let n = 0, last = null;
    for (const r of RECIPES) if (!st.rec[r.id] && r.test()) { st.rec[r.id] = 1; n++; last = r; }
    if (n) { st.nw.rec = 1; toast(n > 1 ? n + ' new recipes!' : 'New recipe: ' + last.name, 'forge'); sfx('unlock', true); }
  }
  function craft(rid, slotIx, ri) {
    const st = G(), rc = RECIPES.find(r => r.id === rid); if (!rc || !st.rec[rid]) return null;
    const c = recCost(ri);
    if (S.wallet < c.coins || st.scrap < c.scrap || st.beats < c.beats) { sfx('hurt'); return null; }
    S.wallet -= c.coins; st.scrap -= c.scrap; st.beats -= c.beats;
    let r = REC_MIN_R[ri]; if (r < 3 && vrnd() < 0.2) r++;
    const it = rollItem(slotIx, r, Math.max(1, S.lands.length), vrnd, rc.perk);
    const kept = giveItem(it, undefined, undefined, true);
    sfx('smelt'); starBurst(FORGE.x, FORGE.y - 20, 18, ['#ffb640', '#ffe98a', RARITY[r].col], 280); puff(FORGE.x, FORGE.y - 10, '#ffb640', 8, true); ringFx(FORGE.x, FORGE.y - 10, 70, '#ffb640', 0.4);
    toast('Crafted ' + (kept ? itemName(it) : 'gear (bag full: salvaged)'), 'forge'); return it;
  }

  // ---- songs ----
  function songLvl(id) { return G().songs[id] || 0; }
  function giveSong(id, x, y, silent) {
    const st = G();
    if (!id) { // weigh unowned songs higher
      let tot = 0; const w = SONGS.map(s => { const x2 = st.songs[s.id] ? (st.songs[s.id] >= 5 ? 0.3 : 1) : 3; tot += x2; return x2; });
      let r = vrnd() * tot; id = SONGS[0].id; for (let i = 0; i < SONGS.length; i++) { r -= w[i]; if (r < 0) { id = SONGS[i].id; break; } }
    }
    const d = songDef(id), cur = st.songs[id] || 0; st.cards++;
    if (cur >= 5) { st.scrap += 30; if (!silent) float(S.player.x, S.player.y - 70, '+30 scrap', '#ffe98a', false); return id; }
    st.songs[id] = cur + 1; st.nw.song = 1;
    if (!cur) { const e = st.eqs.indexOf(null); if (e >= 0) st.eqs[e] = id; }
    if (!silent) {
      if (!cur) toast('New song: ' + d.name + '!', 'sound'); else float(S.player.x, S.player.y - 70, d.name + ' Lv' + (cur + 1), '#ff9ac8', true);
      sfx('levelup', true); if (x !== undefined) starBurst(x, y - 20, 10, d.col, 240);
    }
    return id;
  }
  function equipSong(id, slot) {
    const st = G(); if (!st.songs[id] || slot < 0 || slot > 2) return false;
    const o = st.eqs.indexOf(id); if (o >= 0) st.eqs[o] = st.eqs[slot];
    st.eqs[slot] = id; st.charge = 0; sfx('ui_tap'); return true;
  }
  function unequipSong(slot) { const st = G(); st.eqs[slot] = null; st.charge = 0; sfx('ui_tap'); }
  function nextSlot(from) { const st = G(); for (let i = 0; i < 3; i++) { const j = (from + i) % 3; if (st.eqs[j] && st.songs[st.eqs[j]]) return j; } return -1; }
  function castSong(slot) {
    const st = G(), id = st.eqs[slot]; if (!id) return false;
    const d = songDef(id), L = st.songs[id] || 1, p = S.player, lands = Math.max(1, S.lands.length);
    ringFx(p.x, p.y - 10, 150, d.col[0], 0.5); ringFx(p.x, p.y - 10, 90, '#fff4c0', 0.35); starBurst(p.x, p.y - 40, 14, [d.col[0], d.col[1], '#fff4c0'], 300);
    float(p.x, p.y - 84, d.name + '!', d.col[0], true); sfx(d.sfx, true); buzz(25);
    if (id === 'heart') { const h = p.maxHp * (0.15 + 0.03 * (L - 1)); p.hp = Math.min(p.maxHp, p.hp + h); float(p.x, p.y - 60, '+' + Math.ceil(h), '#9af0b4', false); }
    else if (id === 'cash') { const v = Math.ceil(helmVal(lands) * coinMul() * (20 + 10 * L)); S.wallet += v; S.stats.earned += v; float(p.x, p.y - 60, '+' + fmt(v), '#ffd94a', true); for (let i = 0; i < 10; i++) flyTo('coin', p.x + (vrnd() - 0.5) * 120, p.y - 150 - vrnd() * 60, p.x, p.y - 36, { delay: i * 0.05, dur: 0.45, arc: 20 }); }
    else if (id === 'thunder') { ringFx(p.x, p.y - 10, 380, '#ffb27a', 0.55); shake(8); const dmg = pDmg() * (3 + L), r2 = 380 * 380; for (const e of S.enemies) if (e.hp > 0 && dist2(e.x, e.y, p.x, p.y) < r2) hurtEnemy(e, dmg, true); }
    else if (id === 'lullaby') { const t = 4 + 0.5 * (L - 1); for (const e of S.enemies) if (e.hp > 0) { e.slowT = t; e._lx = e.x; e._ly = e.y; } }
    else if (id === 'magnet') T.magnet = 2 + 0.4 * (L - 1);
    else if (id === 'rock') T.shield = 3 + 0.5 * (L - 1);
    else if (id === 'encore') { if (!encoreOn()) { S.groove += 2 + L; S.grooveT = 4; if (S.groove >= GROOVE_NEED) startEncore(); } }
    else if (id === 'frenzy') T.frenzy = 6 + L;
    CASTFX.slot = slot; CASTFX.t = 0; S.stats.songCasts = (S.stats.songCasts || 0) + 1;
    return true;
  }
  function onPerfect() {
    const st = G(), cur = nextSlot(st.nx); if (cur < 0) return;
    if (cur !== st.nx) { st.nx = cur; st.charge = 0; }
    st.charge++;
    if (st.charge >= songNeed(st.songs[st.eqs[cur]])) { pending = true; }
  }

  // ---- events ----
  function onKill(e) {
    const st = G(); if (!st.eq || !S.started) return;
    const sm = sums(), p = S.player;
    if (sm.vamp > 0) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * sm.vamp);
    if (!e.boss) {
      const ch = e.elite ? 0.15 : e.gold ? 0.06 : 0.015;
      if (vrnd() < ch) dropGear(e.x, e.y, {});
      if (e.elite && vrnd() < 0.08) giveSong(null, e.x, e.y);
    }
    if (onBeatNow()) {
      st.beats++;
      if (sm.groove > 0 && !encoreOn()) { acc += sm.groove; while (acc >= 1) { acc -= 1; S.groove++; } }
      onPerfect();
    }
  }
  function onBoss(e) {
    dropGear(e.x, e.y, { minR: 1 }); if (vrnd() < 0.35) giveSong(null, e.x, e.y);
  }
  function onBossDrop(d) {
    if (!d || !d.variant) return; // regular headliners are covered by the core 'boss' event
    const x = d.x !== undefined ? d.x : S.player.x, y = d.y !== undefined ? d.y : S.player.y;
    dropGear(x, y, { minR: 1, bonus: 3 }); if (vrnd() < 0.5) giveSong(null, x, y);
  }
  function onChest(c) {
    const x = c && c.x !== undefined ? c.x : S.player.x, y = c && c.y !== undefined ? c.y : S.player.y;
    if (vrnd() < 0.2) dropGear(x, y, {}); if (vrnd() < 0.25) giveSong(null, x, y);
  }
  function onSecret(c) {
    const x = c && c.x !== undefined ? c.x : S.player.x, y = c && c.y !== undefined ? c.y : S.player.y;
    if (vrnd() < 0.8) dropGear(x, y, { minR: 1 }); if (vrnd() < 0.6) giveSong(null, x, y);
  }

  // ---- tick ----
  let recT = 0;
  function tick(dt) {
    const st = G(); if (!st.eq) return;
    const p = S.player;
    recT -= dt; if (recT <= 0) { recT = 1; checkRecipes(); }
    CASTFX.t += dt;
    if (pending) { pending = false; const cur = nextSlot(st.nx); if (cur >= 0) { castSong(cur); st.charge = 0; st.nx = nextSlot((cur + 1) % 3); if (st.nx < 0) st.nx = 0; } }
    if (T.shield > 0) { T.shield -= dt; if (p.invuln < 0.12) p.invuln = 0.12; }
    if (T.magnet > 0) { T.magnet -= dt; for (const it of S.items) { if (it.dead || it.t < 0.5) continue; const dx = p.x - it.x, dy = p.y - it.y, d = Math.hypot(dx, dy) || 1, s = Math.min(d, 1100 * dt); it.x += dx / d * s; it.y += dy / d * s; } }
    if (T.frenzy > 0) { T.frenzy -= dt; for (const f of S.pop) if (f.role === 'fight') f.cd -= dt; }
    for (const e of S.enemies) {
      if (!(e.slowT > 0)) { if (e._lx !== undefined) e._lx = undefined; continue; }
      e.slowT -= dt;
      if (e._lx !== undefined) { e.x = e._lx + (e.x - e._lx) * 0.4; e.y = e._ly + (e.y - e._ly) * 0.4; }
      e._lx = e.slowT > 0 ? e.x : undefined; e._ly = e.y;
    }
    for (let i = FLY.length - 1; i >= 0; i--) { FLY[i].t += dt; if (FLY[i].t > 0.7) FLY.splice(i, 1); }
  }

  // ---- drawing (world + hud) ----
  function gearIcon(s, r, x, y, rad, dim) {
    const c = RARITY[r].col; if (dim) ctx.globalAlpha = 0.5;
    disc(x, y, rad, mixc(c, '#ffffff', 0.55), mixc(c, '#2a1a5a', 0.3)); drawIcon(SLOTS[s].icon, x, y, rad * 1.3);
    if (r === 3) { const a = 0.5 + 0.5 * Math.sin(S.t * 5 + s); ctx.fillStyle = 'rgba(255,255,255,' + a + ')'; spark(x + rad * 0.6, y - rad * 0.6, rad * 0.35, a); }
    ctx.globalAlpha = 1;
  }
  function spark(x, y, r, a) { ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.28, y - r * 0.28); ctx.lineTo(x + r, y); ctx.lineTo(x + r * 0.28, y + r * 0.28); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.28, y + r * 0.28); ctx.lineTo(x - r, y); ctx.lineTo(x - r * 0.28, y - r * 0.28); ctx.closePath(); ctx.fill(); }
  function drawWorld() {
    const p = S.player;
    if (T.shield > 0) { const a = Math.min(1, T.shield) * (0.35 + 0.1 * Math.sin(S.t * 10)); ctx.strokeStyle = 'rgba(230,220,255,' + a + ')'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(p.x, p.y - 30, 48, 0, TAU); ctx.stroke(); ctx.fillStyle = 'rgba(198,168,255,' + a * 0.3 + ')'; ctx.fill(); }
    if (S.enemies.length) for (const e of S.enemies) if (e.slowT > 0 && vis(e.x, e.y, 40)) { ctx.strokeStyle = 'rgba(154,216,255,0.7)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(e.x, e.y + 4, e.r + 6, (e.r + 6) * 0.45, 0, 0, TAU); ctx.stroke(); }
    for (const f of FLY) {
      const e = Math.min(1, f.t / 0.6), k = easeOut(e), x = f.x0 + (p.x - f.x0) * k, y = f.y0 + (p.y - 40 - f.y0) * k - Math.sin(e * Math.PI) * 50, sc = 1 - 0.5 * e;
      gearIcon(f.s, f.r, x, y, 13 * sc, false);
    }
  }
  function songPip(x, y, i, st) {
    const id = st.eqs[i], d = id && songDef(id), cur = nextSlot(st.nx), r = 17;
    if (!d || !st.songs[id]) { ctx.strokeStyle = 'rgba(230,220,255,0.45)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r - 1, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = 'rgba(230,220,255,0.55)'; ctx.font = font(16); ctx.textAlign = 'center'; ctx.fillText('+', x, y + 6); return; }
    const L = st.songs[id], isNext = i === cur, f = isNext ? Math.min(1, st.charge / songNeed(L)) : 0, ready = isNext && f >= 1;
    const pop = CASTFX.slot === i && CASTFX.t < 0.5 ? 1 + 0.35 * (1 - CASTFX.t / 0.5) : 1;
    ctx.save(); ctx.translate(x, y); ctx.scale(pop, pop);
    ctx.globalAlpha = isNext ? 1 : 0.62; disc(0, 0, r - 3, d.col[0], d.col[1]); drawIcon(d.icon, 0, 0, 20); ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(20,10,50,0.7)'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
    if (isNext && f > 0) { ctx.strokeStyle = ready ? '#fff4c0' : '#ffe98a'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + f * TAU); ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = '#fff'; ctx.font = font(8); ctx.textAlign = 'center'; ctx.fillText('Lv' + L, x, y + r + 8);
  }
  function drawHud() {
    if (!S.started || S.sheet || S.modal || S.cards) return;
    const st = G(); if (!st.eqs) return;
    if (!st.eqs.some(Boolean) && !Object.keys(st.songs).length) return;
    const dockY = vh - DOCK_H - 6, y = dockY - 32 - 30, gap = 42, x0 = vw / 2 - gap;
    for (let i = 0; i < 3; i++) songPip(x0 + i * gap, y, i, st);
    hitRect(x0 - 24, y - 24, gap * 2 + 48, 48, () => openSheet('heroes', 'songs'));
  }

  // ---- UI ----
  function btn(x, y, w, h, label, sub, on, kind, act) {
    cbtn(x, y, w, h, on, kind); ctx.textAlign = 'center'; ctx.fillStyle = on ? (kind === 'gold' ? '#3a2410' : '#fff') : '#cfc6ee';
    ctx.font = font(sub ? 12 : 14); ctx.fillText(label, x + w / 2, y + (sub ? 17 : h / 2 + 5));
    if (sub) sub(x + w / 2, y + h - 9);
    chit(x, y, w, h, act);
  }
  const scrapDraw = (x, y, s) => drawIcon('gear', x, y, s + 2);
  function costLine(cx, y, coins, scrap, okC, okS, col) {
    ctx.font = font(11); const t1 = fmt(coins), t2 = fmt(scrap), w1 = ctx.measureText(t1).width, w2 = ctx.measureText(t2).width, tot = 14 + w1 + 10 + 14 + w2 + 6, x0 = cx - tot / 2;
    drawIcon('coin', x0 + 7, y - 4, 16); ctx.textAlign = 'left'; ctx.fillStyle = okC ? col : '#ff9a8a'; ctx.fillText(t1, x0 + 16, y);
    drawIcon('gear', x0 + 16 + w1 + 17, y - 4, 16); ctx.fillStyle = okS ? col : '#ff9a8a'; ctx.fillText(t2, x0 + 16 + w1 + 26, y);
  }
  function slotBox(x, y, s, st, isSel) {
    const w = 58, it = st.eq[s.id], si = SLOT_IX[s.id];
    ctx.fillStyle = HV.line; rr(x - 2, y - 2, w + 4, w + 4, 14); ctx.fill();
    ctx.fillStyle = it ? mixc(RARITY[it.r].col, '#1d1450', 0.72) : 'rgba(255,255,255,0.1)'; rr(x, y, w, w, 12); ctx.fill();
    ctx.strokeStyle = isSel ? '#fff4c0' : it ? RARITY[it.r].col : 'rgba(255,255,255,0.3)'; ctx.lineWidth = isSel ? 4 : 2.5; rr(x, y, w, w, 12); ctx.stroke();
    if (it) { gearIcon(si, it.r, x + w / 2, y + w / 2 - 2, 19); if (it.up) { ctx.fillStyle = '#ffe98a'; ctx.font = font(10); ctx.textAlign = 'right'; ctx.fillText('+' + it.up, x + w - 4, y + 13); } }
    else { ctx.globalAlpha = 0.35; drawIcon(s.icon, x + w / 2, y + w / 2 - 2, 30); ctx.globalAlpha = 1; }
    ctx.fillStyle = '#e6dcff'; ctx.font = font(10); ctx.textAlign = 'center'; ctx.fillText(s.name, x + w / 2, y + w + 13);
    chit(x - 4, y - 4, w + 8, w + 22, () => { sel = it ? { eq: true, s: s.id } : null; sfx('ui_tap'); });
  }
  function fmtD(k, d) { const a = Math.abs(d), sg = d > 0 ? '+' : '-'; if (k === 'cap') return sg + Math.round(a); if (k === 'critmult') return sg + a.toFixed(2) + 'x'; return sg + pc(a) + '%'; }
  function inspect(y, cw) {
    const it = selItem(); if (!it) { sel = null; return y; }
    const st = G(), isEq = !!sel.eq, cur = isEq ? null : st.eq[it.s], mine = itemStats(it), other = cur ? itemStats(cur) : [];
    const keys = mine.map(a => a[0]); for (const [k] of other) if (!keys.includes(k)) keys.push(k);
    const h = 66 + keys.length * 19 + 8 + 108, col = RARITY[it.r].col;
    plaque(2, y, cw - 4, h, 14); ctx.strokeStyle = col; ctx.lineWidth = 3; rr(2, y, cw - 4, h, 14); ctx.stroke();
    gearIcon(SLOT_IX[it.s], it.r, 38, y + 34, 22);
    ctx.textAlign = 'left'; ctx.fillStyle = col; ctx.font = font(14); ctx.fillText(itemName(it), 70, y + 26);
    ctx.fillStyle = '#cfc6ee'; ctx.font = font(11, false); ctx.fillText(RARITY[it.r].name + ' ' + SLOTS[SLOT_IX[it.s]].name + '  ·  found in land ' + it.lv + (it.up ? '  ·  upgraded +' + it.up : ''), 70, y + 44);
    if (isEq) { ctx.textAlign = 'right'; ctx.fillStyle = '#9af0b4'; ctx.font = font(11); ctx.fillText('EQUIPPED', cw - 14, y + 26); }
    let ly = y + 70;
    ctx.font = font(12);
    for (const k of keys) {
      const a = mine.find(m => m[0] === k), b = other.find(m => m[0] === k), v = a ? a[1] : 0;
      ctx.textAlign = 'left'; ctx.fillStyle = a ? (k === mainKey(it) ? '#ffe98a' : '#fff') : '#8a7ab0'; ctx.font = font(12);
      ctx.fillText(a ? statLine(k, v) : statLine(k, b[1]).replace('+', 'lose '), 16, ly);
      if (!isEq && cur) { const d = v - (b ? b[1] : 0); if (Math.abs(d) > 1e-9) { ctx.textAlign = 'right'; ctx.fillStyle = d > 0 ? '#9af0b4' : '#ff8a8a'; ctx.font = font(11); ctx.fillText((d > 0 ? '▲ ' : '▼ ') + fmtD(k, d), cw - 14, ly); } }
      ly += 19;
    }
    if (!isEq && !cur) { ctx.textAlign = 'right'; ctx.fillStyle = '#9af0b4'; ctx.font = font(11); ctx.fillText('empty slot: all new', cw - 14, y + 70 + 0); }
    ly += 2; const bw = (cw - 4 - 24) / 2;
    if (!isEq) {
      btn(8, ly, bw, 44, 'EQUIP', null, true, 'go', () => equip(it.id));
      const sv = salvageVal(it); btn(16 + bw, ly, bw, 44, 'SALVAGE', (x, yy) => { ctx.font = font(11); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText('+' + sv + ' scrap', x, yy); }, true, 'red', () => salvage(it.id));
      ly += 52;
    } else { btn(8, ly, cw - 20, 44, 'UNEQUIP', null, st.inv.length < bagCap(), 'violet', () => unequip(it.s)); ly += 52; }
    if (it.up >= MAX_UP) { ctx.textAlign = 'center'; ctx.fillStyle = '#ffd94a'; ctx.font = font(12); ctx.fillText('MAX UPGRADE', cw / 2, ly + 22); }
    else {
      const c = upCost(it), ok = S.wallet >= c.coins && st.scrap >= c.scrap, nv = (mainVal({ s: it.s, r: it.r, lv: it.lv, up: it.up + 1 }) - mainVal(it));
      btn(8, ly, cw - 20, 48, 'UPGRADE to +' + (it.up + 1) + '  (' + fmtD(mainKey(it), nv) + ' ' + mainKey(it).replace('dmg', 'damage').replace('hp', 'health').replace('speed', 'speed').replace('coin', 'coins') + ')', (x, yy) => costLine(x, yy, c.coins, c.scrap, S.wallet >= c.coins, st.scrap >= c.scrap, ok ? '#3a2410' : '#cfc6ee'), ok, 'gold', () => upgrade(it));
    }
    return y + h + 8;
  }
  function gearTab(cw) {
    const st = G(); st.nw.gear = 0; let y = 4;
    if (!st.eq) return 40;
    // paperdoll
    rowCard(y, 176, cw);
    const cx = cw / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.beginPath(); ctx.ellipse(cx, y + 138, 58, 16, 0, 0, TAU); ctx.fill();
    artDraw(activeSkin().art, 'idle', (S.t * 4) | 0, cx, y + 140, 0.5, false);
    slotBox(16, y + 10, SLOTS[0], st, sel && sel.eq && sel.s === 'mic'); slotBox(16, y + 94, SLOTS[2], st, sel && sel.eq && sel.s === 'outfit');
    slotBox(cw - 74, y + 10, SLOTS[1], st, sel && sel.eq && sel.s === 'shoe'); slotBox(cw - 74, y + 94, SLOTS[3], st, sel && sel.eq && sel.s === 'charm');
    y += 184;
    const sm = sums(), parts = []; for (const k of KEYS) if (sm[k] > 0) parts.push(statLine(k, sm[k]).replace('+', '').replace(/^(\d)/, '+$1'));
    y = note(y, cw, parts.length ? 'Your gear gives: ' + parts.join(', ') + '.' : 'Equip gear to get stronger. Better rarity means stronger perks.', parts.length ? '#9af0b4' : '#cfc6ee');
    y = inspect(y + 2, cw);
    const cap = bagCap();
    ctx.fillStyle = '#e6dcff'; ctx.font = font(12); ctx.textAlign = 'left'; ctx.fillText('BAG  ' + st.inv.length + '/' + cap, 6, y + 14);
    ctx.textAlign = 'right'; ctx.fillStyle = '#ffe98a'; ctx.fillText(fmt(st.scrap) + ' scrap', cw - 8, y + 14); drawIcon('gear', cw - 16 - ctx.measureText(fmt(st.scrap) + ' scrap').width - 8, y + 10, 18); y += 24;
    if (!st.inv.length) return note(y, cw, 'Your bag is empty. Creatures, headliners and chests drop gear. Salvage extras for scrap, then upgrade your best pieces.') + 6;
    const cols = 4, w = (cw - 4 - 8 * (cols - 1)) / cols, h = 74;
    st.inv.forEach((it, i) => {
      const x = 2 + (i % cols) * (w + 8), yy = y + Math.floor(i / cols) * (h + 8), on = sel && !sel.eq && sel.id === it.id, col = RARITY[it.r].col;
      ctx.fillStyle = HV.line; rr(x - 2, yy - 2, w + 4, h + 4, 14); ctx.fill(); ctx.fillStyle = mixc(col, '#1d1450', 0.78); rr(x, yy, w, h, 12); ctx.fill();
      ctx.strokeStyle = on ? '#fff4c0' : col; ctx.lineWidth = on ? 4 : 2.5; rr(x, yy, w, h, 12); ctx.stroke();
      gearIcon(SLOT_IX[it.s], it.r, x + w / 2, yy + 28, 19);
      const better = !st.eq[it.s]; if (better) { ctx.fillStyle = '#9af0b4'; ctx.beginPath(); ctx.arc(x + w - 9, yy + 9, 5, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#fff'; ctx.font = font(10); ctx.textAlign = 'center'; ctx.fillText('Lv ' + it.lv + (it.up ? '  +' + it.up : ''), x + w / 2, yy + 62);
      chit(x, yy, w, h, () => { sel = on ? null : { id: it.id }; sfx('ui_tap'); });
    });
    y += Math.ceil(st.inv.length / cols) * (h + 8);
    return note(y, cw, 'Tap a piece to inspect it. A green dot means that slot is empty.') + 6;
  }

  function songsTab(cw) {
    const st = G(); st.nw.song = 0; let y = 4; if (!st.eqs) return 40;
    y = section(y, 'Your 3 songs  ·  they play in this order');
    const w = (cw - 4 - 16) / 3;
    for (let i = 0; i < 3; i++) {
      const x = 2 + i * (w + 8), id = st.eqs[i], d = id && songDef(id), L = id ? st.songs[id] : 0;
      plaque(x, y, w, 104, 14); if (songSel && songSel.slot === i) { ctx.strokeStyle = '#fff4c0'; ctx.lineWidth = 3; rr(x, y, w, 104, 14); ctx.stroke(); }
      if (d) { disc(x + w / 2, y + 34, 24, d.col[0], d.col[1]); drawIcon(d.icon, x + w / 2, y + 34, 32); ctx.fillStyle = '#fff'; ctx.font = font(12); ctx.textAlign = 'center'; ctx.fillText(d.name, x + w / 2, y + 76); ctx.fillStyle = '#ffd94a'; ctx.font = font(10); ctx.fillText('Lv ' + L + '  ·  every ' + songNeed(L), x + w / 2, y + 92); }
      else { ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = font(12); ctx.textAlign = 'center'; ctx.fillText('Slot ' + (i + 1), x + w / 2, y + 40); ctx.font = font(10, false); ctx.fillText('empty', x + w / 2, y + 58); }
      chit(x, y, w, 104, () => { songSel = d ? { id, slot: i } : { slot: i }; sfx('ui_tap'); });
    }
    y += 112;
    // detail / equip panel
    const sid = songSel && songSel.id;
    if (sid && st.songs[sid]) {
      const d = songDef(sid), L = st.songs[sid], h = 126;
      plaque(2, y, cw - 4, h, 14); disc(34, y + 32, 22, d.col[0], d.col[1]); drawIcon(d.icon, 34, y + 32, 30);
      ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = font(14); ctx.fillText(d.name + '  Lv ' + L, 66, y + 24);
      ctx.fillStyle = '#cfc6ee'; ctx.font = font(11, false); wrapText(d.desc(L), 66, y + 42, cw - 84, 14);
      ctx.fillStyle = '#ff9ac8'; ctx.font = font(11); ctx.fillText('Casts after ' + songNeed(L) + ' perfect-beat kills' + (L < 5 ? '  (next level: ' + songNeed(L + 1) + ')' : ''), 66, y + 76);
      const bw = (cw - 4 - 32) / 4;
      for (let i = 0; i < 3; i++) { const on = st.eqs[i] === sid; btn(8 + i * (bw + 4), y + 82, bw, 40, on ? 'Slot ' + (i + 1) + ' ✓' : 'Slot ' + (i + 1), null, true, on ? 'gold' : 'violet', () => equipSong(sid, i)); }
      btn(8 + 3 * (bw + 4), y + 82, bw, 40, 'Remove', null, st.eqs.includes(sid), 'red', () => { const s = st.eqs.indexOf(sid); if (s >= 0) unequipSong(s); });
      y += h + 8;
    } else if (songSel && songSel.slot !== undefined) y = note(y, cw, 'Tap a song below, then press the slot button to put it in a slot.') + 2;
    else y = note(y, cw, 'Songs cast themselves when you land perfect-beat kills (the PERFECT pop-up). Each song plays in turn.') + 2;
    // daily buy
    const bought = st.sbuy === dayStr(), canB = !bought && S.gems >= SONG_GEMS;
    cbtn(2, y, cw - 4, 50, canB, 'violet'); ctx.textAlign = 'center'; ctx.fillStyle = canB ? '#fff' : '#cfc6ee'; ctx.font = font(14);
    ctx.fillText(bought ? 'Come back tomorrow for another card' : 'BUY A SONG CARD  (once a day)', cw / 2, y + 22);
    if (!bought) iconText(cw / 2, y + 42, (gx, gy) => drawGemIcon(gx, gy + 4, 0.7), String(SONG_GEMS), canB ? '#fff' : '#cfc6ee', 13);
    chit(2, y, cw - 4, 50, () => { if (!canB) { sfx('hurt'); return; } S.gems -= SONG_GEMS; st.sbuy = dayStr(); giveSong(null, S.player.x, S.player.y); });
    y += 60;
    const owned = SONGS.filter(s => st.songs[s.id]).length;
    y = section(y, 'Collection ' + owned + '/' + SONGS.length + '  ·  duplicate cards level a song up to 5');
    const cols = 4, cw2 = (cw - 4 - 8 * (cols - 1)) / cols, ch = 92;
    SONGS.forEach((s, i) => {
      const x = 2 + (i % cols) * (cw2 + 8), yy = y + Math.floor(i / cols) * (ch + 8), L = st.songs[s.id] || 0, on = songSel && songSel.id === s.id;
      ctx.fillStyle = HV.line; rr(x - 2, yy - 2, cw2 + 4, ch + 4, 14); ctx.fill(); ctx.fillStyle = L ? '#2d2068' : 'rgba(255,255,255,0.08)'; rr(x, yy, cw2, ch, 12); ctx.fill();
      ctx.strokeStyle = on ? '#fff4c0' : L ? s.col[0] : 'rgba(255,255,255,0.2)'; ctx.lineWidth = on ? 4 : 2; rr(x, yy, cw2, ch, 12); ctx.stroke();
      if (L) { disc(x + cw2 / 2, yy + 28, 19, s.col[0], s.col[1]); drawIcon(s.icon, x + cw2 / 2, yy + 28, 26); }
      else { ctx.globalAlpha = 0.5; disc(x + cw2 / 2, yy + 28, 19, '#4a3d80', '#2a2060'); drawIcon('lock', x + cw2 / 2, yy + 28, 22); ctx.globalAlpha = 1; }
      ctx.textAlign = 'center'; ctx.fillStyle = L ? '#fff' : '#8a7ab0'; ctx.font = font(9); ctx.fillText(L ? s.name : '???', x + cw2 / 2, yy + 64);
      if (L) { for (let k = 0; k < 5; k++) { ctx.fillStyle = k < L ? '#ffd94a' : 'rgba(255,255,255,0.18)'; rr(x + cw2 / 2 - 24 + k * 10, yy + 72, 8, 7, 3); ctx.fill(); } if (st.eqs.includes(s.id)) { ctx.fillStyle = '#9af0b4'; ctx.beginPath(); ctx.arc(x + cw2 - 9, yy + 9, 5, 0, TAU); ctx.fill(); } }
      else { ctx.fillStyle = '#8a7ab0'; ctx.font = font(8, false); ctx.fillText('not found', x + cw2 / 2, yy + 78); }
      if (L) chit(x, yy, cw2, ch, () => { const slot = songSel && songSel.slot !== undefined ? songSel.slot : -1; songSel = { id: s.id }; sfx('ui_tap'); if (slot >= 0 && !st.eqs[slot]) equipSong(s.id, slot); });
    });
    y += Math.ceil(SONGS.length / cols) * (ch + 8);
    return note(y, cw, 'Find song cards from headliners, chests and secrets. Green dot = equipped.') + 6;
  }

  function recipesTab(cw) {
    const st = G(); st.nw.rec = 0; let y = 4; if (!st.eq) return 40;
    rowCard(y, 46, cw); ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = font(13); ctx.fillText('Smelter recipe book', 14, y + 20);
    ctx.fillStyle = '#cfc6ee'; ctx.font = font(10, false); ctx.fillText('Craft gear with a guaranteed perk. Costs coins, scrap and Perfect Beats.', 14, y + 36);
    y += 54;
    ctx.font = font(12); const t1 = fmt(st.scrap) + ' scrap', t2 = st.beats + ' perfect beats';
    ctx.textAlign = 'left'; ctx.fillStyle = '#ffe98a'; drawIcon('gear', 14, y + 8, 18); ctx.fillText(t1, 26, y + 13); ctx.fillStyle = '#ff9ac8'; drawIcon('groove', cw / 2 + 4, y + 8, 18); ctx.fillText(t2, cw / 2 + 16, y + 13);
    y += 26;
    for (const rc of RECIPES) {
      const un = !!st.rec[rc.id];
      if (!un) {
        rowCard(y, 58, cw); ctx.globalAlpha = 0.5; disc(30, y + 29, 20, '#5a4a98', '#33256f'); drawIcon('lock', 30, y + 29, 24); ctx.globalAlpha = 1;
        ctx.textAlign = 'left'; ctx.fillStyle = '#8a7ab0'; ctx.font = font(13); ctx.fillText(rc.name, 62, y + 24); ctx.fillStyle = '#cfc6ee'; ctx.font = font(11, false); ctx.fillText('Unlock: ' + rc.hint.toLowerCase() + '  (' + rc.prog() + ')', 62, y + 43);
        y += 64; continue;
      }
      const sv = recSel[rc.id] || (recSel[rc.id] = { s: 0, r: 0 }), c = recCost(sv.r), ok = S.wallet >= c.coins && st.scrap >= c.scrap && st.beats >= c.beats;
      rowCard(y, 190, cw); disc(30, y + 29, 20, '#ffb640', '#c8601f'); drawIcon('forge', 30, y + 29, 26);
      ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = font(14); ctx.fillText(rc.name, 62, y + 24); ctx.fillStyle = '#9af0b4'; ctx.font = font(11); ctx.fillText('Always has: ' + statLine(rc.perk, perkVal(rc.perk, REC_MIN_R[sv.r], Math.max(1, S.lands.length), () => 0.5)), 62, y + 43);
      const cwid = (cw - 4 - 16 - 12) / 4;
      for (let i = 0; i < 4; i++) { const x = 10 + i * (cwid + 4), on = sv.s === i; pill(x, y + 58, cwid, 34, on ? '#ffe98a' : '#6a5aa8', on ? '#f0b422' : '#3e3076'); drawIcon(SLOTS[i].icon, x + 16, y + 75, 22); ctx.fillStyle = on ? '#3a2410' : '#e6dcff'; ctx.font = font(10); ctx.textAlign = 'left'; ctx.fillText((i === 1 ? 'Shoes' : SLOTS[i].name), x + 29, y + 79); chit(x, y + 58, cwid, 34, () => { sv.s = i; sfx('ui_tap'); }); }
      const rw = (cw - 4 - 16 - 8) / 3;
      for (let i = 0; i < 3; i++) { const x = 10 + i * (rw + 4), on = sv.r === i, col = RARITY[REC_MIN_R[i]].col; pill(x, y + 98, rw, 34, on ? col : '#4a3d88', on ? mixc(col, '#2a1a5a', 0.4) : '#2e2368'); ctx.fillStyle = on ? '#fff' : '#cfc6ee'; ctx.font = font(11); ctx.textAlign = 'center'; ctx.fillText(RARITY[REC_MIN_R[i]].name + (i < 2 ? '+' : ''), x + rw / 2, y + 119); chit(x, y + 98, rw, 34, () => { sv.r = i; sfx('ui_tap'); }); }
      ctx.font = font(11); ctx.textAlign = 'center'; const parts = [[fmt(c.coins), S.wallet >= c.coins, 'coin'], [fmt(c.scrap), st.scrap >= c.scrap, 'gear'], [c.beats + '', st.beats >= c.beats, 'groove']];
      let tw = 0; for (const p of parts) tw += ctx.measureText(p[0]).width + 28; let px = cw / 2 - tw / 2; ctx.textAlign = 'left';
      for (const p of parts) { drawIcon(p[2], px + 8, y + 144, 16); ctx.fillStyle = p[1] ? '#fff' : '#ff9a8a'; ctx.fillText(p[0], px + 18, y + 148); px += ctx.measureText(p[0]).width + 28; }
      btn(8, y + 152, cw - 20, 34, 'CRAFT', null, ok, 'gold', () => { craft(rc.id, sv.s, sv.r); });
      y += 198;
    }
    return note(y, cw, 'New recipes unlock as you play. Perfect Beats are earned by landing kills right on the beat.') + 6;
  }

  regTab('heroes', 'gear', 'Gear', gearTab);
  regTab('heroes', 'songs', 'Songs', songsTab);
  regTab('heroes', 'recipes', 'Recipes', recipesTab);

  const api = { SLOTS, SONGS, RECIPES, rollItem, rollRarity, dropGear, giveItem, equip, unequip, salvage, upgrade, upCost, mainVal, itemStats, sums, craft, recCost, giveSong, equipSong, castSong, songNeed, checkRecipes, bagCap, salvageVal, itemName, onKill, onPerfect, tick, T, get pending() { return pending; }, set pending(v) { pending = v; }, markDirty() { dirty = true; }, select(s) { sel = s; }, bagUpgradeForEmpty };
  regFeature({
    id: 'gear', keep: true, api,
    init(st) { initSt(st); },
    onLoad() { dirty = true; T.shield = T.magnet = T.frenzy = 0; pending = false; FLY.length = 0; sel = null; songSel = null; },
    onTour() { dirty = true; T.shield = T.magnet = T.frenzy = 0; pending = false; FLY.length = 0; sel = null; },
    tick, drawWorld, drawHud,
    on: { kill: onKill, boss: onBoss, bossDrop: onBossDrop, chest: onChest, secret: onSecret },
    pips() { const st = S.feat && S.feat.gear; if (!st || !st.nw) return null; return { heroes: !!(st.nw.gear || st.nw.rec || st.nw.song) }; },
  });

  // ---- tutorial ----
  if (typeof tutAdd === 'function') {
    const has = () => { const st = S.feat && S.feat.gear; return st && st.inv; };
    tutAdd({ id: 'gear_first', order: 2000, when: () => has() && (S.feat.gear.found > 0), title: 'You found gear!', text: 'Open Heroes, then Gear, to equip it. Better rarity means stronger perks.', icon: 'gift', sheet: 'heroes', tab: 'gear', target: () => null });
    tutAdd({ id: 'gear_empty', order: 2100, when: () => has() && S.feat.gear.found > 1 && bagUpgradeForEmpty(), title: 'Free slot!', text: 'You have gear for an empty slot. Open Heroes, Gear, tap it and press Equip.', icon: 'star', target: () => null });
    tutAdd({ id: 'gear_recipe', order: 2200, when: () => has() && Object.keys(S.feat.gear.rec).length > 0, title: 'New recipe!', text: 'The Smelter recipe book lets you craft gear with a guaranteed perk. Open Heroes, then Recipes.', icon: 'forge', sheet: 'heroes', tab: 'recipes', target: () => null });
    tutAdd({ id: 'gear_song', order: 2300, when: () => has() && S.feat.gear.cards > 0, title: 'A song card!', text: 'Songs cast themselves when you land perfect-beat kills. Equip 3 in Heroes, then Songs.', icon: 'sound', sheet: 'heroes', tab: 'songs', target: () => null });
  }
  if (typeof tutHelp === 'function') {
    tutHelp('help_gear', 'Gear & rarity', 'Creatures, headliners and chests drop gear: Mic, Sneakers, Outfit and Charm. Rarer gear (Common, Rare, Epic, Legendary) has a bigger main bonus and more perks. Equip it in Heroes, then Gear.', 'gift');
    tutHelp('help_salvage', 'Salvage & upgrade', 'Salvage gear you do not need to get scrap. Spend scrap and coins to upgrade a piece up to +10 and boost its main bonus. A full bag salvages the weakest piece for you.', 'gear');
    tutHelp('help_recipes', 'Smelter recipes', 'Recipes unlock as you play. Each crafts one gear piece with a perk it always has. Pick the slot and the lowest rarity. It costs coins, scrap and Perfect Beats (kills landed right on the beat).', 'forge');
    tutHelp('help_songs', 'Songs', 'Equip up to 3 songs in Heroes, then Songs. Every few perfect-beat kills, the next song plays by itself. The ring under your groove bar shows its charge. Duplicate cards level a song up to 5.', 'sound');
  }
})();
