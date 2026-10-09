'use strict';
// Encore Island — Crew feature: fan CAREERS (specialists) + TOWN DISTRICTS (Market, Arena, Studio).
// Everything lives in an IIFE (no global-name clashes). State = S.feat.crew (resets on Encore Tour); careers live on the fans (f.spec, saved by the core).
//
// HONEST NOTES ON HOW EACH EFFECT IS DONE (the Town helpers fanCarryCap/fanSpeed/merchMul are `const` arrows in town.js, so they cannot be
// re-assigned; function declarations can). So this file wraps the *function declarations* tickFans, sellToVault, tickSell and hurtPlayer:
//  - Roadie   : +6 carry is enforced by sending a full roadie back to collecting until it holds cap+6; +35% walk speed is a small extra step along
//               the move the core just made. (The Crew tab's "Carries N" line still shows the base cap.)
//  - Manager  : sells its whole load at once at the stall, at x1.25 (applied through sellToVault's mul).
//  - Scout    : every 90 s calls revealSecrets(k, 20) (if the lands module has it) and finds a coin purse. Scouts do not literally walk off.
//  - Bodyguard: the core has no taunt API, so enemies within 120px are pulled toward the bodyguard (slows/diverts them), and damage the hero
//               takes is cut 8% per bodyguard (cap 40%) by wrapping hurtPlayer. Fans cannot die in the core, so "can't die" is free.
//  - Drummer  : fighters within 160px of a drummer have their fire cooldown drain 25% faster (= +25% fire rate).
(function () {
  const ID = 'crew';
  const CAREERS = {
    roadie: { name: 'Roadie', role: 'gather', icon: 'cap', col: ['#8ef0e4', '#1f9a98'], desc: 'Carries 6 more loot per trip and walks 35% faster.' },
    manager: { name: 'Manager', role: 'gather', icon: 'coin', col: ['#ffe27a', '#e8921e'], desc: 'Sells the whole load at the stall in one go, for 25% more coins.' },
    scout: { name: 'Scout', role: 'gather', icon: 'way', col: ['#9af0b4', '#2a9a58'], desc: 'Explores your lands. Every 90 seconds it finds a coin purse and uncovers secrets.' },
    bodyguard: { name: 'Bodyguard', role: 'fight', icon: 'hp', col: ['#ff9a8a', '#d8384f'], desc: 'Draws nearby enemies toward itself. You take 8% less damage per bodyguard (up to 40%).' },
    drummer: { name: 'Drummer', role: 'fight', icon: 'drums', col: ['#c6a8ff', '#6a3fd8'], desc: 'Keeps the beat. Fighters close to it sing 25% faster.' },
  };
  const CAREER_IDS = ['roadie', 'manager', 'scout', 'bodyguard', 'drummer'];
  const CAREER_LV = 3, ROADIE_CARRY = 6, ROADIE_SPD = 0.35, MANAGER_MUL = 1.25, SCOUT_EVERY = 90, TAUNT_R = 120, DRUM_R = 160, DRUM_RATE = 0.25, BG_CUT = 0.08, BG_CAP = 0.4;
  const specOk = (f) => !!(f.spec && CAREERS[f.spec] && CAREERS[f.spec].role === f.role); // a career only works while the fan has the matching job

  const st = () => fs(ID);
  const tierName = (i) => TOWN_TIERS[i][0];
  // ---------- careers ----------
  const careerBase = () => Math.ceil(8000 * (1 + 0.12 * S.pop.length) * (1 + 0.3 * S.lands.length) + 30 * helmVal(S.lands.length));
  const careerCost = (f) => Math.ceil(careerBase() * (f.spec ? 2.5 : 1));
  const careerEligible = (f) => (f.lvl || 0) >= CAREER_LV;
  function setCareer(f, id) {
    const c = CAREERS[id]; if (!f || !c || !careerEligible(f) || c.role !== f.role || f.spec === id) { sfx('hurt'); return false; }
    const cost = careerCost(f); if (S.wallet < cost) { sfx('hurt'); return false; }
    S.wallet -= cost; f.spec = id; f.scoutT = SCOUT_EVERY; f.lvlFlash = 1;
    sfx('levelup', true); starBurst(f.x, f.y - 30, 14, ['#ffe98a', '#c6a8ff', '#9af0b4'], 200); ringFx(f.x, f.y, 60, '#ffe98a', 0.5);
    return true;
  }
  function crewCounts() {
    const n = { roadie: 0, manager: 0, scout: 0, bodyguard: 0, drummer: 0 };
    for (const f of S.pop) if (specOk(f)) n[f.spec]++;
    return n;
  }
  const bodyguardCut = () => { let n = 0; for (const f of S.pop) if (f.spec === 'bodyguard' && f.role === 'fight') n++; return Math.min(BG_CAP, BG_CUT * n); };

  // hero damage cut (wraps the function declaration; other modules call it by name so they get the wrapper)
  const _hurtPlayer = hurtPlayer;
  hurtPlayer = function (d, src) { const c = bodyguardCut(); return _hurtPlayer(c ? d * (1 - c) : d, src); };

  // ---------- market ----------
  const marketOn = () => townTierIdx() >= 1;
  const marketLvl = () => (marketOn() ? (st().market ? st().market.lvl : 0) : 0);
  const MARKET_MAX = 5, MARKET_BONUS = 0.06, HOT_EVERY = 300;
  const marketCost = () => Math.ceil(15000 * Math.pow(3.4, marketLvl()));
  function buyMarket() {
    const m = st().market; if (!marketOn() || m.lvl >= MARKET_MAX || S.wallet < marketCost()) { sfx('hurt'); return false; }
    S.wallet -= marketCost(); m.lvl++; sfx('built', true); starBurst(MARKET_POS.x, MARKET_POS.y - 40, 14, ['#ffe98a', '#ffd94a'], 220); return true;
  }
  function hotK() { const m = st().market; if (!m) return 1; return 1 + Math.floor(hash01(m.hotN * 17 + m.seed) * Math.max(1, S.lands.length)); }
  const hotBonus = (e) => (marketOn() && e && !e.crown && !e.bar && e.k === hotK()) ? entryVal(e) : 0; // the extra x1 that makes a Hot Item pay x2
  function payHot(v) {
    v = Math.ceil(v); if (v <= 0) return; S.pallet += v; S.stats.earned += v; questEvent('earn', v);
    float(SELL.x + 36, SELL.y - 86, 'HOT x2  +' + fmt(v), '#ff9a2e', true);
  }
  const _sellToVault = sellToVault;
  sellToVault = function (e, mul) { _sellToVault(e, mul); const b = hotBonus(e); if (b) payHot(b * (mul || 1)); };
  const _tickSell = tickSell;
  tickSell = function (dt) {
    const p = S.player;
    if (marketOn() && p.helmets.length && dist2(p.x, p.y, SELL.x, SELL.y) < SELL.r * SELL.r) {
      const before = p.helmets.slice(); _tickSell(dt);
      const n = before.length - p.helmets.length; let b = 0; for (let i = 0; i < n; i++) b += hotBonus(before[before.length - 1 - i]); if (b) payHot(b);
    } else _tickSell(dt);
  };

  // ---------- studio ----------
  const STUDIO_SLOTS = 3;
  const TRACKS = [
    { id: 'demo', tier: 1, name: 'Garage Demo', dur: 480, key: 'coin', amt: 0.05, desc: '+5% coins' },
    { id: 'lofi', tier: 1, name: 'Lo-Fi Loops', dur: 480, key: 'xp', amt: 0.08, desc: '+8% XP' },
    { id: 'single', tier: 2, name: 'Radio Single', dur: 1800, key: 'dmg', amt: 0.08, desc: '+8% damage' },
    { id: 'ballad', tier: 2, name: 'Power Ballad', dur: 1800, key: 'hp', amt: 0.12, desc: '+12% hero health' },
    { id: 'album', tier: 3, name: 'Platinum Album', dur: 7200, key: 'coin', amt: 0.12, desc: '+12% coins' },
    { id: 'anthem', tier: 3, name: 'Stadium Anthem', dur: 7200, key: 'dmg', amt: 0.15, desc: '+15% damage' },
  ];
  const TRACK_BY = {}; for (const t of TRACKS) TRACK_BY[t.id] = t;
  const trackCost = (t) => Math.ceil([0, 20000, 90000, 400000][t.tier] * (1 + 0.2 * S.lands.length));
  const studioOn = () => townTierIdx() >= 3;
  const slotProg = (s) => Math.min(s.dur, Math.max(0, (Date.now() - s.w0) / 1000, S.t - s.t0)); // wall clock keeps running offline, game time online
  const slotDone = (s) => s.done || slotProg(s) >= s.dur;
  function trackBuff(key) { if (!studioOn()) return 1; const sl = st().studio; if (!sl) return 1; let m = 1; for (const s of sl.slots) { const t = TRACK_BY[s.id]; if (t && t.key === key && slotDone(s)) m *= 1 + t.amt; } return m; }
  function recordTrack(id) {
    const t = TRACK_BY[id], sl = st().studio; if (!t || !studioOn() || sl.slots.length >= STUDIO_SLOTS || sl.slots.some(s => s.id === id)) { sfx('hurt'); return false; }
    const c = trackCost(t); if (S.wallet < c) { sfx('hurt'); return false; }
    S.wallet -= c; sl.slots.push({ id, w0: Date.now(), t0: S.t, dur: t.dur, done: false }); sfx('built', true); return true;
  }
  function scrapTrack(i) { const sl = st().studio; if (i < 0 || i >= sl.slots.length) return false; sl.slots.splice(i, 1); sfx('ui_tap'); return true; }

  regMod('coin', () => (marketOn() ? 1 + MARKET_BONUS * (st().market ? st().market.lvl : 0) : 1) * trackBuff('coin'));
  regMod('dmg', () => trackBuff('dmg'));
  regMod('xp', () => trackBuff('xp'));
  regMod('hp', () => trackBuff('hp'));

  // ---------- arena ----------
  const ARENA_UNLOCK = 2, ARENA_WAVES = 5, ARENA_SECS = 12;
  const ARENA_T = { hpK: 30, hpG: 1.75, dpsK: 6, dpsG: 1.5, fanHp: 9 }; // foe total HP = par*hpK*hpG^(w-1); foe total dps = par*dpsK*dpsG^(w-1); fan HP = par*fanHp
  let BATTLE = null;
  const arenaOn = () => townTierIdx() >= ARENA_UNLOCK;
  const fightersN = () => { let n = 0; for (const f of S.pop) if (f.role === 'fight') n++; return n; };
  const arenaDone = () => !!st().arena && st().arena.day === dayStr();
  const arenaReady = () => arenaOn() && !arenaDone() && fightersN() > 0;
  function arenaTeam() {
    const us = []; for (const f of S.pop) if (f.role === 'fight') us.push({ art: f.art, lvl: f.lvl || 0, dps: fanDmgOf(f) / fanRateOf(f) });
    if (!us.length) return null;
    us.sort((a, b) => b.dps - a.dps);
    let total = 0; for (const u of us) total += u.dps;
    const m = Math.min(6, us.length), top = us.slice(0, m); let sum = 0; for (const u of top) sum += u.dps;
    const scl2 = total / (sum || 1), hpS = us.length / m, par = fighterDmg() / FIGHTER_RATE;
    return top.map(u => ({ art: u.art, dps: u.dps * scl2, max: par * ARENA_T.fanHp * (1 + 0.1 * u.lvl) * hpS, hp: 0, acc: 0, accT: 0, hit: 0, hurt: 0 }));
  }
  function arenaSpawn(b) {
    const w = ++b.wave, par = b.par, n = 1 + w, boss = w === ARENA_WAVES;
    const th = par * ARENA_T.hpK * Math.pow(ARENA_T.hpG, w - 1), td = par * ARENA_T.dpsK * Math.pow(ARENA_T.dpsG, w - 1);
    b.foes = [];
    const wt = boss ? n + 2 : n; // the wave-5 boss counts as three foes
    for (let i = 0; i < n; i++) { const big = boss && i === 0, hp = th * (big ? 3 : 1) / wt; b.foes.push({ max: hp, hp, dps: td / n, boss: big, acc: 0, accT: 0, hurt: 0, hit: 0 }); }
    b.phase = 'fight';
    for (const u of b.fighters) u.hp = Math.min(u.max, u.hp + u.max * 0.3);
  }
  function newBattle(team) {
    const b = { fighters: team.map(u => Object.assign({}, u, { hp: u.max })), foes: [], wave: 0, t: 0, k: 1, phase: 'fight', pause: 0, cleared: 0, won: false, floats: [], par: fighterDmg() / FIGHTER_RATE, foeArt: foeArtName(Math.max(1, S.lands.length), false), bossArt: foeArtName(Math.max(1, S.lands.length), true) };
    arenaSpawn(b); for (const u of b.fighters) u.hp = u.max; return b;
  }
  function bFloat(b, x, y, txt, col) { if (b.floats.length < 24) b.floats.push({ x, y, txt, col, t: 0 }); }
  function bstep(b, dt) {
    if (b.phase === 'over') return;
    let rem = dt;
    while (rem > 0 && b.phase !== 'over') { const d = Math.min(0.05, rem); rem -= d; bsub(b, d); }
  }
  function bsub(b, dt) {
    b.t += dt;
    for (const f of b.floats) f.t += dt * (b.k > 0 ? 1 / Math.max(0.2, b.k) : 1);
    if (b.phase === 'pause') { b.pause -= dt; if (b.pause <= 0) arenaSpawn(b); return; }
    let tf = null, nF = 0; for (const e of b.foes) if (e.hp > 0) { if (!tf) tf = e; }
    for (const u of b.fighters) if (u.hp > 0) nF++;
    if (!tf || !nF) return;
    for (let i = 0; i < b.fighters.length; i++) {
      const u = b.fighters[i]; if (u.hp <= 0) continue;
      const tgt = tf.hp > 0 ? tf : null; if (!tgt) break; const dm = u.dps * dt; tgt.hp -= dm; tgt.hurt = 0.15; u.acc += dm; u.accT += dt; u.hit = 0.25;
      if (u.accT >= 0.5) { bFloat(b, tgt.x || 0, 0, fmt(u.acc), '#fff4c0'); u.acc = 0; u.accT = 0; }
      if (tgt.hp <= 0) { let nx = null; for (const e of b.foes) if (e.hp > 0) { nx = e; break; } tf = nx || tgt; }
    }
    let k = 0;
    for (let i = 0; i < b.foes.length; i++) {
      const e = b.foes[i]; if (e.hp <= 0) continue;
      let n = k++ % nF, u = null; for (const x of b.fighters) if (x.hp > 0) { if (n-- === 0) { u = x; break; } }
      if (!u) continue; const dm = e.dps * dt; u.hp -= dm; u.hurt = 0.15; e.hit = 0.25; e.acc += dm; e.accT += dt;
      if (e.accT >= 0.6) { bFloat(b, u.x || 0, 1, fmt(e.acc), '#ff9ac8'); e.acc = 0; e.accT = 0; }
    }
    for (const u of b.fighters) { u.hit = Math.max(0, u.hit - dt); u.hurt = Math.max(0, u.hurt - dt); }
    for (const e of b.foes) { e.hit = Math.max(0, e.hit - dt); e.hurt = Math.max(0, e.hurt - dt); }
    let foesLeft = false, fightersLeft = false; for (const e of b.foes) if (e.hp > 0) foesLeft = true; for (const u of b.fighters) if (u.hp > 0) fightersLeft = true;
    if (!fightersLeft) { b.phase = 'over'; b.won = false; return; }
    if (!foesLeft) { b.cleared++; if (b.wave >= ARENA_WAVES) { b.phase = 'over'; b.won = true; } else { b.phase = 'pause'; b.pause = 0.7; } }
  }
  function arenaRewards(c, dps) {
    return { waves: c, coins: Math.ceil(c * (18 * helmVal(Math.max(1, S.lands.length)) + 30 * dps)), gems: c >= 5 ? 4 : Math.floor(c * 0.6), tickets: c >= 5 ? 2 : c >= 3 ? 1 : 0 };
  }
  function arenaEnter() {
    if (!arenaReady()) { sfx('hurt'); return false; }
    const team = arenaTeam(); if (!team) return false;
    const dry = newBattle(team); for (let i = 0; i < 6000 && dry.phase !== 'over'; i++) bstep(dry, 0.05);
    const b = newBattle(team); b.k = Math.max(0.2, dry.t / ARENA_SECS);
    const r = arenaRewards(dry.cleared, crewStats().dps); b.result = r; b.planned = dry.cleared; b.paid = false;
    S.wallet += r.coins; S.gems += r.gems; S.spinFree = (S.spinFree || 0) + r.tickets;
    const a = st().arena; a.day = dayStr(); a.runs++; a.best = Math.max(a.best, r.waves); a.last = r;
    BATTLE = b; sfx('ui_open'); return true;
  }

  // ---------- world positions / drawing ----------
  const MARKET_POS = hs(-500, -150), ARENA_POS = hs(500, 60), STUDIO_POS = hs(-250, -410); // Market Quarter (W), Arena (E), beside the Hall of Fame (NW)
  for (const p of [MARKET_POS, ARENA_POS, STUDIO_POS]) if (typeof HUB_KEEP !== 'undefined') HUB_KEEP.push({ x: p.x, y: p.y, r: 80 }); // keeps lamps, trees and the next-land plate off them
  const DISTRICTS = [
    { id: 'market', name: 'Market', tier: 1, pos: MARKET_POS, icon: 'coin', col: ['#ffe27a', '#e8921e'], on: () => townTierIdx() >= 1 },
    { id: 'arena', name: 'Arena', tier: 2, pos: ARENA_POS, icon: 'dmg', col: ['#ff9a8a', '#d8384f'], on: () => townTierIdx() >= 2 },
    { id: 'studio', name: 'Studio', tier: 3, pos: STUDIO_POS, icon: 'sound', col: ['#c6a8ff', '#6a3fd8'], on: () => townTierIdx() >= 3 },
  ];
  function drawMarket(x, y) {
    const LN = HV.line; shadow(x, y + 34, 54, 0.25);
    ctx.fillStyle = LN; rr(x - 46, y - 6, 92, 42, 10); ctx.fill(); ctx.fillStyle = '#d9a468'; rr(x - 43, y - 3, 86, 36, 8); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.25)'; rr(x - 38, y - 1, 76, 7, 3); ctx.fill();
    ctx.fillStyle = LN; ctx.fillRect(x - 46, y - 62, 5, 58); ctx.fillRect(x + 41, y - 62, 5, 58);
    ctx.fillStyle = LN; rr(x - 54, y - 80, 108, 26, 10); ctx.fill();
    for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? '#fff4e6' : '#ffb640'; const x0 = x - 51 + i * 17; ctx.beginPath(); ctx.moveTo(x0, y - 78); ctx.lineTo(x0 + 17, y - 78); ctx.lineTo(x0 + 17, y - 66); ctx.arc(x0 + 8.5, y - 66, 8.5, 0, Math.PI); ctx.lineTo(x0, y - 66); ctx.closePath(); ctx.fill(); }
    const bob = Math.sin(S.t * 3) * 1.5; drawHelmetIconSafe(x - 20, y + 10, hotK(), 0.7); drawIcon('coin', x + 14, y + 14 + bob, 24);
    labelPill('MARKET', x, y - 92, '#ffffff', '#ffe9a8', 13);
    const hy = y + 52; ctx.fillStyle = LN; rr(x - 36, hy - 11, 72, 19, 9); ctx.fill(); ctx.fillStyle = '#ff7a2a'; rr(x - 34, hy - 9, 68, 15, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = font(10); ctx.textAlign = 'center'; ctx.fillText('HOT  Lv ' + hotK() + '  x2', x, hy + 2);
  }
  function drawHelmetIconSafe(x, y, k, s) { try { drawStackEntry({ k, bar: false, crown: false }, x, y, s); } catch (e) { /* art optional */ } }
  function drawArena(x, y) {
    const LN = HV.line; shadow(x, y + 36, 62, 0.25);
    ctx.fillStyle = LN; ctx.beginPath(); ctx.ellipse(x, y + 12, 60, 32, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#e8c49a'; ctx.beginPath(); ctx.ellipse(x, y + 10, 56, 28, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#c89a62'; ctx.beginPath(); ctx.ellipse(x, y + 14, 38, 16, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = LN; rr(x - 60, y - 40, 120, 54, 14); ctx.fill(); const g = ctx.createLinearGradient(0, y - 38, 0, y + 12); g.addColorStop(0, '#ff9a8a'); g.addColorStop(1, '#d8384f'); ctx.fillStyle = g; rr(x - 56, y - 36, 112, 46, 11); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.28)'; rr(x - 50, y - 33, 100, 7, 3); ctx.fill();
    for (let i = 0; i < 4; i++) { ctx.fillStyle = LN; rr(x - 42 + i * 28, y - 22, 20, 30, 10); ctx.fill(); ctx.fillStyle = '#7a1c3a'; rr(x - 40 + i * 28, y - 20, 16, 28, 8); ctx.fill(); }
    for (const sx of [-1, 1]) { const fx = x + sx * 52; ctx.fillStyle = LN; ctx.fillRect(fx - 2, y - 82, 4, 50); ctx.fillStyle = sx < 0 ? '#ffd94a' : '#ff7eb6'; ctx.beginPath(); const w = Math.sin(S.t * 5 + sx) * 3; ctx.moveTo(fx + 2, y - 82); ctx.lineTo(fx + 2 + sx * 22, y - 76 + w); ctx.lineTo(fx + 2, y - 64); ctx.closePath(); ctx.fill(); ctx.strokeStyle = LN; ctx.lineWidth = 2; ctx.stroke(); }
    labelPill(arenaReady() ? 'ARENA  !' : 'ARENA', x, y - 92, '#ffffff', '#ffc2c8', 13);
  }
  function drawStudio(x, y) {
    const LN = HV.line; shadow(x, y + 34, 54, 0.25);
    ctx.fillStyle = LN; rr(x - 48, y - 40, 96, 74, 12); ctx.fill(); const g = ctx.createLinearGradient(0, y - 38, 0, y + 32); g.addColorStop(0, '#b99cff'); g.addColorStop(1, '#6a3fd8'); ctx.fillStyle = g; rr(x - 45, y - 37, 90, 68, 10); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; rr(x - 40, y - 34, 80, 8, 4); ctx.fill();
    ctx.fillStyle = LN; rr(x - 17, y - 2, 34, 36, 8); ctx.fill(); ctx.fillStyle = '#3a2a86'; rr(x - 14, y + 1, 28, 33, 6); ctx.fill();
    ctx.fillStyle = LN; rr(x - 38, y - 24, 22, 16, 5); ctx.fill(); ctx.fillStyle = '#9ad8ff'; rr(x - 36, y - 22, 18, 12, 4); ctx.fill(); rr(x + 16, y - 24, 22, 16, 5); ctx.fillStyle = LN; ctx.fill(); ctx.fillStyle = '#9ad8ff'; rr(x + 18, y - 22, 18, 12, 4); ctx.fill();
    ctx.fillStyle = LN; ctx.fillRect(x + 28, y - 70, 4, 34); const on = (S.t * 1.2) % 2 < 1.4;
    ctx.fillStyle = LN; ctx.beginPath(); ctx.arc(x + 30, y - 72, 9, 0, TAU); ctx.fill(); ctx.fillStyle = on ? '#ff3d6e' : '#7a1c3a'; ctx.beginPath(); ctx.arc(x + 30, y - 72, 6.5, 0, TAU); ctx.fill();
    ctx.fillStyle = LN; rr(x - 24, y - 60, 38, 18, 7); ctx.fill(); ctx.fillStyle = '#ffe98a'; ctx.font = font(10); ctx.textAlign = 'center'; ctx.fillText('ON AIR', x - 5, y - 47);
    labelPill('STUDIO', x, y - 92, '#ffffff', '#d8c8ff', 13);
  }
  const BUILDERS = { market: drawMarket, arena: drawArena, studio: drawStudio };
  const BADGE = (f) => CAREERS[f.spec];
  function drawBadge(f) {
    const c = BADGE(f), ok = specOk(f), bx = f.x + 15, by = f.y - 30;
    ctx.globalAlpha = ok ? 1 : 0.45; disc(bx, by, 8, c.col[0], c.col[1]); drawIcon(c.icon, bx, by, 13); ctx.globalAlpha = 1;
  }
  function drawWorld() {
    try {
      for (const f of S.pop) {
        if (!f.spec || !CAREERS[f.spec] || !vis(f.x, f.y, 40)) continue;
        if (f.spec === 'drummer' && f.role === 'fight') { // a pulsing beat ring on the ground under the drummer
          const ph = (S.t * 2) % 1; ctx.save(); ctx.strokeStyle = '#c6a8ff'; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.5 * (1 - ph); ctx.beginPath(); ctx.ellipse(f.x, f.y + 3, DRUM_R * (0.25 + 0.75 * ph), DRUM_R * (0.25 + 0.75 * ph) * 0.4, 0, 0, TAU); ctx.stroke();
          ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.ellipse(f.x, f.y + 3, DRUM_R, DRUM_R * 0.4, 0, 0, TAU); ctx.stroke(); ctx.restore();
        }
        drawBadge(f);
      }
      for (const d of DISTRICTS) if (d.on() && vis(d.pos.x, d.pos.y, 120)) BUILDERS[d.id](d.pos.x, d.pos.y);
    } catch (e) { /* cosmetic only */ }
  }
  function drawHud() {
    if (!S.started || S.sheet || S.modal || S.cards) return;
    try {
      for (const d of DISTRICTS) {
        if (!d.on()) continue; const q = w2s(d.pos.x, d.pos.y), sx = q.x, sy = q.y;
        if (sx < -80 || sx > vw + 80 || sy < -80 || sy > vh + 80) continue;
        hitRect(sx - 56 * scl, sy - 100 * scl, 112 * scl, 140 * scl, () => { openSheet('town', 'districts'); sfx('ui_open'); });
      }
    } catch (e) { /* ignore */ }
  }

  // ---------- tick ----------
  const _drum = []; // reused list of drummers
  function nearStall(f) { return dist2(f.x, f.y, SELL.x + 10, SELL.y + 40) < 60 * 60; }
  function anyPickable() { for (const i of S.items) if (!i.dead && !i.gem && i.t >= 0.6) return true; return false; }
  const _tickFans = tickFans;
  tickFans = function (dt) {
    const P = S.pop; let any = false;
    for (let i = 0; i < P.length; i++) { const f = P[i]; if (!f.spec) continue; any = true; if (!specOk(f)) continue; f._px = f.x; f._py = f.y; if (f.spec === 'manager' && f.state === 'sell' && f.carry.length && nearStall(f)) { const m = merchMul() * MANAGER_MUL; while (f.carry.length) sellToVault(f.carry.pop(), m); sfx('sell', false, 1.2); f.state = 'seek'; f.route = null; } }
    _tickFans(dt);
    if (!any) return;
    _drum.length = 0;
    for (let i = 0; i < P.length; i++) {
      const f = P[i]; if (!specOk(f)) continue;
      if (f.spec === 'roadie') {
        if (f._px !== undefined) { const dx = f.x - f._px, dy = f.y - f._py; if (dx * dx + dy * dy < 3600) { f.x += dx * ROADIE_SPD; f.y += dy * ROADIE_SPD; } }
        if (f.state === 'sell' && f.carry.length < fanCarryCap(f) + ROADIE_CARRY && !nearStall(f) && anyPickable()) { f.state = 'seek'; f.route = null; }
      } else if (f.spec === 'drummer') _drum.push(f);
      else if (f.spec === 'scout') {
        f.scoutT = (f.scoutT === undefined ? SCOUT_EVERY : f.scoutT) - dt;
        if (f.scoutT <= 0) {
          f.scoutT = SCOUT_EVERY; const k = 1 + Math.floor(vrnd() * Math.max(1, S.lands.length));
          if (typeof revealSecrets === 'function') { try { revealSecrets(k, 20); } catch (e) { /* lands module may refuse */ } }
          const v = Math.ceil(40 * helmVal(Math.max(1, S.lands.length)) * coinMul()); S.wallet += v; S.stats.earned += v;
          float(f.x, f.y - 70, 'Purse! +' + fmt(v), '#ffd94a', true); starBurst(f.x, f.y - 30, 10, ['#ffe98a', '#fff4c0'], 180); sfx('coin');
        }
      }
    }
    if (_drum.length) for (let i = 0; i < P.length; i++) {
      const f = P[i]; if (f.role !== 'fight' || f.cd <= 0) continue;
      for (let j = 0; j < _drum.length; j++) if (dist2(f.x, f.y, _drum[j].x, _drum[j].y) < DRUM_R * DRUM_R) { f.cd -= dt * DRUM_RATE; break; }
    }
  };

  function tick(dt) {
    const s = st(); if (!s.market) return;
    s.market.hotT += dt; if (s.market.hotT >= HOT_EVERY) { s.market.hotT -= HOT_EVERY; s.market.hotN++; if (marketOn()) toast('The Market has a new Hot Item!', 'coin'); }
    // bodyguard taunt: enemies close to a bodyguard are pulled toward it (the core has no target API)
    for (const g of S.pop) {
      if (g.spec !== 'bodyguard' || g.role !== 'fight') continue;
      for (const e of S.enemies) {
        if (e.hp <= 0) continue; const d2 = dist2(e.x, e.y, g.x, g.y); if (d2 > TAUNT_R * TAUNT_R || d2 < 30 * 30) continue;
        const d = Math.sqrt(d2); e.x += (g.x - e.x) / d * 55 * dt; e.y += (g.y - e.y) / d * 55 * dt;
      }
    }
    // studio: finish tracks (works offline too, because progress uses the wall clock)
    for (const sl of s.studio.slots) if (!sl.done && slotProg(sl) >= sl.dur) { sl.done = true; if (studioOn()) { toast('Track finished: ' + TRACK_BY[sl.id].name + '!', 'sound'); sfx('win'); } }
    if (BATTLE) {
      if (st().arena.day !== dayStr() && BATTLE.phase === 'over') BATTLE = null; // a new day clears yesterday's replay
      else if (BATTLE.phase !== 'over') { bstep(BATTLE, dt * BATTLE.k); if (BATTLE.phase === 'over' && !BATTLE.paid) { BATTLE.paid = true; const r = BATTLE.result; toast('Arena: ' + r.waves + ' of ' + ARENA_WAVES + ' waves!  +' + fmt(r.coins) + ' coins', 'trophy'); sfx(r.waves >= ARENA_WAVES ? 'win' : 'coin'); } }
    }
  }

  // ---------- UI helpers ----------
  const info = (id, x, y) => { if (typeof tutInfoButtonSheet === 'function') { try { tutInfoButtonSheet(x, y, id, 22); } catch (e) { /* optional */ } } };
  function bigBtn(x, y, w, h, kind, on, top, cost, act) {
    cbtn(x, y, w, h, on, on ? kind : 'off'); ctx.textAlign = 'center'; ctx.fillStyle = on ? (kind === 'gold' ? '#3a2410' : '#fff') : '#cfc6ee'; ctx.font = font(10); ctx.fillText(top, x + w / 2, y + (cost === null ? h / 2 + 4 : 15));
    if (cost !== null) iconText(x + w / 2, y + h - 7, coinDraw, fmt(cost), on ? (kind === 'gold' ? '#3a2410' : '#fff') : '#cfc6ee', 11);
    if (on && act) chit(x, y, w, h, act);
  }
  let PICK = null; // fan id whose career picker is open
  const fanById = (id) => S.pop.find(f => f.id === id);

  function bonusLines() {
    const n = crewCounts(), L = [];
    if (n.roadie) L.push('Roadies x' + n.roadie + ': +' + ROADIE_CARRY + ' carry each, +35% speed');
    if (n.manager) L.push('Managers x' + n.manager + ': sell loot at once for +25%');
    if (n.scout) L.push('Scouts x' + n.scout + ': a purse + secrets every 90 s each');
    if (n.bodyguard) L.push('Bodyguards x' + n.bodyguard + ': -' + Math.round(bodyguardCut() * 100) + '% damage to you');
    if (n.drummer) L.push('Drummers x' + n.drummer + ': nearby fighters +25% fire rate');
    return L;
  }
  function careersTab(cw, sh) {
    let y = 4;
    const f0 = PICK !== null ? fanById(PICK) : null; if (PICK !== null && !f0) PICK = null;
    if (f0) return pickerView(cw, sh, f0, y);
    y = section(y, 'Careers  ·  special jobs for trained fans'); info('crew_careers', cw - 22, y - 12);
    y = note(y, cw, 'Train a fan to level 3 in the Crew tab, then give them a career. Each career has its own bonus. You can change a career later for a higher price.');
    const L = bonusLines();
    rowCard(y, 34 + Math.max(1, L.length) * 16, cw); ctx.fillStyle = '#ffd94a'; ctx.font = font(11); ctx.textAlign = 'left'; ctx.fillText('ACTIVE BONUSES', 14, y + 17);
    ctx.font = font(11, false); ctx.fillStyle = L.length ? '#9af0b4' : '#cfc6ee'; if (!L.length) ctx.fillText('None yet — give a fan a career!', 14, y + 34); else L.forEach((t, i) => ctx.fillText(t, 14, y + 34 + i * 16));
    y += 42 + Math.max(1, L.length) * 16;
    y = section(y, 'Your fans');
    const el = S.pop.filter(careerEligible);
    if (!el.length) return note(y, cw, S.pop.length ? 'No fan is level 3 yet. Open the Crew tab and press TRAIN on a fan.' : 'No fans yet — recruit one in the Crew tab.') + 2;
    const vTop = sh.scroll - 80, vBot = sh.scroll + SR.h + 80;
    el.forEach((f, i) => {
      const h = 66, row = y; y += h + 6; if (row + h < vTop || row > vBot) return;
      const fight = f.role === 'fight', c = f.spec && CAREERS[f.spec], cost = careerCost(f);
      rowCard(row, h, cw); disc(30, row + 34, 22, fight ? '#ff9ac8' : '#7fe0d8', fight ? '#c8306a' : '#1f9a98'); artDraw(f.art, 'idle', (S.t * 4 + i) | 0, 30, row + 54, 0.27, false);
      ctx.fillStyle = '#fff'; ctx.font = font(13); ctx.textAlign = 'left'; ctx.fillText(fanName(f), 60, row + 20); const nw = ctx.measureText(fanName(f)).width;
      ctx.fillStyle = fight ? '#ff9ac8' : '#7fe0d8'; ctx.font = font(10); ctx.fillText((fight ? 'FIGHTER' : 'COLLECTOR') + ' · Lv ' + (f.lvl || 0), 60 + nw + 8, row + 20);
      if (c) { disc(70, row + 44, 9, c.col[0], c.col[1]); drawIcon(c.icon, 70, row + 44, 14); ctx.fillStyle = specOk(f) ? '#ffe98a' : '#cfc6ee'; ctx.font = font(12); ctx.textAlign = 'left'; ctx.fillText(c.name + (specOk(f) ? '' : ' (needs the ' + (c.role === 'fight' ? 'fighter' : 'collector') + ' job)'), 86, row + 48); }
      else { ctx.fillStyle = '#cfc6ee'; ctx.font = font(11, false); ctx.fillText('No career yet', 60, row + 48); }
      bigBtn(cw - 110, row + 10, 102, 46, 'gold', true, c ? 'CHANGE' : 'CAREER', cost, () => { PICK = f.id; sh.scroll = 0; sfx('ui_tap'); });
    });
    return y + 4;
  }
  function pickerView(cw, sh, f, y) {
    cbtn(2, y, 96, 28, true, 'violet'); ctx.fillStyle = '#fff'; ctx.font = font(12); ctx.textAlign = 'center'; ctx.fillText('< BACK', 50, y + 19); chit(2, y, 96, 28, () => { PICK = null; sh.scroll = 0; sfx('ui_tap'); });
    ctx.fillStyle = '#fff'; ctx.font = font(15); ctx.textAlign = 'left'; ctx.fillText('Career for ' + fanName(f), 108, y + 20); y += 38;
    const fight = f.role === 'fight', cost = careerCost(f);
    y = note(y, cw, 'Pick one. Cost ' + fmt(cost) + ' coins' + (f.spec ? ' (changing costs more)' : '') + '. This fan is a ' + (fight ? 'fighter' : 'collector') + ', so only ' + (fight ? 'fighter' : 'collector') + ' careers work. You can switch the job in the Crew tab.');
    for (const id of CAREER_IDS) {
      const c = CAREERS[id], row = y, h = 78; y += h + 6; const role = c.role === f.role, cur = f.spec === id, can = role && !cur && S.wallet >= cost;
      rowCard(row, h, cw); ctx.save(); ctx.globalAlpha = role ? 1 : 0.5; disc(32, row + 36, 24, c.col[0], c.col[1]); drawIcon(c.icon, 32, row + 36, 32); ctx.restore();
      ctx.fillStyle = '#fff'; ctx.font = font(14); ctx.textAlign = 'left'; ctx.fillText(c.name, 66, row + 20); const cnw = ctx.measureText(c.name).width;
      ctx.fillStyle = c.role === 'fight' ? '#ff9ac8' : '#7fe0d8'; ctx.font = font(10); ctx.fillText(c.role === 'fight' ? 'FIGHTER' : 'COLLECTOR', 66 + cnw + 8, row + 20);
      ctx.fillStyle = '#cfc6ee'; ctx.font = font(10, false); wrapText(c.desc, 66, row + 36, cw - 190, 13);
      const bx = cw - 108, bw = 98;
      if (cur) bigBtn(bx, row + 14, bw, 46, 'off', false, 'CURRENT', null, null);
      else if (!role) bigBtn(bx, row + 14, bw, 46, 'off', false, 'WRONG JOB', null, null);
      else bigBtn(bx, row + 14, bw, 46, 'gold', can, 'CHOOSE', cost, () => { if (setCareer(f, id)) { PICK = null; sh.scroll = 0; } });
    }
    return y + 2;
  }

  function hCard(y, cw, h, d, unlocked) { // district card frame + title; returns nothing
    rowCard(y, h, cw); ctx.save(); ctx.globalAlpha = unlocked ? 1 : 0.45; disc(34, y + 32, 24, d.col[0], d.col[1]); drawIcon(d.icon, 34, y + 32, 30); ctx.restore(); if (!unlocked) drawIcon('lock', 48, y + 46, 20);
    ctx.fillStyle = '#fff'; ctx.font = font(15); ctx.textAlign = 'left'; ctx.fillText(d.name, 68, y + 26);
  }
  function districtsTab(cw, sh) {
    let y = 4; const tier = townTierIdx();
    y = section(y, 'Districts  ·  grow your town'); info('crew_districts', cw - 22, y - 12);
    y = note(y, cw, 'Reach new town sizes to open districts. Each one is a building on the plaza you can tap.');
    // MARKET
    const d0 = DISTRICTS[0], d1 = DISTRICTS[1], d2 = DISTRICTS[2];
    if (tier < d0.tier) { hCard(y, cw, 64, d0, false); ctx.fillStyle = '#ffd94a'; ctx.font = font(11); ctx.fillText('Reach ' + tierName(d0.tier) + ' to unlock', 68, y + 46); y += 72; }
    else {
      const m = st().market, lv = m.lvl, can = lv < MARKET_MAX && S.wallet >= marketCost(), h = 148;
      hCard(y, cw, h, d0, true); ctx.fillStyle = '#ffd94a'; ctx.font = font(11); ctx.textAlign = 'right'; ctx.fillText('Level ' + lv + ' / ' + MARKET_MAX, cw - 12, y + 24);
      ctx.textAlign = 'left'; ctx.fillStyle = '#cfc6ee'; ctx.font = font(10, false); ctx.fillText('Each level makes all coins worth 6% more.', 68, y + 42);
      ctx.fillStyle = '#9af0b4'; ctx.font = font(11); ctx.fillText('Now: +' + Math.round(MARKET_BONUS * lv * 100) + '% coins', 68, y + 58);
      for (let k = 0; k < MARKET_MAX; k++) { ctx.fillStyle = k < lv ? '#ffd94a' : 'rgba(255,255,255,0.15)'; rr(68 + k * 17, y + 64, 14, 7, 3); ctx.fill(); }
      // hot item panel
      ctx.fillStyle = 'rgba(255,122,42,0.18)'; rr(10, y + 82, cw - 24, 56, 12); ctx.fill(); ctx.strokeStyle = '#ff9a2e'; ctx.lineWidth = 1.5; rr(10, y + 82, cw - 24, 56, 12); ctx.stroke();
      drawHelmetIconSafe(40, y + 116, hotK(), 1.0); ctx.fillStyle = '#ffb066'; ctx.font = font(13); ctx.textAlign = 'left'; ctx.fillText('HOT ITEM: Level ' + hotK() + ' helmets', 70, y + 102);
      ctx.fillStyle = '#cfc6ee'; ctx.font = font(10, false); ctx.fillText('Sell one and it pays double. New one in ' + fmtTime(HOT_EVERY - m.hotT) + '.', 70, y + 120);
      if (lv < MARKET_MAX) { const bx = cw - 112, by = y + 30; bigBtn(bx, by, 100, 44, 'gold', can, 'UPGRADE', marketCost(), buyMarket); } else { ctx.fillStyle = '#ffd94a'; ctx.font = font(11); ctx.textAlign = 'right'; ctx.fillText('FULLY UPGRADED', cw - 12, y + 62); }
      y += h + 8;
    }
    // ARENA
    if (tier < d1.tier) { hCard(y, cw, 64, d1, false); ctx.fillStyle = '#ffd94a'; ctx.font = font(11); ctx.fillText('Reach ' + tierName(d1.tier) + ' to unlock', 68, y + 46); y += 72; }
    else y = arenaCard(y, cw, d1);
    // STUDIO
    if (tier < d2.tier) { hCard(y, cw, 64, d2, false); ctx.fillStyle = '#ffd94a'; ctx.font = font(11); ctx.fillText('Reach ' + tierName(d2.tier) + ' to unlock', 68, y + 46); y += 72; }
    else y = studioCard(y, cw, d2, sh);
    return y + 2;
  }
  function arenaCard(y, cw, d) {
    const a = st().arena, done = arenaDone(), nF = fightersN(), ready = arenaReady(), showB = !!BATTLE, h = 78 + (showB ? 188 : (a.last ? 34 : 0));
    hCard(y, cw, h, d, true); ctx.fillStyle = '#cfc6ee'; ctx.font = font(10, false); ctx.textAlign = 'left'; ctx.fillText('Your fighters battle 5 waves once a day.', 68, y + 42);
    ctx.fillStyle = '#9af0b4'; ctx.font = font(11); ctx.fillText(nF + ' fighters · ' + fmt(crewStats().dps) + ' dps · best ' + a.best + '/5 waves', 68, y + 58);
    const bx = cw - 112, by = y + 12; ctx.textAlign = 'center';
    if (ready) bigBtn(bx, by, 100, 34, 'go', true, 'ENTER ARENA', null, arenaEnter); else bigBtn(bx, by, 100, 34, 'off', false, done ? 'COME BACK TOMORROW' : (nF ? 'LOCKED' : 'NEEDS A FIGHTER'), null, null);
    let yy = y + 72;
    if (BATTLE) { arenaPanel(8, yy, cw - 16, 176); yy += 182; }
    else if (a.last) { const r = a.last; ctx.fillStyle = '#ffe98a'; ctx.font = font(11); ctx.textAlign = 'left'; ctx.fillText('Last fight: ' + r.waves + ' waves  ·  ' + fmt(r.coins) + ' coins  ·  ' + r.gems + ' gems  ·  ' + r.tickets + ' spin tickets', 14, yy + 14); }
    return y + h + 8;
  }
  function arenaPanel(x, y, w, h) {
    const b = BATTLE; ctx.save(); rr(x, y, w, h, 14); ctx.clip();
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#5a3aa8'); g.addColorStop(0.45, '#8a5ad0'); g.addColorStop(0.46, '#e8c49a'); g.addColorStop(1, '#b8844e'); ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    for (let i = 0; i < 9; i++) { ctx.fillStyle = i % 2 ? '#ff7eb6' : '#ffd94a'; ctx.beginPath(); ctx.arc(x + 14 + i * (w - 28) / 8, y + 22 + Math.sin(S.t * 3 + i) * 2, 5, 0, TAU); ctx.fill(); }
    ctx.restore(); ctx.strokeStyle = HV.line; ctx.lineWidth = 2.5; rr(x, y, w, h, 14); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = font(12); ctx.textAlign = 'center'; ctx.fillText(b.phase === 'over' ? (b.won ? 'VICTORY!' : 'FIGHT OVER') : 'WAVE ' + Math.min(b.wave, ARENA_WAVES) + ' / ' + ARENA_WAVES, x + w / 2, y + 16);
    const F = b.fighters, E = b.foes, gy = 60;
    for (let i = 0; i < F.length; i++) { const u = F[i], c = i % 2, r = (i / 2) | 0; u.x = 46 + c * 46 - 8 * (r % 2); u.y = gy + r * 34;
      const ax = x + u.x, ay = y + 0 + u.y + 22, alive = u.hp > 0, bob = alive ? Math.sin(S.t * 8 + i) * 1.5 : 0, lunge = u.hit > 0 ? 6 : 0;
      shadow(ax, ay + 2, 13, 0.25); ctx.save(); if (u.hurt > 0) ctx.globalAlpha = 0.6 + 0.4 * Math.sin(S.t * 40); artDraw(u.art, alive ? (u.hit > 0 ? 'attack' : 'walk') : 'down', (S.t * 9 + i) | 0, ax + lunge, ay - bob, 0.27, false, alive ? undefined : 0.45); ctx.restore();
      gbar(ax - 15, ay + 4, 30, 5, Math.max(0, u.hp / u.max), '#9af0b4', '#2a9a58'); }
    const ne = E.length;
    for (let i = 0; i < ne; i++) { const e = E[i], c = i % 2, r = (i / 2) | 0; e.x = w - 46 - c * 46 + 8 * (r % 2); e.y = gy + r * 34;
      const ax = x + e.x, ay = y + e.y + 22, alive = e.hp > 0, sc = e.boss ? 0.4 : 0.27, bob = alive ? Math.sin(S.t * 7 + i * 2) * 1.5 : 0;
      if (b.phase === 'pause' && !alive) continue;
      shadow(ax, ay + 2, e.boss ? 20 : 13, 0.25); ctx.save(); if (e.hurt > 0) ctx.globalAlpha = 0.6 + 0.4 * Math.sin(S.t * 40); artDraw(e.boss ? b.bossArt : b.foeArt, alive ? (e.hit > 0 ? 'attack' : 'walk') : 'die', (S.t * 8 + i) | 0, ax - (e.hit > 0 ? 6 : 0), ay - bob, sc, true, alive ? undefined : 0.45); ctx.restore();
      gbar(ax - 15, ay + 4, 30, 5, Math.max(0, e.hp / e.max), '#ff9ac8', '#c8306a'); }
    for (const f of b.floats) { if (f.t > 1) continue; const fx = x + (f.y === 0 ? w - 70 : 60) + (f.x % 7), fy = y + 50 - f.t * 26; ctx.globalAlpha = 1 - f.t; ctx.fillStyle = f.col; ctx.font = font(12); ctx.textAlign = 'center'; ctx.fillText(f.txt, fx, fy); ctx.globalAlpha = 1; }
    if (b.phase === 'over') { const r = b.result; ctx.fillStyle = 'rgba(30,14,70,0.8)'; rr(x + 20, y + 118, w - 40, 48, 12); ctx.fill(); ctx.fillStyle = '#ffe98a'; ctx.font = font(13); ctx.textAlign = 'center'; ctx.fillText(r.waves + ' of ' + ARENA_WAVES + ' waves cleared', x + w / 2, y + 138); ctx.fillStyle = '#fff'; ctx.font = font(11); ctx.fillText('+' + fmt(r.coins) + ' coins · +' + r.gems + ' gems · +' + r.tickets + ' tickets', x + w / 2, y + 156); }
  }
  let ARMED = -1;
  function studioCard(y, cw, d, sh) {
    const sl = st().studio.slots, free = STUDIO_SLOTS - sl.length, avail = TRACKS.filter(t => !sl.some(s => s.id === t.id)), h = 70 + sl.length * 46 + (free > 0 ? 24 + avail.length * 50 : 0);
    hCard(y, cw, h, d, true); ctx.fillStyle = '#cfc6ee'; ctx.font = font(10, false); ctx.textAlign = 'left'; ctx.fillText('Record tracks for lasting bonuses. They keep', 68, y + 40); ctx.fillText('recording while you are away.', 68, y + 53);
    let yy = y + 64;
    sl.forEach((s, i) => {
      const t = TRACK_BY[s.id], done = slotDone(s), p = slotProg(s) / s.dur; ctx.fillStyle = 'rgba(255,255,255,0.07)'; rr(10, yy, cw - 24, 40, 10); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = font(12); ctx.textAlign = 'left'; ctx.fillText(t.name, 18, yy + 16); ctx.fillStyle = done ? '#9af0b4' : '#ffe98a'; ctx.font = font(10); ctx.fillText(done ? 'ACTIVE  ·  ' + t.desc : 'Recording…  ' + t.desc + ' when done', 18, yy + 30);
      if (!done) { gbar(18, yy + 34, cw - 150, 5, p, '#c6a8ff', '#6a3fd8'); ctx.fillStyle = '#e6dcff'; ctx.font = font(10); ctx.textAlign = 'right'; ctx.fillText(fmtTime(s.dur - slotProg(s)) + ' left', cw - 92, yy + 16); }
      const arm = ARMED === i; cbtn(cw - 82, yy + 8, 64, 24, true, arm ? 'red' : 'violet'); ctx.fillStyle = '#fff'; ctx.font = font(9); ctx.textAlign = 'center'; ctx.fillText(arm ? 'TAP AGAIN' : 'SCRAP', cw - 50, yy + 24);
      chit(cw - 82, yy + 8, 64, 24, () => { if (ARMED === i) { scrapTrack(i); ARMED = -1; } else { ARMED = i; sfx('ui_tap'); } });
      yy += 46;
    });
    if (free > 0) {
      ctx.fillStyle = '#ffd94a'; ctx.font = font(11); ctx.textAlign = 'left'; ctx.fillText('RECORD A TRACK  ·  ' + free + ' slot' + (free > 1 ? 's' : '') + ' free', 14, yy + 14); yy += 20;
      for (const t of avail) {
        const c = trackCost(t), can = S.wallet >= c; ctx.fillStyle = 'rgba(255,255,255,0.07)'; rr(10, yy, cw - 24, 44, 10); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = font(12); ctx.textAlign = 'left'; ctx.fillText(t.name + '  ·  tier ' + t.tier, 18, yy + 17); ctx.fillStyle = '#9af0b4'; ctx.font = font(10); ctx.fillText(t.desc + '  ·  takes ' + fmtTime(t.dur), 18, yy + 33);
        bigBtn(cw - 108, yy + 4, 96, 36, 'gold', can, 'RECORD', c, () => recordTrack(t.id)); yy += 50;
      }
    } else { ctx.fillStyle = '#cfc6ee'; ctx.font = font(10, false); ctx.textAlign = 'left'; ctx.fillText('All 3 slots are used. Scrap a track to record another.', 14, yy + 12); }
    return y + h + 8;
  }
  regTab('town', 'careers', 'Careers', careersTab);
  regTab('town', 'districts', 'Districts', districtsTab);

  // ---------- tutorial ----------
  if (typeof tutAdd === 'function') {
    const firstFan = () => S.pop.find(f => careerEligible(f) && !f.spec);
    tutAdd({ id: 'crew_career', order: 3000, when: () => !!firstFan(), title: 'Give this fan a career!', text: 'This fan is trained to level 3. Open Town, tap Careers, and press Career next to them to give them a special job.', icon: 'star', sheet: 'town', tab: 'careers', target: () => { const f = firstFan(); return f ? { x: f.x, y: f.y - 30 } : null; } });
    tutAdd({ id: 'crew_market', order: 3010, when: () => townTierIdx() >= 1, title: 'The Market is open!', text: 'Your town is big enough for a Market. Upgrade it in Town, Districts to earn more coins. Sell the Hot Item helmet for double pay.', icon: 'coin', sheet: 'town', tab: 'districts', target: () => MARKET_POS });
    tutAdd({ id: 'crew_arena', order: 3020, when: () => townTierIdx() >= 2, title: 'The Arena is open!', text: 'Once a day your fighters battle five waves. Open Town, Districts and press Enter Arena to win coins, gems and spin tickets.', icon: 'dmg', sheet: 'town', tab: 'districts', target: () => ARENA_POS });
    tutAdd({ id: 'crew_studio', order: 3030, when: () => townTierIdx() >= 3, title: 'The Studio is open!', text: 'Record tracks in the Studio for lasting bonuses like more coins or damage. They keep recording even while you are away.', icon: 'sound', sheet: 'town', tab: 'districts', target: () => STUDIO_POS });
    tutAdd({ id: 'crew_effect', order: 3040, when: () => S.pop.some(specOk), title: 'Your career fan is working!', text: 'Look for the small badge next to the fan. Open Town, Careers any time to see all your active bonuses.', icon: 'heart', target: () => { const f = S.pop.find(specOk); return f ? { x: f.x, y: f.y - 30 } : null; } });
  }
  if (typeof tutHelp === 'function') {
    tutHelp('crew_careers', 'Careers', 'A fan at level 3 can get a career for coins. Roadie: carries 6 more and walks faster. Manager: sells all loot at once for 25% more. Scout: every 90 seconds finds a coin purse and secrets. Bodyguard: pulls enemies toward itself and you take 8% less damage each. Drummer: fighters nearby fire 25% faster.', 'star', 'Town');
    tutHelp('crew_districts', 'Districts', 'Grow your town to open districts. Market (Village): each level gives more coins, and the Hot Item helmet sells for double. Arena (Town): fight 5 waves once a day for prizes. Studio (City): record tracks for lasting bonuses, even while you are away.', 'home', 'Town');
  }

  // ---------- feature registration ----------
  const feat = regFeature({
    id: ID, keep: false,
    init(s) {
      if (!s.market) s.market = { lvl: 0, hotN: 0, hotT: 0, seed: Date.now() % 997 };
      if (!s.arena) s.arena = { day: '', best: 0, runs: 0, last: null };
      if (!s.studio) s.studio = { slots: [] };
    },
    onLoad(s) { BATTLE = null; for (const sl of s.studio.slots) if (!sl.done && slotProg(sl) >= sl.dur) sl.done = true; },
    onTour() { BATTLE = null; PICK = null; },
    tick, drawWorld, drawHud,
    pips() { return { town: S.pop.some(f => careerEligible(f) && !f.spec && S.wallet >= careerCost(f)) || arenaReady() }; },
  });
  feat.api = { hurt: (d, src) => hurtPlayer(d, src), CAREERS, TRACKS, DISTRICTS, setCareer, careerCost, careerEligible, specOk, bodyguardCut, marketCost, buyMarket, hotK, hotBonus, recordTrack, scrapTrack, slotProg, trackBuff, arenaEnter, arenaReady, arenaTeam, newBattle, bstep, arenaRewards, getBattle: () => BATTLE, setPick: (v) => { PICK = v; }, marketLvl, trackCost, ARENA_T, MARKET_POS, ARENA_POS, STUDIO_POS, crewCounts };
})();
