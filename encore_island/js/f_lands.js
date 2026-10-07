'use strict';
// Encore Island — Lands feature pack: Land Events, Land Mastery, Hidden Secrets (feature 'lands', reset on Encore Tour)
// and Boss Variants (feature 'bossvar', kept across Tours together with the collection counters).
// Exports: revealSecrets(k, seconds) -> number revealed.   Emits: 'secret' {land, idx}, 'bossDrop' {variant, k, x, y}.

// ---------------------------------------------------------------- data
const LD_EV = {
  blossom: { name: 'Blossom Storm', col: '#ff9ac8', col2: '#d6407e', short: 'Double loot', desc: 'Pink petals drift over the land. Everything you defeat there drops DOUBLE loot. Go fight there before the timer ends!' },
  sound: { name: 'Sound Check', col: '#6fe0ff', col2: '#1f8ab8', short: 'Defeat the swarm', desc: 'A swarm of little noise-makers pours out of the den. Defeat every one before time runs out to open a bonus chest!' },
  dark: { name: 'Lights-Out', col: '#b9a2ff', col2: '#5a3fb8', short: 'Triple loot', desc: 'The land goes dark and you only see around your lantern. In return, everything you defeat there drops TRIPLE loot.' },
  golden: { name: 'Golden Hour', col: '#ffe27a', col2: '#e8a21e', short: 'Golden foes', desc: 'The sky glows gold and golden creatures keep showing up. Defeat them for extra gems and fat loot.' },
};
const LD_EV_ORDER = ['blossom', 'sound', 'dark', 'golden'];
const LD_SWARM = 14, LD_SWARM_TIME = 20, LD_MAST_MAX = 10, LD_MS = [3, 6, 10];
const LD_VAR = {
  shield: { name: 'Shielded', col: '#6fe0ff', msg: 'Shielded! Break the blue shield first', desc: 'A blue shield soaks up your hits. Break it first, then the headliner takes damage.' },
  summon: { name: 'Summoner', col: '#c6a8ff', msg: 'Summoner! It calls helpers often', desc: 'Every 8 seconds it calls 2 little helpers. Pop them quickly or you get swamped.' },
  enrage: { name: 'Enraged', col: '#ff5a4a', msg: 'Enraged! Faster and angrier below half HP', desc: 'Below half health it runs 60% faster and hits 30% harder. Finish it fast.' },
  duet: { name: 'Duet', col: '#ffa0d0', msg: 'Duet! Two headliners - defeat both', desc: 'A second, smaller headliner joins the show. Both must be defeated.' },
};
const LD_VAR_ORDER = ['shield', 'summon', 'enrage', 'duet'];
const LD = { reveal: {}, guideUntil: 0, near: null, sp: {}, dk: 0, tint: 0, H: null, chip: null };
function ldH(i) { if (!LD.H) { LD.H = new Float32Array(128); for (let j = 0; j < 128; j++) LD.H[j] = hash01(j * 31 + 7); } return LD.H[i & 127]; }
const ldName = (k) => biomeOf(k).name + (k > 8 ? ' ' + k : '');
const ldCoins = (k, m) => Math.ceil(helmVal(k) * coinMul() * m);
function ldPay(k, m) { const c = ldCoins(k, m); S.pallet += c; S.stats.earned += c; return c; }
function ldBossAlive() { for (const e of S.enemies) if (e.boss && e.hp > 0) return true; return false; }
function ldGems(n, x, y) { S.gems += n; S.stats.gemsFound += n; const p = S.player; for (let i = 0; i < Math.min(n, 6); i++) flyTo('gem', x + (i - 2) * 8, y, p.x, p.y - 34, { dur: 0.35 + i * 0.05 }); }

// ---------------------------------------------------------------- mastery
const ldNeed = (L) => Math.round(25 * Math.pow(1.5, L - 1)); // kills to climb from level L to L+1
function ldCum(L) { let s = 0; for (let i = 1; i < L; i++) s += ldNeed(i); return s; } // kills needed to reach level L
function ldMast(k) { const st = fs('lands'); return st.mast[k] || (st.mast[k] = { kills: 0, lv: 1, ms: [0, 0, 0] }); }
const ldMastLv = (k) => { const m = fs('lands').mast; return m && m[k] ? m[k].lv : 1; };
const ldMastBonus = (k) => 0.03 * ldMastLv(k);
function ldMastKill(e) {
  if (e.k > S.lands.length) return;
  const m = ldMast(e.k); m.kills++;
  if (m.lv < LD_MAST_MAX) {
    const coins = Math.ceil(helmVal(e.k) * coinMul() * 1.55 * ldMastBonus(e.k)); if (coins > 0) { S.pallet += coins; S.stats.earned += coins; }
    while (m.lv < LD_MAST_MAX && m.kills >= ldCum(m.lv + 1)) { m.lv++; ldMastLevelUp(e.k, m); }
  } else { const coins = Math.ceil(helmVal(e.k) * coinMul() * 1.55 * ldMastBonus(e.k)); S.pallet += coins; S.stats.earned += coins; }
}
function ldMastLevelUp(k, m) {
  const i = LD_MS.indexOf(m.lv); if (i < 0) return;
  m.ms[i] = 1; const p = S.player, g = geoOf(k), gem = [3, 6, 12][i], coins = ldPay(k, [150, 500, 2000][i]);
  ldGems(gem, p.x, p.y - 20);
  const fp = ldFlagPos(k); ringFx(fp.x, fp.y - 30, 150, '#ffd94a', 0.8); ringFx(p.x, p.y - 10, 120, '#ffe98a', 0.6);
  starBurst(p.x, p.y - 40, 24, ['#ffe98a', '#ffd94a', '#fff4c0'], 320); starBurst(fp.x, fp.y - 40, 20, ['#ffe98a', '#fff4c0'], 260);
  float(p.x, p.y - 80, 'MASTERY ' + m.lv + '!', '#ffd94a', true); shake(8); sfx('levelup', true); JUICE.flash = Math.max(JUICE.flash, 0.3);
  toast(ldName(k) + ' Mastery ' + m.lv + '!  +' + fmt(coins) + ' +' + gem + ' gems', 'trophy', 3.2);
}
function ldFlagPos(k) { const g = geoOf(k), a = g.ia - 135 * D2R, r = radiusAt(g, a) * 0.9; return { x: g.x + Math.cos(a) * r, y: g.y + Math.sin(a) * r }; }
function ldMsCount(k) { const m = fs('lands').mast[k]; return m ? m.ms[0] + m.ms[1] + m.ms[2] : 0; }

// ---------------------------------------------------------------- secrets
function ldSecrets(k) {
  if (LD.sp[k]) return LD.sp[k];
  const g = geoOf(k), rng = mkRng(k * 7919 + 31), avoid = landPlateDefs(k, g).map(p => [p.x, p.y, 125]), pad = landPadSpot(g), us = unlockSpot(k + 1), out = [];
  avoid.push([pad.x, pad.y, 125], [g.den.x, g.den.y, 150]); if (us) avoid.push([us.x, us.y, 125]);
  const clear = (x, y) => { let c = 1e9; for (const a of avoid) c = Math.min(c, Math.hypot(x - a[0], y - a[1]) - a[2]); for (let i = 0; i < g.path.length; i += 2) c = Math.min(c, Math.hypot(x - g.path[i].x, y - g.path[i].y) - 130); for (const o of out) c = Math.min(c, Math.hypot(x - o.x, y - o.y) - 170); return c; };
  const base = hash01(k * 53) * TAU, fr0 = [[0.74, 0.84], [0.42, 0.56], [0.58, 0.8]];
  for (let i = 0; i < 3; i++) {
    let best = null, bc = -1e9;
    for (let t = 0; t < 70; t++) {
      const ang = base + i * 2.09 + (rng() - 0.5) * 1.6, fr = fr0[i][0] + rng() * (fr0[i][1] - fr0[i][0]), r = radiusAt(g, ang) * fr, x = g.x + Math.cos(ang) * r, y = g.y + Math.sin(ang) * r, c = clear(x, y);
      if (c > bc) { bc = c; best = { x, y, fr, ang }; } if (c >= 0) break;
    }
    out.push(best);
  }
  return (LD.sp[k] = out);
}
function ldHint(k, i) {
  const s = ldSecrets(k)[i], g = geoOf(k); let d = Math.abs(((s.ang - g.ia) % TAU + TAU + Math.PI) % TAU - Math.PI);
  const where = s.fr > 0.7 ? 'Look near the rim' : s.fr < 0.5 ? 'Look closer to the middle' : 'Look between the middle and the rim';
  return where + (d < 1.0 ? ', on the boardwalk side...' : d > 2.1 ? ', on the far side...' : ', off to one side...');
}
const ldFound = (k) => { const f = fs('lands').found; return f[k] || (f[k] = [false, false, false]); };
function ldFoundCount(k) { const f = fs('lands').found[k]; return f ? f.filter(Boolean).length : 0; }
function ldFreeEgg() {
  let pool = PETS.filter(p => p.rar === rollRarity()); if (!pool.length) pool = PETS;
  const def = pool[Math.floor(vrnd() * pool.length)], was = petLvl(def.id) === 0;
  S.pets[def.id] = petLvl(def.id) + 1; if (!S.activePet) S.activePet = def.id; S.stats.hatches++;
  return { def, was };
}
function ldDig(k, i) {
  const s = ldSecrets(k)[i], fnd = ldFound(k); if (fnd[i]) return false;
  fnd[i] = true; const p = S.player, kind = (k + i) % 4, bv = fs('bossvar'); let msg;
  if (kind === 0) { const n = 3 + Math.floor(k / 2); ldGems(n, s.x, s.y); msg = '+' + n + ' gems!'; }
  else if (kind === 1) { const r = ldFreeEgg(); starBurst(s.x, s.y - 30, 18, [RARITY[r.def.rar].col, '#fff4e6'], 260); msg = (r.was ? 'NEW pet: ' : 'Pet level up: ') + r.def.name; sfx('pet', true); }
  else if (kind === 2) { const c = ldPay(k, 220); msg = 'Relic! +' + fmt(c) + ' coins'; }
  else { bv.pages = (bv.pages || 0) + 1; ldGems(1, s.x, s.y); msg = 'Secret page #' + bv.pages + '! +1 gem'; }
  puff(s.x, s.y, '#c9a070', 12, true); starBurst(s.x, s.y - 20, 16, ['#fff4c0', '#ffd94a', '#ff9ac8', '#9af0b4'], 300); ringFx(s.x, s.y - 10, 90, '#ffe98a', 0.5); ringFx(s.x, s.y - 10, 50, '#fff', 0.35);
  float(s.x, s.y - 50, 'SECRET!', '#ffd94a', true); shake(6); sfx('chest', true); sfx('gem'); buzz([20, 20, 40]);
  toast(msg, kind === 1 ? 'egg' : kind === 3 ? 'scroll' : kind === 2 ? 'coin' : 'gem', 3.2);
  fEmit('secret', { land: k, idx: i });
  return true;
}
// Scout fans (or anything else) can call this: shows every unfound secret on land k with a bright ping for `seconds`
function revealSecrets(k, seconds) {
  if (!S || !S.lands || k < 1 || k > S.lands.length) return 0;
  const f = ldFound(k), sp = ldSecrets(k); let n = 0; LD.reveal[k] = S.t + (seconds || 6);
  for (let i = 0; i < 3; i++) if (!f[i]) { n++; ringFx(sp[i].x, sp[i].y - 10, 120, '#ffe98a', 0.8); starBurst(sp[i].x, sp[i].y - 20, 10, ['#fff4c0', '#ffd94a'], 200); }
  if (n) sfx('gem');
  return n;
}
window.revealSecrets = revealSecrets;

// ---------------------------------------------------------------- events
function ldEvDur(ev) { return ev.dur; }
function ldStartEvent(type, k) {
  const st = fs('lands'); if (!S.lands.length) return null;
  type = type || LD_EV_ORDER[Math.floor(vrnd() * 4)]; k = k || (1 + Math.floor(vrnd() * S.lands.length));
  const ev = st.ev = { type, k, t: 0, dur: 90 + Math.floor(vrnd() * 31), spawned: 0, killed: 0, total: LD_SWARM, earned: 0, gems: 0 };
  const g = geoOf(k); ringFx(g.x, g.y, g.r * 0.8, LD_EV[type].col, 1.2); ringFx(g.x, g.y, g.r * 0.5, '#fff', 0.9); starBurst(g.x, g.y - 40, 24, [LD_EV[type].col, '#fff4e6'], 380);
  sfx('unlock', true); toast('Land Event: ' + LD_EV[type].name + ' on ' + ldName(k) + '!', 'star', 4);
  return ev;
}
function ldEndEvent(win) {
  const st = fs('lands'), ev = st.ev; if (!ev) return; const D = LD_EV[ev.type], g = geoOf(ev.k); let txt;
  if (ev.type === 'sound') {
    for (const e of S.enemies) if (e.swarm && e.hp > 0) { e.hp = 0; puff(e.x, e.y, '#fff4e6', 6, true); }
    if (win) {
      const c = ldPay(ev.k, 260), gm = 4 + Math.floor(ev.k / 2); ev.earned += c; ldGems(gm, g.x, g.y); ev.gems += gm;
      ringFx(g.x, g.y, g.r * 0.7, '#ffd94a', 0.9); starBurst(g.x, g.y - 30, 34, ['#ffe98a', '#6fe0ff', '#ff9ac8'], 420); float(g.x, g.y - 60, 'BONUS CHEST!', '#ffd94a', true); sfx('chest', true); shake(8);
      txt = 'Sound Check cleared!  +' + fmt(ev.earned) + ' +' + ev.gems + ' gems';
    } else txt = 'Sound Check over: ' + ev.killed + '/' + ev.total + ' defeated';
  } else txt = D.name + ' over!  +' + fmt(ev.earned) + (ev.gems ? ' +' + ev.gems + ' gems' : '');
  toast(txt, win ? 'chest' : 'star', 3.6);
  const bv = fs('bossvar'); bv.evN = (bv.evN || 0) + 1; if (win || ev.type !== 'sound') bv.evWins = (bv.evWins || 0) + 1;
  st.ev = null; st.evCd = 240 + vrnd() * 180; fEmit('landEvent', { type: ev.type, k: ev.k, win: !!win, earned: ev.earned });
}
function ldSwarmSpawn(ev) {
  const z = S.lands[ev.k - 1]; if (!z) return;
  spawnEnemy(z); const e = S.enemies[S.enemies.length - 1]; if (!e || e.boss) return;
  e.swarm = true; e.gold = false; e.max = Math.max(1, Math.ceil(foeHp(z.k) * 0.3)); e.hp = e.max; e.r = Math.max(12, e.r - 4); e.spd *= 1.15; e.dmg *= 0.7; ev.spawned++;
  puff(e.x, e.y, '#b8f0ff', 6, true);
}
function ldEvKill(e) {
  const ev = fs('lands').ev; if (!ev || e.k !== ev.k) return;
  const n = e.boss ? 6 : e.elite ? 4 : e.gold ? 2 : 1.55;
  if (ev.type === 'blossom' || ev.type === 'dark') {
    const m = ev.type === 'blossom' ? 2 : 3, c = Math.ceil(helmVal(e.k) * coinMul() * n * (m - 1)); S.pallet += c; S.stats.earned += c; ev.earned += c;
    float(e.x, e.y - e.r - 40, '+' + fmt(c), LD_EV[ev.type].col, false); if (ev.type === 'blossom') starBurst(e.x, e.y - 20, 4, ['#ff9ac8', '#fff4e6'], 140);
  } else if (ev.type === 'golden' && e.gold) {
    dropItem(e.x, e.y, { gem: true }, true); dropItem(e.x, e.y, { gem: true }, true); const c = Math.ceil(helmVal(e.k) * coinMul() * 3); S.pallet += c; S.stats.earned += c; ev.earned += c; ev.gems += 2;
    starBurst(e.x, e.y - 20, 12, ['#ffe98a', '#fff4c0'], 260); float(e.x, e.y - e.r - 40, '+2 gems', '#6ee0d8', true);
  } else if (ev.type === 'sound' && e.swarm) {
    ev.killed++; const c = Math.ceil(helmVal(e.k) * coinMul() * 2); S.pallet += c; S.stats.earned += c; ev.earned += c; starBurst(e.x, e.y - 20, 5, ['#6fe0ff', '#fff4e6'], 180);
    if (ev.killed >= ev.total) ldEndEvent(true);
  }
}
function ldTickEvent(st, dt) {
  const ev = st.ev; ev.t += dt;
  if (ev.type === 'sound') { const want = Math.min(ev.total, Math.floor(ev.t / LD_SWARM_TIME * ev.total) + 1); while (ev.spawned < want) ldSwarmSpawn(ev); }
  if (st.ev && ev.t >= ev.dur) ldEndEvent(false);
}

// ---------------------------------------------------------------- boss variants
function ldVarApply(e, v) {
  e.variant = v; const D = LD_VAR[v];
  if (v === 'shield') {
    e.shieldMax = Math.ceil(e.max * 0.4); e.shield = e.shieldMax;
    e.fx = e.fx || {}; const prev = e.fx.onHurt;
    e.fx.onHurt = (en, dmg) => {
      if (prev) dmg = prev(en, dmg) || dmg;
      if (!(en.shield > 0)) return dmg;
      en.shield -= dmg; ringFx(en.x, en.y - en.r * 1.4, en.r * 2.2, '#6fe0ff', 0.25); starBurst(en.x, en.y - en.r * 1.2, 2, ['#b8f4ff', '#6fe0ff'], 120);
      if (en.shield <= 0) { const rest = -en.shield; en.shield = 0; ringFx(en.x, en.y - en.r * 1.4, en.r * 4, '#6fe0ff', 0.6); starBurst(en.x, en.y - en.r * 1.4, 22, ['#b8f4ff', '#6fe0ff', '#fff'], 340); float(en.x, en.y - en.r * 4, 'SHIELD BROKEN!', '#6fe0ff', true); sfx('crit', true); shake(6); return Math.max(1e-6, rest); }
      return 1e-6;
    };
  } else if (v === 'summon') e.sumT = 4;
  else if (v === 'duet' && !e.duetKid) {
    const z = S.lands[e.k - 1], kid = Object.assign({}, e, { duetKid: true, x: e.x + 60, y: e.y + 30, tx: e.tx, ty: e.ty, vx: 0, vy: 0, fx: undefined });
    kid.max = Math.ceil(e.max * 0.6); kid.hp = kid.max; kid.r = Math.round(e.r * 0.8); kid.dmg = e.dmg * 0.7; kid.spd = e.spd * 1.1; kid.born = 0; kid.hurt = 0; kid.atkCd = 1;
    S.enemies.push(kid); e.partner = kid; kid.partner = e; puff(kid.x, kid.y, '#ffa0d0', 14, true); ringFx(kid.x, kid.y, 90, '#ffa0d0', 0.5); void z;
  }
  const bv = fs('bossvar'); (bv.seen || (bv.seen = {}))[v] = (bv.seen[v] || 0) + 1;
  toast(D.msg, 'crown', 4.2); sfx('boss', true);
}
function ldVarTick(dt) {
  for (const e of S.enemies) {
    if (!e.variant || e.hp <= 0) continue;
    if (e.variant === 'enrage' && !e.enr && e.hp < e.max * 0.5) {
      e.enr = true; e.spd *= 1.6; e.dmg *= 1.3; float(e.x, e.y - e.r * 4, 'ENRAGED!', '#ff5a4a', true); ringFx(e.x, e.y - e.r, e.r * 5, '#ff5a4a', 0.6); starBurst(e.x, e.y - e.r * 1.5, 20, ['#ff5a4a', '#ffb09a'], 360); shake(10); sfx('boss', true);
    } else if (e.variant === 'summon') {
      e.sumT -= dt;
      if (e.sumT <= 0) {
        e.sumT = 8; const z = S.lands[e.k - 1]; let alive = 0; for (const o of S.enemies) if (o.minionOf === e && o.hp > 0) alive++;
        if (z && alive < 6) for (let i = 0; i < 2; i++) {
          spawnEnemy(z); const m = S.enemies[S.enemies.length - 1]; if (!m || m.boss) continue;
          m.minionOf = e; m.gold = false; m.max = Math.max(1, Math.ceil(foeHp(z.k) * 0.35)); m.hp = m.max; m.x = e.x + (i ? 50 : -50); m.y = e.y + 24; m.r = Math.max(12, m.r - 3);
          puff(m.x, m.y, '#c6a8ff', 8, true); ringFx(m.x, m.y, 40, '#c6a8ff', 0.35);
        }
        float(e.x, e.y - e.r * 4, 'HELP!', '#c6a8ff', false); sfx('pet', true);
      }
    }
  }
}

// ---------------------------------------------------------------- drawing helpers
function ldGlyph(type, x, y, s) {
  ctx.save(); ctx.translate(x, y);
  if (type === 'blossom') { ctx.fillStyle = '#ff9ac8'; ctx.strokeStyle = '#a02060'; ctx.lineWidth = 1.2; for (let i = 0; i < 5; i++) { ctx.save(); ctx.rotate(i * TAU / 5); ctx.beginPath(); ctx.ellipse(0, -s * 0.26, s * 0.17, s * 0.27, 0, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore(); } ctx.fillStyle = '#ffe98a'; ctx.beginPath(); ctx.arc(0, 0, s * 0.13, 0, TAU); ctx.fill(); }
  else if (type === 'sound') { drawIcon('sound', 0, 0, s * 1.1); }
  else if (type === 'dark') { ctx.fillStyle = '#e8e0ff'; ctx.beginPath(); ctx.arc(0, 0, s * 0.4, 0, TAU); ctx.fill(); ctx.fillStyle = '#5a3fb8'; ctx.beginPath(); ctx.arc(s * 0.2, -s * 0.1, s * 0.34, 0, TAU); ctx.fill(); }
  else if (type === 'golden') { ctx.fillStyle = '#ffd94a'; ctx.strokeStyle = '#b8760a'; ctx.lineWidth = 1.2; for (let i = 0; i < 8; i++) { ctx.save(); ctx.rotate(i * TAU / 8); ctx.beginPath(); ctx.moveTo(-s * 0.07, -s * 0.3); ctx.lineTo(0, -s * 0.5); ctx.lineTo(s * 0.07, -s * 0.3); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); } ctx.beginPath(); ctx.arc(0, 0, s * 0.27, 0, TAU); ctx.fill(); ctx.stroke(); }
  ctx.restore();
}
function ldBlob(g, f) { ctx.beginPath(); for (let i = 0; i <= 48; i++) { const a = i / 48 * TAU, r = radiusAt(g, a) * f; if (i) ctx.lineTo(g.x + Math.cos(a) * r, g.y + Math.sin(a) * r); else ctx.moveTo(g.x + Math.cos(a) * r, g.y + Math.sin(a) * r); } ctx.closePath(); }
function ldPetals(g, t) {
  for (let i = 0; i < 40; i++) {
    const u = (t * (0.05 + ldH(i) * 0.05) + ldH(i + 40)) % 1, px = g.x + (ldH(i + 80) * 2 - 1) * g.r * 1.05 + Math.sin(t * 1.3 + i) * 26 + u * 90, py = g.y + (u * 2 - 1) * g.r * 0.95 + g.r * 0.1;
    if (!vis(px, py, 30)) continue;
    ctx.globalAlpha = Math.sin(u * Math.PI) * 0.9; ctx.fillStyle = i % 3 === 0 ? '#fff4e6' : i % 3 === 1 ? '#ff9ac8' : '#ffc2dc';
    ctx.save(); ctx.translate(px, py - 50 * Math.sin(u * Math.PI)); ctx.rotate(t * 1.6 + i); ctx.scale(1, 0.5 + 0.5 * Math.sin(t * 3 + i)); ctx.beginPath(); ctx.ellipse(0, 0, 9, 5, 0, 0, TAU); ctx.fill(); ctx.restore();
  }
  ctx.globalAlpha = 1;
}
function ldSparkles(g, t, col, n) {
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const a = ldH(i) * TAU, r = Math.sqrt(ldH(i + 50)) * radiusAt(g, a) * 0.9, px = g.x + Math.cos(a) * r, py = g.y + Math.sin(a) * r - ((t * 20 + i * 13) % 60);
    if (!vis(px, py, 20)) continue; const tw = Math.max(0, Math.sin(t * 3 + i * 1.7)), s = 3 + tw * 6;
    ctx.globalAlpha = tw * 0.85; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(px, py - s * 1.6); ctx.lineTo(px + s * 0.4, py - s * 0.4); ctx.lineTo(px + s * 1.6, py); ctx.lineTo(px + s * 0.4, py + s * 0.4); ctx.lineTo(px, py + s * 1.6); ctx.lineTo(px - s * 0.4, py + s * 0.4); ctx.lineTo(px - s * 1.6, py); ctx.lineTo(px - s * 0.4, py - s * 0.4); ctx.closePath(); ctx.fill();
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}
function ldFlag(k) {
  const n = ldMsCount(k); if (!n) return; const p = ldFlagPos(k); if (!vis(p.x, p.y, 80)) return; const t = S.t, h = 74 + n * 6;
  shadow(p.x, p.y + 2, 14, 0.3);
  ctx.strokeStyle = HV.line; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - h); ctx.stroke();
  ctx.strokeStyle = '#fff4e6'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - h); ctx.stroke();
  const w = 46, fh = 30; ctx.beginPath(); ctx.moveTo(p.x, p.y - h + 2);
  for (let i = 0; i <= 8; i++) ctx.lineTo(p.x + w * i / 8, p.y - h + 2 + Math.sin(t * 4 + i * 0.7) * 3 * (i / 8));
  for (let i = 8; i >= 0; i--) ctx.lineTo(p.x + w * i / 8, p.y - h + 2 + fh + Math.sin(t * 4 + i * 0.7) * 3 * (i / 8));
  ctx.closePath(); const gr = ctx.createLinearGradient(0, p.y - h, 0, p.y - h + fh); gr.addColorStop(0, '#ffe98a'); gr.addColorStop(1, '#e8a21e'); ctx.fillStyle = gr; ctx.fill(); ctx.strokeStyle = HV.line; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.fillStyle = '#b8760a'; ctx.font = font(15); ctx.textAlign = 'center'; ctx.fillText(ldMastLv(k) + '', p.x + w * 0.45, p.y - h + 24);
  ctx.fillStyle = '#ffd94a'; ctx.strokeStyle = HV.line; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y - h - 3, 5.5, 0, TAU); ctx.fill(); ctx.stroke();
  if (n >= 3) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 + 0.2 * Math.sin(t * 3); const gl = ctx.createRadialGradient(p.x + 20, p.y - h + 15, 4, p.x + 20, p.y - h + 15, 50); gl.addColorStop(0, '#ffe98a'); gl.addColorStop(1, 'rgba(255,233,138,0)'); ctx.fillStyle = gl; ctx.fillRect(p.x - 40, p.y - h - 40, 120, 110); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
}
function ldSecretDraw(k) {
  const f = fs('lands').found[k], sp = ldSecrets(k), p = S.player, rv = LD.reveal[k] > S.t, t = S.t;
  for (let i = 0; i < 3; i++) {
    if (f && f[i]) continue; const s = sp[i]; if (!vis(s.x, s.y, 80)) continue;
    const d = Math.hypot(s.x - p.x, s.y - p.y); if (d > 140 && !rv) continue;
    const a = rv ? 1 : clamp((140 - d) / 60, 0.25, 1), bob = Math.sin(t * 3 + i) * 3;
    ctx.save(); ctx.globalAlpha = a;
    ctx.globalCompositeOperation = 'lighter'; const gl = ctx.createRadialGradient(s.x, s.y, 2, s.x, s.y, 46); gl.addColorStop(0, 'rgba(255,240,170,' + (0.55 + 0.25 * Math.sin(t * 4)) + ')'); gl.addColorStop(1, 'rgba(255,240,170,0)'); ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(s.x, s.y, 46, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(120,80,40,0.35)'; ctx.beginPath(); ctx.ellipse(s.x, s.y + 2, 16, 7, 0, 0, TAU); ctx.fill();
    for (let j = 0; j < 4; j++) { const an = t * 1.8 + j * 1.57, rx = Math.cos(an) * 22, ry = Math.sin(an) * 9, tw = 0.5 + 0.5 * Math.sin(t * 6 + j * 2); ctx.fillStyle = '#fff4c0'; ctx.globalAlpha = a * tw; ctx.beginPath(); ctx.arc(s.x + rx, s.y + ry - 6, 2.4, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = a; stickerText('?', s.x, s.y - 26 + bob, 26, '#fff4c0', '#ffc83a', Math.sin(t * 2.5) * 0.12);
    if (rv) { const u = (t * 1.3 + i * 0.3) % 1; ctx.strokeStyle = 'rgba(255,233,138,' + (1 - u) + ')'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(s.x, s.y, 20 + u * 70, 0, TAU); ctx.stroke(); }
    ctx.restore();
  }
}
function ldBossDraw(e) {
  const D = LD_VAR[e.variant]; if (!D || !vis(e.x, e.y, 200)) return; const t = S.t, cy = e.y - e.r * 1.4, R = e.r * 2.6;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const gl = ctx.createRadialGradient(e.x, cy, e.r * 0.4, e.x, cy, R * (1 + 0.06 * Math.sin(t * 5))); const c = e.variant === 'enrage' && e.enr ? '#ff3a2a' : D.col;
  gl.addColorStop(0, 'rgba(0,0,0,0)'); gl.addColorStop(0.7, mixc(c, '#000000', 0.45)); gl.addColorStop(1, 'rgba(0,0,0,0)'); ctx.globalAlpha = e.variant === 'enrage' ? (e.enr ? 0.85 : 0.35) : 0.6; ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(e.x, cy, R * 1.1, 0, TAU); ctx.fill(); ctx.restore();
  ctx.save(); ctx.strokeStyle = D.col; ctx.lineWidth = 3; ctx.globalAlpha = 0.6 + 0.3 * Math.sin(t * 4); ctx.beginPath(); ctx.ellipse(e.x, e.y + 2, e.r * 1.5, e.r * 0.55, 0, 0, TAU); ctx.stroke(); ctx.restore();
  if (e.variant === 'shield' && e.shield > 0) {
    ctx.save(); ctx.globalAlpha = 0.28 + 0.12 * Math.sin(t * 6); ctx.fillStyle = '#8fe8ff'; ctx.beginPath(); ctx.arc(e.x, cy, e.r * 1.9, 0, TAU); ctx.fill(); ctx.globalAlpha = 0.9; ctx.strokeStyle = '#d6f8ff'; ctx.lineWidth = 3.5; ctx.stroke(); ctx.restore();
    const w = 74, by = e.y - e.r * 4.2 + 14; ctx.fillStyle = 'rgba(20,50,80,0.85)'; rr(e.x - w / 2 - 1.5, by - 1.5, w + 3, 9, 4); ctx.fill(); ctx.fillStyle = '#6fe0ff'; rr(e.x - w / 2, by, Math.max(3, w * e.shield / e.shieldMax), 6, 3); ctx.fill();
  }
  if (e.variant === 'summon') { const u = 1 - clamp(e.sumT / 8, 0, 1); ctx.strokeStyle = '#c6a8ff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(e.x, e.y - e.r * 2.2, e.r * 0.5, -Math.PI / 2, -Math.PI / 2 + u * TAU); ctx.stroke(); }
  if (e.variant === 'duet' && e.partner && e.partner.hp > 0 && !e.duetKid) { const q = e.partner; ctx.strokeStyle = 'rgba(255,160,208,0.6)'; ctx.lineWidth = 3; ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.moveTo(e.x, e.y - e.r * 2); ctx.lineTo(q.x, q.y - q.r * 2); ctx.stroke(); ctx.setLineDash([]); }
  labelPill(D.name.toUpperCase() + (e.duetKid ? ' (BUDDY)' : ''), e.x, e.y - e.r * 4.9 - 24, mixc(D.col, '#ffffff', 0.5), D.col, 11);
}
function ldEventWorld(ev) {
  const D = LD_EV[ev.type], g = geoOf(ev.k), t = S.t, left = Math.max(0, ev.dur - ev.t);
  if (!vis(g.x, g.y, g.r * 1.4)) return;
  ctx.save(); ctx.lineJoin = 'round';
  ctx.globalAlpha = 0.3 + 0.25 * Math.sin(t * 4); ctx.strokeStyle = D.col; ctx.lineWidth = 12; ldBlob(g, 0.97); ctx.stroke();
  ctx.globalAlpha = 0.7; ctx.lineWidth = 3.5; ctx.strokeStyle = '#fff'; ctx.setLineDash([22, 18]); ctx.lineDashOffset = -t * 30; ldBlob(g, 0.97); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  const u = (t * 0.7) % 1; ctx.globalAlpha = (1 - u) * 0.5; ctx.strokeStyle = D.col; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(g.x, g.y, g.r * (0.2 + u * 0.7), 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
  if (ev.type === 'blossom') ldPetals(g, t); else if (ev.type === 'golden') ldSparkles(g, t, '#ffe98a', 36);
  else if (ev.type === 'sound') { const d = g.den; for (let i = 0; i < 3; i++) { const q = (t * 0.8 + i / 3) % 1; ctx.globalAlpha = 1 - q; ctx.strokeStyle = D.col; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(d.x, d.y, 30 + q * 70, 0, TAU); ctx.stroke(); } ctx.globalAlpha = 1; }
  else if (ev.type === 'dark') ldSparkles(g, t, '#c6b4ff', 18);
  // floating banner (constant on-screen size)
  const near = landAt(S.player.x, S.player.y, S.lands.length) === ev.k, sc = clamp(1 / scl, 0.9, 1.9), bob = Math.sin(t * 2.2) * 6;
  ctx.translate(g.x, g.y - g.r * 0.62 + bob); ctx.scale(sc, sc); ctx.globalAlpha = near ? 0.5 : 1;
  const mm = Math.floor(left / 60), ss = Math.floor(left % 60), tm = mm + ':' + (ss < 10 ? '0' : '') + ss;
  plaque(-96, -28, 192, 56, 16); ctx.strokeStyle = D.col; ctx.lineWidth = 2; rr(-96, -28, 192, 56, 16); ctx.stroke();
  disc(-70, 0, 19, D.col, D.col2); ldGlyph(ev.type, -70, 0, 30);
  ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = font(15); ctx.fillText(D.name, -44, -5); ctx.fillStyle = D.col; ctx.font = font(11);
  ctx.fillText(ev.type === 'sound' ? ev.killed + '/' + ev.total + ' defeated  ' + tm : D.short + '  ' + tm, -44, 14);
  ctx.restore();
}

// ---------------------------------------------------------------- feature: lands
regFeature({
  id: 'lands', keep: false,
  init(st) {
    if (typeof st.evCd !== 'number') st.evCd = 240 + Math.floor(vrnd() * 180);
    if (st.ev === undefined) st.ev = null;
    if (!st.mast || typeof st.mast !== 'object') st.mast = {};
    if (!st.found || typeof st.found !== 'object') st.found = {};
    LD.reveal = {}; LD.guideUntil = 0; LD.dk = 0; LD.tint = 0;
  },
  onLoad(st) { if (st.ev && st.ev.type === 'sound') { st.ev = null; } if (st.ev && st.ev.k > S.lands.length) st.ev = null; },
  onTour(st) { LD.sp = {}; },
  tick(dt) {
    const st = fs('lands'), p = S.player;
    if (st.ev) ldTickEvent(st, dt);
    else if (S.lands.length >= 2 && !ldBossAlive()) { st.evCd -= dt; if (st.evCd <= 0) ldStartEvent(); }
    // secrets: proximity prompt + dig
    LD.near = null;
    for (let k = 1; k <= S.lands.length; k++) {
      const g = geoOf(k); if (dist2(p.x, p.y, g.x, g.y) > Math.pow(g.r * 1.2, 2)) continue;
      const sp = ldSecrets(k), f = ldFound(k);
      for (let i = 0; i < 3; i++) { if (f[i]) continue; const d2 = dist2(p.x, p.y, sp[i].x, sp[i].y); if (d2 < 38 * 38) ldDig(k, i); else if (d2 < 140 * 140 && !LD.near) LD.near = { x: sp[i].x, y: sp[i].y, k, i }; }
    }
    ldVarTick(dt);
    const ev = st.ev, onLand = ev && landAt(p.x, p.y, S.lands.length) === ev.k;
    LD.dk += ((ev && ev.type === 'dark' && onLand ? 1 : 0) - LD.dk) * Math.min(1, dt * 2.5);
    LD.tint += ((ev && ev.type === 'golden' && onLand ? 1 : 0) - LD.tint) * Math.min(1, dt * 2);
  },
  on: {
    kill(e) { ldMastKill(e); ldEvKill(e); },
    spawn(e) { const ev = fs('lands').ev; if (ev && ev.type === 'golden' && !e.boss && !e.gold && e.k === ev.k && vrnd() < 0.3) { e.gold = true; e.max = e.max * 2; e.hp = e.max; } },
  },
  drawWorld() {
    const st = fs('lands'), ev = st.ev;
    try {
      for (let k = 1; k <= S.lands.length; k++) { ldFlag(k); ldSecretDraw(k); }
      if (ev) ldEventWorld(ev);
      for (const e of S.enemies) if (e.variant && e.hp > 0) ldBossDraw(e);
      if (LD.dk > 0.01 || LD.tint > 0.01) {
        ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (LD.dk > 0.01) {
          const p = S.player, sx = vw / 2 + (p.x - CAM.x) * scl, sy = vh * 0.46 + (p.y - CAM.y) * scl, R = 175 * scl * (1 + 0.03 * Math.sin(S.t * 5));
          const gr = ctx.createRadialGradient(sx, sy - 20, R * 0.35, sx, sy - 20, R * 1.8); gr.addColorStop(0, 'rgba(10,5,40,0)'); gr.addColorStop(0.45, 'rgba(10,5,40,' + 0.45 * LD.dk + ')'); gr.addColorStop(1, 'rgba(8,4,32,' + 0.9 * LD.dk + ')');
          ctx.fillStyle = gr; ctx.fillRect(0, 0, vw, vh);
          ctx.globalCompositeOperation = 'lighter'; const wg = ctx.createRadialGradient(sx, sy - 20, 4, sx, sy - 20, R); wg.addColorStop(0, 'rgba(255,220,140,' + 0.22 * LD.dk + ')'); wg.addColorStop(1, 'rgba(255,220,140,0)'); ctx.fillStyle = wg; ctx.fillRect(0, 0, vw, vh);
        }
        if (LD.tint > 0.01) { const tg = ctx.createLinearGradient(0, 0, 0, vh); tg.addColorStop(0, 'rgba(255,214,90,' + 0.26 * LD.tint + ')'); tg.addColorStop(1, 'rgba(255,190,70,' + 0.08 * LD.tint + ')'); ctx.fillStyle = tg; ctx.fillRect(0, 0, vw, vh); }
        ctx.restore();
      }
    } catch (err) { if (LD.strict) throw err; }
  },
  drawHud() {
    const st = fs('lands'), ev = st.ev; if (!ev || S.sheet || S.modal || S.cards) { LD.chip = null; return; }
    const D = LD_EV[ev.type], x = 8, y = 128, w = 168, h = 44, left = Math.max(0, ev.dur - ev.t), f = left / ev.dur, g = geoOf(ev.k), pu = 0.5 + 0.5 * Math.sin(S.t * 5);
    plaque(x, y, w, h, 14); ctx.strokeStyle = D.col; ctx.globalAlpha = 0.5 + 0.4 * pu; ctx.lineWidth = 1.6; rr(x, y, w, h, 14); ctx.stroke(); ctx.globalAlpha = 1;
    const cx = x + 25, cy = y + h / 2; disc(cx, cy, 15, D.col, D.col2); ldGlyph(ev.type, cx, cy, 24);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(cx, cy, 19.5, 0, TAU); ctx.stroke(); ctx.strokeStyle = '#fff4c0'; ctx.beginPath(); ctx.arc(cx, cy, 19.5, -Math.PI / 2, -Math.PI / 2 + f * TAU); ctx.stroke();
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = font(12); ctx.fillText(D.name, x + 50, y + 18); ctx.fillStyle = D.col; ctx.font = font(10);
    const m = Math.floor(left / 60), s2 = Math.floor(left % 60), tm = m + ':' + (s2 < 10 ? '0' : '') + s2;
    ctx.fillText((ev.type === 'sound' ? ev.killed + '/' + ev.total + ' · ' : '') + ldName(ev.k) + ' ' + tm, x + 50, y + 33, w - 56);
    hitRect(x, y, w, h, () => { LD.guideUntil = S.t + 8; sfx('ui_tap'); });
    LD.chip = { x, y, w, h };
    // guide arrow to the land
    if (LD.guideUntil > S.t) {
      const dx = g.x - CAM.x, dy = g.y - CAM.y; if (dx * dx + dy * dy < Math.pow(g.r * 0.5, 2)) return;
      const a = Math.atan2(dy, dx), cx0 = vw / 2, cy0 = vh * 0.46, ca = Math.cos(a), sa = Math.sin(a), bx = vw / 2 - 30;
      const tx = Math.abs(ca) > 1e-4 ? bx / Math.abs(ca) : 1e9, ty = sa < 0 ? (Math.abs(sa) > 1e-4 ? (cy0 - 215) / Math.abs(sa) : 1e9) : (Math.abs(sa) > 1e-4 ? (vh - DOCK_H - 150 - cy0) / sa : 1e9);
      const tt = Math.max(0, Math.min(tx, ty)), ax = cx0 + ca * tt, ay = cy0 + sa * tt, pz = 1 + Math.sin(S.t * 6) * 0.14;
      ctx.save(); ctx.translate(ax, ay); ctx.rotate(a); ctx.scale(pz, pz); ctx.lineJoin = 'round'; ctx.strokeStyle = HV.line; ctx.lineWidth = 5; ctx.fillStyle = D.col; ctx.beginPath(); ctx.moveTo(19, 0); ctx.lineTo(-9, -13); ctx.lineTo(-3, 0); ctx.lineTo(-9, 13); ctx.closePath(); ctx.stroke(); ctx.fill(); ctx.restore();
      labelPill(D.name + ' here!', clamp(ax, 80, vw - 80), clamp(ay + (sa < 0 ? 26 : -22), 150, vh - 160), mixc(D.col, '#ffffff', 0.5), D.col, 11);
    }
    // minimap pulse
    const r = 42, mx0 = vw - 12 - r, my0 = 12 + r, ex = worldExtent(S.lands.length), W = Math.max(ex.x1 - ex.x0, ex.y1 - ex.y0), sc = (r * 1.7) / W;
    const px = mx0 + (g.x - (ex.x0 + ex.x1) / 2) * sc, py = my0 + (g.y - (ex.y0 + ex.y1) / 2) * sc;
    ctx.strokeStyle = D.col; ctx.lineWidth = 2.5; ctx.globalAlpha = 1 - pu * 0.6; ctx.beginPath(); ctx.arc(px, py, 5 + pu * 6, 0, TAU); ctx.stroke(); ctx.fillStyle = D.col; ctx.beginPath(); ctx.arc(px, py, 3, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
  },
  pips() { return null; },
});

// ---------------------------------------------------------------- feature: bossvar (kept across Encore Tours)
regFeature({
  id: 'bossvar', keep: true,
  init(st) { if (!st.seen || typeof st.seen !== 'object') st.seen = {}; if (typeof st.bossN !== 'number') st.bossN = 0; if (typeof st.pages !== 'number') st.pages = 0; if (typeof st.evN !== 'number') st.evN = 0; if (typeof st.evWins !== 'number') st.evWins = 0; },
  on: {
    spawn(e) {
      if (!e.boss || e.variant) return; const bv = fs('bossvar'); bv.bossN++;
      if (bv.bossN < 2 && !(S.stats.bosses >= 1)) return; // the very first headliner stays plain
      const prev = bv.last, pool = LD_VAR_ORDER.filter(v => v !== prev), v = pool[Math.floor(vrnd() * pool.length)]; bv.last = v; ldVarApply(e, v);
    },
    boss(e) {
      if (!e.variant) return; const v = e.variant, D = LD_VAR[v], k = e.k;
      for (const o of S.enemies) if (o.minionOf === e && o.hp > 0) { o.hp = 0; puff(o.x, o.y, D.col, 6, true); }
      const gm = v === 'enrage' ? 3 : 2; for (let i = 0; i < gm; i++) dropItem(e.x, e.y, { gem: true }, true);
      const c = ldPay(k, 80); float(e.x, e.y - e.r * 3, 'RELIC +' + fmt(c), D.col, true); starBurst(e.x, e.y - e.r, 22, [D.col, '#fff4c0', '#ffd94a'], 380); ringFx(e.x, e.y - e.r, e.r * 5, D.col, 0.7);
      fEmit('bossDrop', { variant: v, k, x: e.x, y: e.y });
    },
  },
});

// ---------------------------------------------------------------- the Lands tab
function ldInfo(id, cw, y) { if (typeof tutInfoButtonSheet === 'function') { try { tutInfoButtonSheet(cw - 24, y + 11, id, 26); } catch (err) { /* optional */ } } }
function ldSec(y, cw, txt, help) { y = section(y, txt); ldInfo(help, cw, y - 22); return y; }
function ldTab(cw, sh) {
  const st = fs('lands'), bv = fs('bossvar'), ev = st.ev; let y = 4;
  y = ldSec(y, cw, 'Land event', 'lands_events');
  if (ev) {
    const D = LD_EV[ev.type], left = Math.max(0, ev.dur - ev.t); rowCard(y, 100, cw); disc(30, y + 32, 20, D.col, D.col2); ldGlyph(ev.type, 30, y + 32, 32);
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = font(15); ctx.fillText(D.name, 60, y + 24); ctx.fillStyle = D.col; ctx.font = font(11); ctx.fillText('on ' + ldName(ev.k) + ' · ' + Math.ceil(left) + 's left', 60, y + 40);
    gbar(60, y + 48, cw - 80, 8, left / ev.dur, D.col, D.col2); ctx.fillStyle = '#e6dcff'; ctx.font = font(10, false); wrapText(D.desc, 14, y + 70, cw - 28, 12);
    y += 108;
  } else {
    rowCard(y, 58, cw); ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = font(14); ctx.fillText('No event right now', 16, y + 24); ctx.fillStyle = '#cfc6ee'; ctx.font = font(10, false);
    ctx.fillText(S.lands.length < 2 ? 'Unlock a 2nd land to start Land Events.' : ldBossAlive() ? 'Waiting for the headliner to be defeated.' : 'Next one starts in about ' + Math.max(1, Math.ceil(st.evCd / 60)) + ' min.', 16, y + 44); y += 66;
  }
  y = note(y, cw, 'Events: ' + (bv.evWins || 0) + ' finished. Every type gives bonus loot on one land for 90-120 seconds.');
  for (const id of LD_EV_ORDER) { const D = LD_EV[id]; rowCard(y, 62, cw); disc(28, y + 31, 17, D.col, D.col2); ldGlyph(id, 28, y + 31, 26); ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = font(12); ctx.fillText(D.name, 54, y + 18); ctx.fillStyle = '#cfc6ee'; ctx.font = font(10, false); wrapText(D.desc, 54, y + 32, cw - 70, 12); y += 68; }
  y = ldSec(y + 4, cw, 'Land mastery', 'lands_mastery');
  y = note(y, cw, 'Defeating creatures fills a land\'s Mastery bar. Each level gives +3% coins from that land. Levels 3, 6 and 10 give a chest, gems and a golden flag.');
  const vTop = sh.scroll - 90, vBot = sh.scroll + SR.h + 90;
  for (const z of S.lands) {
    const k = z.k, m = fs('lands').mast[k] || { kills: 0, lv: 1, ms: [0, 0, 0] }, row = y; y += 64; if (row + 62 < vTop || row > vBot) continue;
    rowCard(row, 58, cw); disc(26, row + 29, 16, biomeOf(k).g[0], biomeOf(k).deep); drawIcon('trophy', 26, row + 29, 20);
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = font(12); ctx.fillText(ldName(k), 50, row + 18); ctx.fillStyle = '#ffd94a'; ctx.textAlign = 'right'; ctx.fillText('Lv ' + m.lv + (m.lv >= LD_MAST_MAX ? ' MAX' : ''), cw - 12, row + 18);
    const lo = ldCum(m.lv), hi = ldCum(m.lv + 1); gbar(50, row + 25, cw - 66, 8, m.lv >= LD_MAST_MAX ? 1 : (m.kills - lo) / (hi - lo), '#ffe98a', '#f0a81e');
    const nx = LD_MS.find(l => l > m.lv), tx = m.lv >= LD_MAST_MAX ? 'All prizes won! +30% coins' : '+' + Math.round(ldMastBonus(k) * 100) + '% coins · ' + (hi - m.kills) + ' to Lv ' + (m.lv + 1) + (nx ? ' · prize at Lv ' + nx : '');
    ctx.textAlign = 'left'; ctx.fillStyle = '#cfc6ee'; ctx.font = font(10, false); ctx.fillText(tx, 50, row + 47, cw - 100);
    for (let i = 0; i < 3; i++) { ctx.fillStyle = m.ms[i] ? '#ffd94a' : 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.arc(cw - 40 + i * 12, row + 45, 4.5, 0, TAU); ctx.fill(); }
  }
  y = ldSec(y + 4, cw, 'Hidden secrets  ·  pages ' + (bv.pages || 0), 'lands_secrets');
  y = note(y, cw, 'Each land hides 3 secrets. Walk near one to see a shimmering ?, then step on it to dig it up for gems, pets, relics or secret pages.');
  for (const z of S.lands) {
    const k = z.k, row = y; y += 60; if (row + 58 < vTop || row > vBot) continue; const f = ldFound(k), n = ldFoundCount(k), nxt = f.indexOf(false);
    rowCard(row, 54, cw); ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = font(12); ctx.fillText(ldName(k), 14, row + 18); ctx.fillStyle = n === 3 ? '#9af0b4' : '#ffd94a'; ctx.textAlign = 'right'; ctx.fillText(n + '/3 found', cw - 12, row + 18);
    for (let i = 0; i < 3; i++) { disc(cw - 76 + i * 22, row + 38, 8, f[i] ? '#9af0b4' : '#8a7ac0', f[i] ? '#2a9a60' : '#4a3a88'); ctx.fillStyle = '#fff'; ctx.font = font(10); ctx.textAlign = 'center'; ctx.fillText(f[i] ? '✓' : '?', cw - 76 + i * 22, row + 42); }
    ctx.textAlign = 'left'; ctx.fillStyle = '#cfc6ee'; ctx.font = font(10, false); ctx.fillText(nxt < 0 ? 'Everything found here!' : ldHint(k, nxt), 14, row + 40, cw - 110);
  }
  y = ldSec(y + 4, cw, 'Boss variants', 'lands_bosses');
  y = note(y, cw, 'From the 2nd headliner on, a boss may arrive with a twist. Defeat one for bonus gems and a relic.');
  for (const v of LD_VAR_ORDER) {
    const D = LD_VAR[v], n = (bv.seen || {})[v] || 0; rowCard(y, 58, cw); disc(28, y + 29, 16, n ? D.col : '#8a7ac0', n ? mixc(D.col, '#000000', 0.4) : '#4a3a88');
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = font(15); ctx.fillText(n ? '!' : '?', 28, y + 35);
    ctx.textAlign = 'left'; ctx.fillStyle = n ? '#fff' : '#cfc6ee'; ctx.font = font(12); ctx.fillText(n ? D.name : '???', 54, y + 18); if (n) { ctx.fillStyle = D.col; ctx.textAlign = 'right'; ctx.fillText('seen x' + n, cw - 12, y + 18); }
    ctx.textAlign = 'left'; ctx.fillStyle = '#cfc6ee'; ctx.font = font(10, false); wrapText(n ? D.desc : 'Not met yet. Keep defeating headliners to find it.', 54, y + 32, cw - 68, 12); y += 64;
  }
  return y + 6;
}
regTab('goals', 'lands', 'Lands', ldTab, { show: () => S.lands.length >= 1 });

// ---------------------------------------------------------------- tutorial
if (typeof tutAdd === 'function') {
  const evActive = () => !!(S.feat && S.feat.lands && S.feat.lands.ev);
  tutAdd({ id: 'lands_event', order: 1100, when: evActive, title: 'A Land Event started!', icon: 'star',
    text: 'Look for the glowing ring and the banner on one of your lands. Tap the chip on the left to get an arrow. Do what the banner says before the timer runs out for extra loot!',
    target: () => { const ev = S.feat.lands && S.feat.lands.ev; if (!ev) return null; const g = geoOf(ev.k); return { x: g.x, y: g.y }; } });
  tutAdd({ id: 'lands_mastery', order: 1110, when: () => { const m = S.feat && S.feat.lands && S.feat.lands.mast; if (!m) return false; for (const k in m) if (m[k].ms && m[k].ms[0]) return true; return false; }, title: 'Mastery reward!', icon: 'trophy',
    text: 'Defeating creatures on a land raises its Mastery. You won a chest, gems and a golden flag on the land\'s shore. Open Goals, then Lands, to see the next prize.',
    target: () => { const m = S.feat.lands.mast; for (const k in m) if (m[k].ms && m[k].ms[0]) return ldFlagPos(+k); return null; } });
  tutAdd({ id: 'lands_secret', order: 1120, when: () => !!LD.near && S.started, title: 'Something is hidden here', icon: 'gem',
    text: 'See the shimmering question mark? Walk right onto it to dig up a secret: gems, a pet egg, relic coins or a secret page. Every land hides three.',
    target: () => LD.near ? { x: LD.near.x, y: LD.near.y } : null });
  tutAdd({ id: 'lands_variant', order: 1130, when: () => S.enemies.some(e => e.variant && e.hp > 0), title: 'This headliner has a twist!', icon: 'crown',
    text: 'The coloured glow and the name above it show its twist. Shielded: break the blue shield first. Summoner: it calls helpers. Enraged: it speeds up below half health. Duet: defeat both. Beating it gives bonus gems!',
    target: () => { const e = S.enemies.find(q => q.variant && q.hp > 0); return e ? { x: e.x, y: e.y } : null; } });
}
if (typeof tutHelp === 'function') {
  tutHelp('lands_events', 'Land events', 'Every few minutes a Land Event starts on one of your lands, with a ring and a banner. Blossom Storm: double loot. Sound Check: defeat the whole swarm for a bonus chest. Lights-Out: dark, but triple loot. Golden Hour: lots of golden foes that drop extra gems. Tap the chip on the left for an arrow.', 'star', 'Lands');
  tutHelp('lands_mastery', 'Land mastery', 'Every creature you defeat fills that land\'s Mastery bar. Each level gives +3% coins from that land. At levels 3, 6 and 10 you win a chest, gems and a golden flag on the shore. Mastery restarts with each Encore Tour.', 'trophy', 'Lands');
  tutHelp('lands_secrets', 'Hidden secrets', 'Each land hides 3 secrets. A shimmering question mark shows up when you get close. Walk onto it to dig it up. Prizes are gems, pet eggs, relic coins and secret pages. Goals, then Lands, gives you a hint for each one.', 'gem', 'Lands');
  tutHelp('lands_bosses', 'Boss variants', 'From the 2nd headliner on, a boss may have a twist. Shielded: break the blue shield first. Summoner: calls 2 helpers every 8 seconds. Enraged: faster and stronger below half health. Duet: a second headliner joins, defeat both. Winners get bonus gems and a relic.', 'crown', 'Lands');
}
// test/inspection hook (no gameplay use)
window.LANDS_API = { LD, ldStartEvent, ldEndEvent, ldSecrets, ldDig, ldNeed, ldCum, ldMast, ldFlagPos, ldVarApply, ldTab, ldHint, LD_EV, LD_VAR };
