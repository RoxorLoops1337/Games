'use strict';
// Encore Island — late-game feature: RIVAL BANDS (invasions + Stage Battles), ACTS & TOUR VOWS (deeper Encore Tours), GHOST DUELS (saved-build duels).
// Three features live here: 'rivals' (keep:false), 'acts' (keep:true), 'ghosts' (keep:true). Globals: landTaken, rvInvade, rvStartBattle, actNow, actVows, ghostEncode, ghostDecode, ghostSim.
// ---------------------------------------------------------------- shared tiny helpers
const rvT = (s, x, y, px, col, al, bold) => { ctx.fillStyle = col; ctx.font = font(px, bold !== false); ctx.textAlign = al || 'left'; ctx.fillText(s, x, y); };
const rvChallengeOn = () => { const c = S.feat && S.feat.challenge; return !!(c && c.active); };
const rvLandName = (k) => (biomeOf(k) ? biomeOf(k).name : 'Land') + ' (L' + k + ')';
const rvDayStr = () => (typeof dayStr === 'function' ? dayStr() : '0');
function rvBossAlive() { for (const e of S.enemies) if (e.hp > 0 && e.boss && !e.rival) return true; return false; }
function rvInfo(cw, y, id) { try { if (typeof tutInfoButtonSheet === 'function') tutInfoButtonSheet(cw - 22, y, id); } catch (e) { /* optional */ } }

// ================================================================ 1) RIVAL BANDS
const RV_BANDS = [
  { id: 'velvet', name: 'Velvet Riot', theme: 'Glam rockers who sparkle louder than they play', col: '#ff5fa8', col2: '#b82a72', m: [{ n: 'Vexy', spr: 'rawclaw', role: 'melee' }, { n: 'Duke Dazzle', spr: 'andy', role: 'spitter' }, { n: 'Lil Glitter', spr: 'oni_cub', role: 'fast' }] },
  { id: 'moss', name: 'Moss Machine', theme: 'Mossy synth-pop robots that hum while they hit', col: '#5fd36b', col2: '#2a8a3a', m: [{ n: 'Fern', spr: 'jordan', role: 'tank' }, { n: 'Basalt', spr: 'kappa', role: 'melee' }, { n: 'Pip', spr: 'oni_cub', role: 'fast' }] },
  { id: 'neon', name: 'Neon Nibblers', theme: 'Night-owl snack bandits with glow sticks', col: '#36d6e0', col2: '#1a8a9a', m: [{ n: 'Zap', spr: 'andy', role: 'fast' }, { n: 'Crumb', spr: 'kappa', role: 'tank' }, { n: 'Mint', spr: 'jordan', role: 'spitter' }] },
  { id: 'crimson', name: 'Crimson Chorus', theme: 'A choir that only knows one very loud note', col: '#ff6a4a', col2: '#b82a1a', m: [{ n: 'Aria', spr: 'rawclaw', role: 'spitter' }, { n: 'Bass Bruno', spr: 'oni_cub', role: 'tank' }, { n: 'Alto', spr: 'kappa', role: 'melee' }] },
  { id: 'solar', name: 'Solar Static', theme: 'Sunny drifters who never stop the encore', col: '#ffc83a', col2: '#c8860a', m: [{ n: 'Sol', spr: 'jordan', role: 'melee' }, { n: 'Flare', spr: 'andy', role: 'fast' }, { n: 'Dusk', spr: 'rawclaw', role: 'tank' }] },
];
const RV_HP_MUL = [1.0, 0.8, 1.25], RV_BATTLE_T = 90, RV_TAKEN_HP = 1.4;
const RV_ROLE = { melee: { arch: 'melee', dmg: 2.2, spd: 46, r: 28 }, spitter: { arch: 'spitter', dmg: 2.4, spd: 42, r: 26 }, tank: { arch: 'tank', dmg: 3.2, spd: 32, r: 32 }, fast: { arch: 'fast', dmg: 1.8, spd: 54, r: 24 } };
const rvPads = {};
function rvState() { return fs('rivals'); }
function landTaken(k) { try { const st = S.feat && S.feat.rivals; return !!(st && st.taken && st.taken[k]) && !rvChallengeOn(); } catch (e) { return false; } }
function rvTakenList() { const st = rvState(), out = []; for (const k in st.taken) if (landTaken(+k)) out.push(+k); return out; }
function rvCd(seq) { return 480 + hash01(seq * 7 + 3) * 240; } // 8–12 min
function rvPadSpot(k) {
  if (rvPads[k]) return rvPads[k];
  const z = S.lands[k - 1]; if (!z) return { x: 0, y: 0 };
  const g = z.g, avoid = landPlateDefs(k, g).concat([landPadSpot(g), g.den, unlockSpot(k + 1)]);
  let best = null, bs = -1e9;
  for (let a = 0; a < 360; a += 15) for (const f of [0.3, 0.42, 0.55, 0.66]) {
    const p = polar(g, a * D2R, f); if (landAt(p.x, p.y, S.lands.length) !== k || !walkable(p.x, p.y, S.lands.length)) continue;
    let sc = 1e9; for (const o of avoid) sc = Math.min(sc, Math.hypot(p.x - o.x, p.y - o.y)); sc -= Math.abs(f - 0.45) * 40;
    if (sc > bs) { bs = sc; best = { x: p.x, y: p.y }; }
  }
  return (rvPads[k] = best || { x: g.x, y: g.y });
}
function rvEligible() { return !!S.started && !S.hold && S.lands.length >= 3 && !rvChallengeOn() && !rvState().battle && !rvBossAlive(); }
function rvBuff(e) { if (e.rival || e.rvBuff) return; e.rvBuff = true; e.max = Math.ceil(e.max * RV_TAKEN_HP); e.hp = Math.ceil(e.hp * RV_TAKEN_HP); }
function rvPickLand() {
  const st = rvState(); let best = 0, bv = 1e18;
  for (const z of S.lands) { if (st.taken[z.k] || S.t - z.born < 90 && S.t > 90) continue; const v = st.visit[z.k] || 0; if (v < bv || (v === bv && z.k > best)) { bv = v; best = z.k; } }
  return best;
}
function rvInvade(k, bandIdx) {
  const st = rvState(); k = k || rvPickLand(); if (!k || !S.lands[k - 1] || st.taken[k]) return false;
  const band = bandIdx !== undefined ? bandIdx : (st.seq * 2 + k) % RV_BANDS.length; st.seq++;
  st.taken[k] = { band, since: st.clock || 0 }; st.cd = rvCd(st.seq);
  if (!st.seenInvasion) st.seenInvasion = true;
  for (const e of S.enemies) if (e.k === k && e.hp > 0) rvBuff(e);
  const z = S.lands[k - 1], B = RV_BANDS[band];
  toast(B.name + ' took over ' + rvLandName(k) + '!', 'tower', 4.5);
  float(z.g.x, z.g.y - 90, 'RIVALS!', B.col, true); sfx('boss', true); shake(8); ringFx(z.g.x, z.g.y, 220, B.col, 0.7);
  return true;
}
function rvStartBattle(k) {
  const st = rvState(), tk = st.taken[k]; if (!tk || st.battle || !S.lands[k - 1]) return false;
  const z = S.lands[k - 1], B = RV_BANDS[tk.band], g = z.g, ents = [], base = foeHp(k) * 14, dmg = foeDmg(k);
  B.m.forEach((m, i) => {
    const R = RV_ROLE[m.role], hp = Math.ceil(base * RV_HP_MUL[i]), a = i / 3 * TAU + 1, w = 60 + i * 20;
    const e = { k, arch: R.arch, x: g.den.x + Math.cos(a) * w, y: g.den.y + Math.sin(a) * w, hp, max: hp, spd: R.spd, dmg: dmg * R.dmg, tx: g.den.x, ty: g.den.y, wanderT: 2, atkCd: 1 + i * 0.4, hurt: 0, sway: i * 2, born: 0, face: 1, vx: 0, vy: 0, r: R.r, boss: true, gold: false, rival: { b: tk.band, i } };
    S.enemies.push(e); ents.push(e);
  });
  st.battle = { k, band: tk.band, t: RV_BATTLE_T, max: ents.reduce((s, e) => s + e.max, 0), ents };
  float(g.den.x, g.den.y - 110, 'STAGE BATTLE!', B.col, true); sfx('boss', true); shake(12); JUICE.flash = 0.35; ringFx(g.den.x, g.den.y, 260, B.col, 0.6);
  toast('Stage Battle vs ' + B.name + '! Beat all 3 in 90s', 'trophy', 4);
  return true;
}
function rvEndBattle(win, why) {
  const st = rvState(), b = st.battle; if (!b) return; st.battle = null;
  for (const e of b.ents) if (e.hp > 0) e.hp = 0; // survivors leave the stage quietly
  const A = fs('acts'), B = RV_BANDS[b.band];
  A.bw = A.bw || {}; A.bl = A.bl || {};
  if (win) {
    A.rw = (A.rw || 0) + 1; A.bw[B.id] = (A.bw[B.id] || 0) + 1; A.frags = (A.frags || 0) + 1; A.posters = A.posters || {}; A.posters[B.id] = (A.posters[B.id] || 0) + 1;
    const gems = 3 + Math.floor(b.k / 4), coins = Math.ceil(helmVal(Math.max(1, b.k)) * 150 * coinMul());
    S.gems += gems; S.stats.gemsFound += gems; S.pallet += coins; S.stats.earned += coins; S.goldPulse = Math.max(S.goldPulse || 0, 0.6);
    delete st.taken[b.k]; st.cd = rvCd(st.seq);
    const z = S.lands[b.k - 1]; if (z) { starBurst(z.g.x, z.g.y - 20, 34, [B.col, '#ffe98a', '#fff4e6'], 420); ringFx(z.g.x, z.g.y, 260, '#ffe98a', 0.8); }
    JUICE.flash = 0.6; sfx('win', true); buzz([50, 30, 90]);
    toast('You won back ' + rvLandName(b.k) + '!  +' + gems + ' gems, +' + fmt(coins) + ' coins, rival poster', 'trophy', 5);
    fEmit('rivalWin', b.k, B.id);
  } else {
    A.rl = (A.rl || 0) + 1; A.bl[B.id] = (A.bl[B.id] || 0) + 1; st.cool[b.k] = 25;
    toast((why || 'Time is up') + ' — ' + B.name + ' stay. Try again in a bit.', 'tower', 4);
  }
}
const rvWin = () => rvEndBattle(true), rvLose = (why) => rvEndBattle(false, why);
function rvTick(dt) {
  const st = rvState(); st.clock = (st.clock || 0) + dt;
  const hl = landAt(S.player.x, S.player.y, S.lands.length); if (hl > 0) st.visit[hl] = st.clock;
  for (const k in st.cool) { st.cool[k] -= dt; if (st.cool[k] <= 0) delete st.cool[k]; }
  if (rvChallengeOn()) return;
  const b = st.battle;
  if (b) {
    b.t -= dt; let alive = 0; for (const e of b.ents) if (e.hp > 0) alive++;
    if (!alive) rvWin(); else if (b.t <= 0) rvLose('Time is up');
  } else if (rvEligible() && S.lands.length >= 3 && rvTakenList().length < (S.lands.length >= 7 ? 2 : 1)) { st.cd -= dt; if (st.cd <= 0) { if (!rvInvade()) st.cd = 30; } }
  for (const k in st.taken) {
    const z = S.lands[k - 1]; if (!z) { delete st.taken[k]; continue; }
    for (const tw of z.towers) if (tw.cd < 1) tw.cd = 1; // the rivals have unplugged the towers
    if (!b && rvEligible() && !st.cool[k]) {
      const p = rvPadSpot(+k);
      if (dist2(S.player.x, S.player.y, p.x, p.y) < 50 * 50) { st.padHold += dt; if (st.padHold >= 1.2) { st.padHold = 0; rvStartBattle(+k); } } else st.padHold = Math.max(0, st.padHold - dt * 2);
    }
  }
  for (const e of S.enemies) if (e.hp > 0 && !e.rvBuff && !e.rival && st.taken[e.k]) rvBuff(e);
  const k0 = rvTakenList()[0]; if (k0 && typeof TUT !== 'undefined' && TUT.by.rv_first) TUT.by.rv_first.text = 'A rival band took over ' + rvLandName(k0) + '! Its towers stopped and its creatures are tougher. Walk onto the glowing Stage Battle pad there to win it back.';
}
// --- drawing
function rvDrawTaken(z, tk) {
  const g = z.g, B = RV_BANDS[tk.band], t = S.t;
  if (!vis(g.x, g.y, g.r + 120)) return;
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * TAU + 0.3, rd = radiusAt(g, a) * 0.86, x = g.x + Math.cos(a) * rd, y = g.y + Math.sin(a) * rd, w = Math.sin(t * 3 + i) * 4;
    if (!vis(x, y, 60)) continue;
    ctx.strokeStyle = HV.line; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 54); ctx.stroke();
    ctx.fillStyle = HV.line; ctx.beginPath(); ctx.moveTo(x - 1, y - 55); ctx.lineTo(x + 28 + w, y - 44 + w * 0.4); ctx.lineTo(x - 1, y - 31); ctx.fill();
    ctx.fillStyle = i % 2 ? B.col : B.col2; ctx.beginPath(); ctx.moveTo(x + 1, y - 52); ctx.lineTo(x + 24 + w, y - 44 + w * 0.4); ctx.lineTo(x + 1, y - 34); ctx.fill();
    ctx.fillStyle = '#fff4e6'; ctx.beginPath(); ctx.arc(x + 8, y - 43, 2.6, 0, TAU); ctx.fill();
  }
  ctx.lineCap = 'butt';
  const ry = g.y - g.r * 0.5 + Math.sin(t * 2) * 3; labelPill('TAKEN · ' + B.name, g.x, ry, '#ffe0e8', B.col, 13);
}
function rvDrawPad(k, tk) {
  const st = rvState(), p = rvPadSpot(k), B = RV_BANDS[tk.band], t = S.t;
  if (!vis(p.x, p.y, 90)) return;
  const pulse = 0.5 + 0.5 * Math.sin(t * 3);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const gl = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, 74); gl.addColorStop(0, 'rgba(255,233,138,' + (0.45 + pulse * 0.25) + ')'); gl.addColorStop(1, 'rgba(255,126,182,0)'); ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(p.x, p.y, 74, 0, TAU); ctx.fill(); ctx.restore();
  ctx.strokeStyle = '#ffd94a'; ctx.lineWidth = 5; ctx.setLineDash([14, 9]); ctx.beginPath(); ctx.arc(p.x, p.y, 42, t * 0.8, t * 0.8 + TAU); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,217,74,0.22)'; ctx.beginPath(); ctx.arc(p.x, p.y, 36, 0, TAU); ctx.fill(); drawIcon('mic', p.x, p.y - 4, 44);
  if (st.padHold > 0) { ctx.strokeStyle = B.col; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(p.x, p.y, 48, -Math.PI / 2, -Math.PI / 2 + Math.min(1, st.padHold / 1.2) * TAU); ctx.stroke(); ctx.lineCap = 'butt'; }
  const cool = st.cool[k], bossy = rvBossAlive();
  labelPill(st.battle ? 'IN PROGRESS' : cool ? 'Rest ' + Math.ceil(cool) + 's' : bossy ? 'Beat the Headliner first' : 'STAGE BATTLE', p.x, p.y + 62, '#fff6c0', '#ffb640', 12);
}
function rvDrawMember(e) {
  const B = RV_BANDS[e.rival.b], m = B.m[e.rival.i], sp = ART.ready && ART.spr && ART.spr[m.spr], t = S.t;
  const bob = Math.abs(Math.sin(t * 6 + e.sway)) * 2.5, fy = e.y + e.r * 0.78 - bob * 0.5, hero = sp && sp.sheet === 'heroes';
  const k = hero ? e.r * 0.026 : e.r * 5.2 / 128 * 1.25, grow = easeBack(clamp(e.born, 0, 1)) * 0.6 + 0.4 * e.born;
  shadow(e.x, e.y + e.r * 0.78, e.r * 1.1, 0.3);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; const gl = ctx.createRadialGradient(e.x, fy - e.r, 4, e.x, fy - e.r, e.r * 2.6); gl.addColorStop(0, B.col + 'aa'); gl.addColorStop(1, B.col + '00'); ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(e.x, fy - e.r, e.r * 2.6, 0, TAU); ctx.fill(); ctx.restore();
  ctx.strokeStyle = B.col; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(e.x, e.y + e.r * 0.78, e.r * 1.0, e.r * 0.36, 0, 0, TAU); ctx.stroke();
  const atk = e.atkCd > 0.55, anim = e.hurt > 0 ? 'hurt' : atk && !(sp && sp.sheet === 'heroes' && !sp.anims.attack) ? 'attack' : 'idle', fr = e.hurt > 0 ? 0 : atk ? (t * 8) | 0 : ((t * 4 + e.sway) | 0);
  const sq = e.hurt > 0 ? 1 + e.hurt * 1.2 : 1; ctx.save(); ctx.translate(e.x, fy); ctx.scale(grow / sq, grow * sq); ctx.translate(-e.x, -fy);
  const ok = artDraw(m.spr, anim, fr, e.x, fy, k, e.face > 0); ctx.restore();
  if (!ok) { ctx.fillStyle = B.col; ctx.beginPath(); ctx.arc(e.x, e.y - e.r, e.r, 0, TAU); ctx.fill(); }
  const top = e.y - e.r * (hero ? 5.2 : 3.6) - bob; // band flag on its head
  ctx.strokeStyle = HV.line; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(e.x - 14, top + 6); ctx.lineTo(e.x - 14, top - 18); ctx.stroke(); ctx.fillStyle = B.col; ctx.beginPath(); ctx.moveTo(e.x - 13, top - 18); ctx.lineTo(e.x + 4 + Math.sin(t * 5) * 2, top - 13); ctx.lineTo(e.x - 13, top - 7); ctx.fill();
  const f = e.hp / e.max, w = 54, by = top + 8; ctx.fillStyle = 'rgba(58,26,58,0.85)'; rr(e.x - w / 2 - 1.5, by - 1.5, w + 3, 10, 5); ctx.fill(); ctx.fillStyle = B.col; rr(e.x - w / 2, by, Math.max(3, w * f), 7, 3); ctx.fill();
  labelPill(m.n, e.x, top - 22, '#ffffff', B.col, 11);
}
function rvDrawBattleHud() {
  const st = rvState(), b = st.battle; if (!b) return;
  const B = RV_BANDS[b.band], w = Math.min(vw - 24, 300), x = (vw - w) / 2, y = 84; let hp = 0, n = 0; for (const e of b.ents) { if (e.hp > 0) { hp += e.hp; n++; } }
  plaque(x, y, w, 40, 12); rvT(B.name.toUpperCase(), x + 12, y + 17, 12, B.col, 'left'); rvT(n + '/3 left', x + w / 2, y + 17, 11, '#cfc6ee', 'center'); rvT(Math.ceil(Math.max(0, b.t)) + 's', x + w - 12, y + 17, 13, b.t < 15 ? '#ff8a8a' : '#ffe98a', 'right');
  gbar(x + 10, y + 24, w - 20, 10, hp / b.max, B.col, B.col2);
}
function rvDrawChips() {
  const st = rvState(); let y = typeof leftBottom === 'number' ? leftBottom : 130;
  const tl = rvTakenList(); if (tl.length && !st.battle && !S.sheet) {
    const k = tl[0], B = RV_BANDS[st.taken[k].band], w = 168, h = 30; plaque(8, y, w, h, 12); ctx.fillStyle = B.col; ctx.beginPath(); ctx.arc(24, y + 15, 7, 0, TAU); ctx.fill(); rvT('TAKEN: ' + biomeOf(k).name, 38, y + 13, 10, '#fff', 'left'); rvT('Tap for the Stage pad', 38, y + 25, 9, '#cfc6ee', 'left', false);
    hitRect(8, y, w, h, () => openSheet('goals', 'rivals')); y += h + 4; if (typeof leftBottom === 'number') leftBottom = y;
  }
}

// ================================================================ 2) ACTS + TOUR VOWS
const AC_VOWS = [
  { id: 'hard', name: 'Hard Mode', desc: 'Creatures have 50% more health.', bonus: 0.30, icon: 'dmg' },
  { id: 'nopets', name: 'No Pets', desc: 'Your critter sleeps: no pet powers or pet bonuses.', bonus: 0.20, icon: 'pet' },
  { id: 'fragile', name: 'Fragile', desc: 'Your max health is 40% lower.', bonus: 0.25, icon: 'heart' },
  { id: 'blitz', name: 'Blitz', desc: 'Headliner bosses come back twice as fast.', bonus: 0.35, icon: 'boom' },
];
const AC_PREFIX = ['', 'Moonlit', 'Remix', 'Neon', 'Platinum', 'Legend'], AC_TINT = ['', '#7a6cff', '#ff6ac8', '#3cd8c8', '#ffcf4a', '#ffffff'];
let acBase = null, acNamed = -1, acPick = [], acConfirm = false, acClearAsk = false;
const actNow = () => (S.prestiges || 0) + 1;
const acPrefix = (a) => a <= 1 ? '' : AC_PREFIX[Math.min(a - 1, AC_PREFIX.length - 1)];
const acTint = (a) => a <= 1 ? '' : AC_TINT[Math.min(a - 1, AC_TINT.length - 1)];
function acRename() {
  const a = actNow(); if (!acBase) acBase = BIOMES.map(b => b.name);
  if (acNamed === a) return; acNamed = a; const p = acPrefix(a);
  BIOMES.forEach((b, i) => { b.name = p ? p + ' ' + acBase[i] : acBase[i]; });
}
const acVowDef = (id) => AC_VOWS.find(v => v.id === id);
function actVows() { const v = fs('acts').vows; return v ? v.active.slice() : []; }
const acHas = (id) => { const st = S.feat && S.feat.acts; return !!(st && st.vows && st.vows.active.indexOf(id) >= 0); };
function acBonusPct(ids) { let s = 0; for (const id of ids) { const v = acVowDef(id); if (v) s += v.bonus; } return s; }
function acBonus(gain, ids) { const pct = acBonusPct(ids); return pct > 0 ? Math.max(1, Math.floor(gain * pct)) : 0; }
function acInit(st) {
  if (typeof st.act !== 'number') st.act = actNow();
  if (!st.vows || !Array.isArray(st.vows.active) || !Array.isArray(st.vows.pending)) st.vows = { active: [], pending: [] };
  st.vows.active = st.vows.active.filter(id => acVowDef(id)); st.vows.pending = st.vows.pending.filter(id => acVowDef(id));
  for (const k of ['lastGain', 'lastBonus', 'bonusTotal', 'rw', 'rl', 'frags']) if (typeof st[k] !== 'number') st[k] = 0;
  if (!st.posters) st.posters = {}; if (!st.bw) st.bw = {}; if (!st.bl) st.bl = {}; if (st.petStash === undefined) st.petStash = null;
  acRename();
}
function acLock(ids) { // two-step confirmed elsewhere; this commits the picks
  const st = fs('acts'); let n = 0;
  for (const id of ids) if (acVowDef(id) && st.vows.pending.indexOf(id) < 0 && st.vows.active.indexOf(id) < 0) { st.vows.pending.push(id); n++; }
  return n;
}
function acTick(dt) {
  const st = fs('acts'), a = actNow();
  if (st.act < a) { st.act = a; acRename(); toast('ACT ' + a + ' begins! ' + (acPrefix(a) ? 'The lands are ' + acPrefix(a) + ' now' : ''), 'star', 4.5); JUICE.flash = Math.max(JUICE.flash, 0.4); }
  else acRename();
  const v = st.vows.active;
  if (v.indexOf('nopets') >= 0) { if (S.activePet) { st.petStash = S.activePet; S.activePet = null; } } else if (st.petStash) { if (!S.activePet) S.activePet = st.petStash; st.petStash = null; }
  if (v.indexOf('blitz') >= 0) for (const z of S.lands) if (z.altar && z.altar.cd > 0) z.altar.cd = Math.max(0, z.altar.cd - dt);
}
function acSpawn(e) {
  if (e.rival) return; const a = actNow(), st = S.feat.acts; let m = 1 + 0.12 * (a - 1);
  if (st && st.vows && st.vows.active.indexOf('hard') >= 0) m *= 1.5;
  if (m !== 1) { e.max = Math.ceil(e.max * m); e.hp = Math.ceil(e.hp * m); }
  if (a >= 2) e.actTint = acTint(a);
}
regMod('hp', () => acHas('fragile') ? 0.6 : 1);
regMod('coin', () => (acHas('nopets') && typeof petCollectionMul === 'function') ? 1 / petCollectionMul() : 1);

// ---- Tour tab
function acTourTab(cw) {
  const st = fs('acts'), a = actNow(), gain = crownsToGain(), bonus = acBonus(gain, st.vows.active), ready = S.lands.length >= PRESTIGE_MIN; let y = 4;
  rowCard(y, 66, cw); drawIcon('crown', 32, y + 33, 40); rvT('Encore Tour', 62, y + 24, 17, '#ffd84d'); rvT('Act ' + a + (acPrefix(a) ? ' · ' + acPrefix(a) : '') + '  →  Act ' + (a + 1), 62, y + 43, 11, '#cfc6ee', 'left', false);
  rvT(ready ? 'Ready to tour' : 'Needs ' + PRESTIGE_MIN + ' lands', 62, y + 58, 10, ready ? '#9af0b4' : '#ffb0b0', 'left', false); rvInfo(cw, y + 12, 'acts'); y += 74;
  rowCard(y, 62, cw); rvT('If you toured now:', 14, y + 20, 12, '#cfc6ee', 'left', false); rvT('+' + gain + ' crowns' + (bonus ? '  + ' + bonus + ' vow bonus' : ''), 14, y + 42, 17, bonus ? '#9af0b4' : '#ffd84d');
  drawIcon('crown', cw - 34, y + 31, 34); y += 70;
  y = section(y, 'Your vows right now');
  if (st.vows.active.length) { rowCard(y, 46, cw); rvT('ACTIVE: ' + st.vows.active.map(id => acVowDef(id).name).join(', '), 12, y + 20, 12, '#9af0b4'); rvT('Tour again to cash them in: +' + Math.round(acBonusPct(st.vows.active) * 100) + '% crowns', 12, y + 37, 10, '#cfc6ee', 'left', false); y += 54; }
  else y = note(y, cw, 'No vows are active. Vows are optional promises: you play the next run with a handicap and earn extra crowns when you tour again.');
  if (st.vows.pending.length) { rowCard(y, 46, cw); drawIcon('lock', 24, y + 23, 22); rvT('LOCKED IN: ' + st.vows.pending.map(id => acVowDef(id).name).join(', '), 40, y + 20, 12, '#ffe98a'); rvT('They start with your next run, right after you tour.', 40, y + 37, 10, '#cfc6ee', 'left', false); y += 54; }
  y = section(y + 2, 'Choose vows for the NEXT run');
  for (const v of AC_VOWS) {
    const locked = st.vows.pending.indexOf(v.id) >= 0, act = st.vows.active.indexOf(v.id) >= 0, sel = acPick.indexOf(v.id) >= 0;
    rowCard(y, 62, cw); if (sel) { ctx.strokeStyle = '#ffe98a'; ctx.lineWidth = 3; rr(2, y, cw - 4, 62, 12); ctx.stroke(); }
    drawIcon(v.icon, 28, y + 31, 34); rvT(v.name, 54, y + 22, 14, '#fff'); rvT(v.desc, 54, y + 40, 10, '#cfc6ee', 'left', false); rvT('+' + Math.round(v.bonus * 100) + '% crowns', 54, y + 55, 10, '#9af0b4');
    if (locked) { rvT('LOCKED IN', cw - 12, y + 24, 11, '#ffe98a', 'right'); drawIcon('lock', cw - 24, y + 42, 18); }
    else if (act) rvT('ACTIVE', cw - 12, y + 24, 11, '#9af0b4', 'right');
    else { rvT(sel ? 'SELECTED' : 'Tap to select', cw - 12, y + 24, 11, sel ? '#ffe98a' : '#cfc6ee', 'right', sel); chit(2, y, cw - 4, 62, () => { const i = acPick.indexOf(v.id); if (i >= 0) acPick.splice(i, 1); else acPick.push(v.id); acConfirm = false; sfx('ui_tap'); }); }
    y += 68;
  }
  const picks = acPick.filter(id => st.vows.pending.indexOf(id) < 0 && st.vows.active.indexOf(id) < 0);
  if (!acConfirm) {
    const on = picks.length > 0; cbtn(2, y, cw - 4, 44, on, 'gold'); rvT(on ? 'Lock in ' + picks.length + ' vow' + (picks.length > 1 ? 's' : '') + ' (+' + Math.round(acBonusPct(picks) * 100) + '% crowns)' : 'Select a vow first', cw / 2, y + 28, 14, on ? '#3a2410' : '#cfc6ee', 'center');
    if (on) chit(2, y, cw - 4, 44, () => { acConfirm = true; sfx('ui_tap'); }); y += 52;
  } else {
    rowCard(y, 92, cw); rvT('Are you sure?', cw / 2, y + 22, 15, '#ffe98a', 'center'); ctx.font = font(10, false); ctx.fillStyle = '#cfc6ee'; ctx.textAlign = 'center';
    wrapText(picks.map(id => acVowDef(id).name).join(' + ') + ' will be locked in. They start after your next Encore Tour and cannot be undone before then.', cw / 2, y + 38, cw - 30, 12);
    const bw = (cw - 24) / 2; cbtn(6, y + 56, bw, 30, true, 'gold'); rvT('Yes, lock in', 6 + bw / 2, y + 76, 12, '#3a2410', 'center'); chit(6, y + 56, bw, 30, () => { const n = acLock(picks); acPick = []; acConfirm = false; if (n) { toast('Vows locked in for your next run', 'lock', 3); sfx('built', true); save(); } });
    cbtn(12 + bw, y + 56, bw, 30, true, 'violet'); rvT('Back', 12 + bw + bw / 2, y + 76, 12, '#fff', 'center'); chit(12 + bw, y + 56, bw, 30, () => { acConfirm = false; sfx('ui_tap'); }); y += 100;
  }
  if (st.vows.pending.length) {
    if (!acClearAsk) { cbtn(2, y, cw - 4, 32, true, 'red'); rvT('Take back locked vows', cw / 2, y + 21, 12, '#fff', 'center'); chit(2, y, cw - 4, 32, () => { acClearAsk = true; }); }
    else { cbtn(2, y, cw - 4, 32, true, 'red'); rvT('Tap again to remove them', cw / 2, y + 21, 12, '#fff', 'center'); chit(2, y, cw - 4, 32, () => { st.vows.pending = []; acClearAsk = false; save(); }); }
    y += 40;
  } else acClearAsk = false;
  y = note(y + 4, cw, 'How a tour works: stand still on the crown monument in the Stage Plaza. Your island and coins reset. You KEEP crowns, perks, critters, outfits and milestones. Every tour starts the next Act: new land names, foes 12% tougher, bigger crown rewards.');
  return y + 10;
}
regTab('perks', 'tour', 'Tour', (cw) => { try { return acTourTab(cw); } catch (e) { return 40; } }, { show: () => S.lands.length >= 3 || S.prestiges > 0 });

// ---- HUD: act chip
function acDrawChip() {
  const a = actNow(); if (a < 2 || S.sheet) return; let y = typeof leftBottom === 'number' ? leftBottom : 130;
  const w = 108, h = 22; plaque(8, y, w, h, 11); rvT('ACT ' + a, 16, y + 15, 11, acTint(a) || '#ffe98a', 'left'); rvT(acPrefix(a), 56, y + 15, 10, '#cfc6ee', 'left', false);
  hitRect(8, y, w, h, () => openSheet('perks', 'tour')); y += h + 4; if (typeof leftBottom === 'number') leftBottom = y;
}
// foe wrapper: act aura behind tinted foes + the rival band members
if (typeof drawFoe === 'function') {
  const rvOrigDrawFoe = drawFoe;
  drawFoe = function (e) {
    try {
      if (e.rival) { rvDrawMember(e); return; }
      if (e.actTint) { const r = e.r, c = e.actTint, fy = e.y - r * 0.4; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5; const gl = ctx.createRadialGradient(e.x, fy, 2, e.x, fy, r * 1.9); gl.addColorStop(0, c + '88'); gl.addColorStop(1, c + '00'); ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(e.x, fy, r * 1.9, 0, TAU); ctx.fill(); ctx.restore(); }
    } catch (err) { /* cosmetic only */ }
    rvOrigDrawFoe(e);
  };
}

// ================================================================ 3) GHOST DUELS
const GH_NAMES = ['Starlight', 'Pixel', 'Mochi', 'Echo', 'Nova', 'Biscuit', 'Comet', 'Zephyr'];
const GH_NPC = [
  { id: 'npc0', n: 'Mochi', f: 0.45, a: 0.9, b: 1.2, skin: 'rawclaw', note: 'Rookie busker' },
  { id: 'npc1', n: 'Pixel', f: 0.75, a: 1.15, b: 0.85, skin: 'andy', note: 'Glass-cannon guitarist' },
  { id: 'npc2', n: 'Starlight', f: 1.0, a: 1.0, b: 1.0, skin: 'jasmin', note: 'Your match' },
  { id: 'npc3', n: 'Comet', f: 1.45, a: 0.85, b: 1.3, skin: 'roxor', note: 'Tough drummer' },
  { id: 'npc4', n: 'Nova', f: 2.1, a: 1.1, b: 1.1, skin: 'jordan', note: 'Headliner legend' },
];
const GH_B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_', GH_PREFIX = 'EI1.';
const ghClean = (s) => String(s == null ? '' : s).replace(/[^A-Za-z0-9 _.-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14);
function ghFnv(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
const ghHex6 = (s) => ('000000' + (ghFnv(s) & 0xffffff).toString(16)).slice(-6);
function ghB64e(s) {
  let o = ''; for (let i = 0; i < s.length; i += 3) {
    const a = s.charCodeAt(i) & 255, b = i + 1 < s.length ? s.charCodeAt(i + 1) & 255 : 0, c = i + 2 < s.length ? s.charCodeAt(i + 2) & 255 : 0, n = (a << 16) | (b << 8) | c;
    o += GH_B64[(n >> 18) & 63] + GH_B64[(n >> 12) & 63]; if (i + 1 < s.length) o += GH_B64[(n >> 6) & 63]; if (i + 2 < s.length) o += GH_B64[n & 63];
  } return o;
}
function ghB64d(s) {
  let o = '', buf = 0, bits = 0;
  for (let i = 0; i < s.length; i++) { const v = GH_B64.indexOf(s[i]); if (v < 0) return null; buf = (buf << 6) | v; bits += 6; if (bits >= 8) { bits -= 8; o += String.fromCharCode((buf >> bits) & 255); } buf &= (1 << bits) - 1; }
  return o;
}
const ghSig = (x) => { x = +x; return isFinite(x) ? Number(x.toPrecision(5)) : 0; };
const ghNum = (v, lo, hi, int) => { v = +v; if (typeof v !== 'number' || !isFinite(v)) return null; v = clamp(v, lo, hi); return int ? Math.round(v) : v; };
// stat block -> code string
function ghostEncode(s) {
  const arr = [1, ghClean(s.n) || 'Ghost', Math.round(s.l), ghSig(s.d), ghSig(s.h), ghSig(s.r), Math.round(s.c), Math.round(s.k), Math.round(s.t), ghSig(s.g || 0), String(s.s || 'jasmin').replace(/[^a-z_]/g, '').slice(0, 14), Math.round(s.p || 0), ghSig(s.q || 0)];
  const json = JSON.stringify(arr); return GH_PREFIX + ghB64e(json) + '.' + ghHex6(json);
}
// code string -> validated stat block, or null (never throws)
function ghostDecode(code) {
  try {
    if (typeof code !== 'string') return null; code = code.trim(); if (code.length < 20 || code.length > 600 || code.indexOf(GH_PREFIX) !== 0) return null;
    const body = code.slice(GH_PREFIX.length), dot = body.lastIndexOf('.'); if (dot < 4) return null;
    const json = ghB64d(body.slice(0, dot)); if (json === null || ghHex6(json) !== body.slice(dot + 1)) return null;
    const a = JSON.parse(json); if (!Array.isArray(a) || a.length !== 13 || a[0] !== 1 || typeof a[1] !== 'string' || typeof a[10] !== 'string') return null;
    const o = { n: ghClean(a[1]) || 'Ghost', l: ghNum(a[2], 1, 9999, true), d: ghNum(a[3], 0.01, 1e24), h: ghNum(a[4], 1, 1e18), r: ghNum(a[5], 0.1, 10), c: ghNum(a[6], 0, 1e6, true), k: ghNum(a[7], 1, 99, true), t: ghNum(a[8], 0, 9999, true), g: ghNum(a[9], 0, 1e12), s: a[10], p: ghNum(a[11], 0, 999, true), q: ghNum(a[12], 0, 1) };
    for (const k in o) if (o[k] === null) return null;
    if (!SKINS.some(sk => sk.id === o.s)) o.s = 'jasmin';
    return o;
  } catch (e) { return null; }
}
function ghTownSum() { return typeof townLevelSum === 'function' ? townLevelSum() : 0; }
function ghostSnapshot() {
  const st = fs('ghosts'); let g = 0; try { g = typeof gearPower === 'function' ? gearPower() : (S.feat.gear && +S.feat.gear.power) || 0; } catch (e) { g = 0; }
  return { n: st.name || 'Starlight', l: S.level, d: pDmg(), h: pMaxHp(), r: pRate(), c: S.crowns, k: S.lands.length, t: ghTownSum(), g: g || 0, s: S.skins.active, p: S.prestiges || 0, q: critChance() };
}
function ghNpc(i) {
  const def = GH_NPC[i], me = ghostSnapshot(), f = def.f;
  return { id: def.id, npc: true, note: def.note, n: def.n, l: Math.max(1, Math.round(me.l * f)), d: ghSig(me.d * f * def.a), h: ghSig(me.h * f * def.b), r: ghSig(clamp(me.r / (0.8 + f * 0.2), 0.25, 2.5)), c: Math.round(me.c * f), k: Math.max(1, Math.round(me.k * Math.min(1, f))), t: Math.round(me.t * f), g: ghSig(me.g * f), s: def.skin, p: Math.round(me.p * Math.min(1, f)), q: me.q };
}
function ghList() { const st = fs('ghosts'), out = []; for (let i = 0; i < GH_NPC.length; i++) out.push(ghNpc(i)); for (const im of st.imports) { const g = ghostDecode(im.code); if (g) { g.id = im.id; g.code = im.code; out.push(g); } } return out; }
function ghostImport(code) {
  const st = fs('ghosts'), g = ghostDecode(code); if (!g) return { ok: false, err: 'That code is not valid. Ask your friend to copy it again.' };
  const id = 'g' + ghHex6(code.trim()); if (st.imports.some(i => i.id === id)) return { ok: true, id, dup: true };
  st.imports.push({ id, code: code.trim() }); if (st.imports.length > 8) st.imports.shift(); return { ok: true, id };
}
const ghPower = (s) => (s.d / clamp(s.r, 0.25, 2.5)) * s.h;
// ---- deterministic duel simulation (hero + 2 band mates per side). Returns {win, ev[], dur}
function ghSim(A, B) {
  const norm = (s) => ({ dmg: Math.max(0.01, +s.d), hp: Math.max(1, +s.h), rate: clamp(+s.r, 0.25, 2.5), crit: clamp((+s.q || 0) + 0.1, 0.08, 0.6), dodge: clamp(0.05 + (+s.l || 1) * 0.0008, 0.05, 0.2) });
  const sd = [norm(A), norm(B)], rng = mkRng(ghFnv(JSON.stringify([sd[0].hp, sd[0].dmg, sd[0].rate, sd[1].hp, sd[1].dmg, sd[1].rate, A.l, B.l])));
  const sides = sd.map(s => ({ s, ult: 6 + rng() * 2, u: [0, 1, 2].map(i => ({ hp: 1, max: s.hp * (i ? 0.45 : 1), dmg: s.dmg * (i ? 0.45 : 1), rate: s.rate * (i ? 1.25 : 1), next: 0.3 + i * 0.17 + rng() * 0.2 })) }));
  const ev = []; let t = 0;
  const living = (x) => { const o = []; for (let i = 0; i < 3; i++) if (x.u[i].hp > 0) o.push(i); return o; };
  for (let guard = 0; guard < 5000; guard++) {
    let bs = -1, bu = -1, bt = 1e9;
    for (let s = 0; s < 2; s++) { for (let i = 0; i < 3; i++) { const u = sides[s].u[i]; if (u.hp > 0 && u.next < bt) { bt = u.next; bs = s; bu = i; } } if (sides[s].ult < bt) { bt = sides[s].ult; bs = s; bu = -1; } }
    if (bt > 45) break; t = bt;
    const me = sides[bs], foe = sides[1 - bs], fl = living(foe);
    if (bu < 0) { // ultimate flare: hits every living enemy, cannot be dodged
      me.ult += 9; const lead = me.u[0].hp > 0 ? me.u[0].dmg : me.s.dmg * 0.45;
      fl.forEach((ti, n) => { const tu = foe.u[ti], f = clamp(lead * 3 / tu.max, 0.05, 0.35); tu.hp = Math.max(0, tu.hp - f); ev.push({ t, s: bs, u: 0, tu: ti, ty: 'ult', abs: lead * 3, hp: tu.hp, first: n === 0 }); });
    } else {
      const u = me.u[bu]; u.next += u.rate * (0.9 + rng() * 0.2); const ti = fl[Math.floor(rng() * fl.length)], tu = foe.u[ti];
      if (rng() < foe.s.dodge) ev.push({ t, s: bs, u: bu, tu: ti, ty: 'dodge', abs: 0, hp: tu.hp });
      else { const crit = rng() < me.s.crit, f = clamp(u.dmg / tu.max, 0.012, 0.3) * (crit ? 2.5 : 1); tu.hp = Math.max(0, tu.hp - f); ev.push({ t, s: bs, u: bu, tu: ti, ty: crit ? 'crit' : 'hit', abs: u.dmg * (crit ? 2.5 : 1), hp: tu.hp }); }
    }
    if (!living(foe).length) break;
  }
  const sc = sides.map(x => x.u.reduce((a, u, i) => a + u.hp * (i ? 0.45 : 1), 0)), a0 = living(sides[0]).length, a1 = living(sides[1]).length;
  const win = a1 === 0 ? true : a0 === 0 ? false : sc[0] > sc[1];
  return { win, ev, dur: Math.max(1, t + 0.6), left: [sides[0].u.map(u => u.hp), sides[1].u.map(u => u.hp)] };
}
function ghReward(g, win) {
  const st = fs('ghosts'), me = ghostSnapshot(), tier = clamp(Math.sqrt(ghPower(g) / Math.max(1e-9, ghPower(me))), 0.3, 3), today = rvDayStr();
  const out = { win, tier, gems: 0, coins: 0, frag: 0, already: false };
  if (!win) return out;
  if (st.rewarded[g.id] === today) { out.already = true; return out; }
  st.rewarded[g.id] = today; out.gems = Math.max(1, Math.round(1 + tier * 1.5)); out.coins = Math.ceil(helmVal(Math.max(1, S.lands.length)) * 80 * coinMul() * (0.4 + tier)); out.frag = tier >= 1 ? 1 : 0;
  S.gems += out.gems; S.stats.gemsFound += out.gems; S.pallet += out.coins; S.stats.earned += out.coins; if (out.frag) fs('acts').frags++;
  return out;
}
let ghDuel = null;
function ghStartDuel(g) {
  if (!g || ghDuel) return false; const me = ghostSnapshot(), res = ghSim(me, g), held = !S.hold;
  ghDuel = { g, res, pt: 0, dur: 15, idx: 0, hp: [[1, 1, 1], [1, 1, 1]], atk: [[-9, -9, -9], [-9, -9, -9]], hit: [[-9, -9, -9], [-9, -9, -9]], fl: [], ult: -9, ultSide: 0, over: false, reward: null, held, me, names: [ghClean(me.n) || 'You', g.n] };
  S.hold = true; S.sheet = null; fs('ghosts').duels++; sfx('ui_open'); return true;
}
function ghFinish() {
  const d = ghDuel; if (!d || d.over) return; d.over = true; const st = fs('ghosts');
  d.hp = d.res.left.map(a => a.slice()); d.pt = d.dur; d.reward = ghReward(d.g, d.res.win);
  if (d.res.win) { st.wins++; st.defeated[d.g.id] = true; sfx('win', true); JUICE.flash = 0.4; } else sfx('hurt');
  save();
}
function ghDuelAdvance(dt) {
  const d = ghDuel; if (!d || d.over) return; d.pt += dt; const simT = Math.min(d.res.dur, d.pt / d.dur * d.res.dur);
  while (d.idx < d.res.ev.length && d.res.ev[d.idx].t <= simT) {
    const e = d.res.ev[d.idx++], ts = 1 - e.s; d.hp[ts][e.tu] = e.hp; d.atk[e.s][e.u] = d.pt; if (e.ty !== 'dodge') d.hit[ts][e.tu] = d.pt;
    if (e.ty === 'ult' && e.first) { d.ult = d.pt; d.ultSide = e.s; sfx('ult'); }
    if (e.ty !== 'ult' || e.first) d.fl.push({ s: ts, u: e.tu, txt: e.ty === 'dodge' ? 'MISS' : fmt(e.abs), col: e.ty === 'crit' ? '#ff8a3c' : e.ty === 'dodge' ? '#b8fff6' : e.ty === 'ult' ? '#ff9ac8' : '#fff', t: d.pt, big: e.ty !== 'hit' });
    if (e.ty === 'crit') sfx('crit');
  }
  if (d.fl.length > 12) d.fl.splice(0, d.fl.length - 12);
  if (d.pt >= d.dur) ghFinish();
}
function ghCloseDuel() { const d = ghDuel; if (!d) return; if (!d.over) ghFinish(); if (d.held) S.hold = false; ghDuel = null; sfx('ui_close'); }
let ghLastWall = 0;
function ghDrawDuel() {
  const d = ghDuel; if (!d) return; const now = Date.now(); ghDuelAdvance(Math.min(0.05, Math.max(0, (now - (ghLastWall || now)) / 1000))); ghLastWall = now;
  S.sheet = null; S.modal = null; hitRect(0, 0, vw, vh, () => {});
  ctx.fillStyle = 'rgba(20,10,50,0.82)'; ctx.fillRect(0, 0, vw, vh);
  const w = Math.min(vw - 16, 400), h = 330, x = (vw - w) / 2, y = Math.max(20, vh * 0.5 - h / 2 - 20), sc = w / 380, cx = x + w / 2;
  plaque(x, y, w, h, 18); stickerText('GHOST DUEL', cx, y + 30, 22, '#fff6c0', '#ffb640', 0);
  rvT(d.names[0] + '  vs  ' + d.names[1] + ' (ghost)', cx, y + 50, 11, '#cfc6ee', 'center', false);
  // arena
  ctx.save(); rr(x + 10, y + 60, w - 20, 188, 14); ctx.clip(); const sky = ctx.createLinearGradient(0, y + 60, 0, y + 248); sky.addColorStop(0, '#5a48b0'); sky.addColorStop(1, '#ff9ac8'); ctx.fillStyle = sky; ctx.fillRect(x + 10, y + 60, w - 20, 188);
  ctx.fillStyle = '#3a2a86'; ctx.fillRect(x + 10, y + 214, w - 20, 40);
  const ua = d.pt - d.ult; if (ua >= 0 && ua < 0.7) { const f = ua / 0.7; ctx.fillStyle = 'rgba(255,240,170,' + (0.5 * (1 - f)) + ')'; ctx.fillRect(x + 10, y + 60, w - 20, 188); ctx.strokeStyle = '#ff9ac8'; ctx.lineWidth = 6 * (1 - f); ctx.beginPath(); ctx.arc(cx + (d.ultSide ? 60 : -60) * sc, y + 190, 30 + f * 200, 0, TAU); ctx.stroke(); }
  const names = [[activeSkin().art, activeSkin().comp, (S.pop[0] && S.pop[0].art) || 'andy'], [skinDef(d.g.s).art, skinDef(d.g.s).comp, 'rawclaw']];
  const posx = [60, 112, 160], fy = y + 222;
  for (let s = 0; s < 2; s++) for (let i = 2; i >= 0; i--) {
    const dir = s ? 1 : -1, ux = cx + dir * posx[i] * sc, hp = d.hp[s][i], dead = hp <= 0, lunge = clamp(1 - (d.pt - d.atk[s][i]) / 0.25, 0, 1) * -dir * 12 * sc, hurt = d.pt - d.hit[s][i] < 0.2;
    const anim = dead ? 'down' : hurt ? 'hurt' : d.pt - d.atk[s][i] < 0.3 ? 'attack' : 'idle', fr = dead ? 1 : hurt ? 0 : ((d.pt * 8 + i) | 0);
    const nm = names[s][i]; shadow(ux + lunge, fy + 2, 18 * sc, 0.3);
    ctx.globalAlpha = dead ? 0.55 : 1; if (!artDraw(nm, anim, fr, ux + lunge, fy, (i ? 0.42 : 0.52) * sc, s === 1)) { ctx.fillStyle = s ? '#ff7eb6' : '#6ac8ff'; rr(ux - 10, fy - 40, 20, 40, 8); ctx.fill(); } ctx.globalAlpha = 1;
    const bw = 36 * sc, by = fy - (i ? 76 : 90) * sc; ctx.fillStyle = 'rgba(40,16,70,0.85)'; rr(ux - bw / 2 - 1, by - 1, bw + 2, 6, 3); ctx.fill(); if (hp > 0) { ctx.fillStyle = s ? '#ff8aa8' : '#7fe36a'; rr(ux - bw / 2, by, Math.max(2, bw * hp), 4, 2); ctx.fill(); }
  }
  for (const f of d.fl) { const age = d.pt - f.t; if (age > 0.9) continue; const ux = cx + (f.s ? 1 : -1) * posx[f.u] * sc, up = age * 50; ctx.globalAlpha = clamp(1.2 - age * 1.2, 0, 1); rvT(f.txt, ux, fy - 100 * sc - up, f.big ? 16 : 12, f.col, 'center'); ctx.globalAlpha = 1; }
  ctx.restore();
  // total bars
  const tot = (s) => (d.hp[s][0] + d.hp[s][1] * 0.45 + d.hp[s][2] * 0.45) / 1.9, bw = (w - 44) / 2;
  gbar(x + 14, y + 256, bw, 10, tot(0), '#9af0b4', '#3fcf6a'); gbar(x + w - 14 - bw, y + 256, bw, 10, tot(1), '#ff9ac8', '#e8407f');
  if (!d.over) { const bwb = 120; cbtn(cx - bwb / 2, y + 282, bwb, 34, true, 'violet'); rvT('Skip', cx, y + 304, 14, '#fff', 'center'); hitRect(cx - bwb / 2, y + 282, bwb, 34, () => ghFinish()); }
  else {
    const r = d.reward, win = d.res.win; stickerText(win ? 'YOU WIN!' : 'DEFEATED', cx, y + 285, 18, win ? '#fff6c0' : '#e6dcff', win ? '#ffb640' : '#a78bff', 0);
    rvT(win ? (r.already ? 'Already rewarded today — just for fun!' : '+' + r.gems + ' gems  +' + fmt(r.coins) + ' coins' + (r.frag ? '  +1 crown fragment' : '')) : 'Train up and try again — no penalty.', cx, y + 304, 11, '#ffe98a', 'center', false);
    cbtn(x + w - 74, y + 8, 62, 26, true, 'go'); rvT('Done', x + w - 43, y + 26, 12, '#fff', 'center'); hitRect(x + w - 74, y + 8, 62, 26, () => ghCloseDuel());
  }
}
// ---- Ghosts tab
let ghSel = 'npc2', ghFlip = false, ghMsg = '', ghMsgT = 0;
function ghCopy(code) {
  try { if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(code).then(() => { ghMsg = 'Copied!'; ghMsgT = Date.now(); }, () => { ghPrompt('Copy your code:', code); }); return; } } catch (e) { /* fall through */ }
  ghPrompt('Copy your code:', code);
}
function ghPrompt(msg, val) { try { if (typeof window !== 'undefined' && typeof window.prompt === 'function') return window.prompt(msg, val || ''); } catch (e) { /* ignore */ } return null; }
function ghDoImport() {
  const code = ghPrompt('Paste your friend\'s ghost code:', ''); if (code === null || code === undefined) return;
  const r = ghostImport(String(code)); ghMsg = r.ok ? (r.dup ? 'You already have that ghost.' : 'Ghost added!') : r.err; ghMsgT = Date.now(); if (r.ok) { ghSel = r.id; ghFlip = false; save(); }
}
function ghRename() { const v = ghPrompt('Name your ghost (up to 14 letters):', fs('ghosts').name); if (v === null || v === undefined) return; const n = ghClean(v); if (n) { fs('ghosts').name = n; save(); } }
function ghCycleName() { const st = fs('ghosts'), i = GH_NAMES.indexOf(st.name); st.name = GH_NAMES[(i + 1) % GH_NAMES.length]; sfx('ui_tap'); save(); }
function ghPostcard(x, y, w, h, g) {
  ctx.save(); card(x, y, w, h, 14); ctx.fillStyle = '#e8f6ff'; rr(x + 8, y + 8, w - 16, h * 0.46, 10); ctx.fill();
  ctx.save(); rr(x + 8, y + 8, w - 16, h * 0.46, 10); ctx.clip();
  const bi = (i) => BIOMES[i % 8].g[0]; const n = Math.min(g.k, 8); // a tiny sketch of the island chain
  for (let i = 0; i < n; i++) { const px = x + 30 + (i / Math.max(1, n - 1 || 1)) * (w - 60) * (n > 1 ? 1 : 0.5), py = y + 8 + h * 0.23 + Math.sin(i * 1.7) * 16; ctx.fillStyle = bi(i); ctx.beginPath(); ctx.ellipse(px, py, 18, 12, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = HV.line; ctx.lineWidth = 2; ctx.stroke(); }
  ctx.restore();
  const tier = (typeof TOWN_TIERS !== 'undefined') ? (() => { let ti = 0; for (let i = 0; i < TOWN_TIERS.length; i++) if (g.t >= TOWN_TIERS[i][1]) ti = i; return TOWN_TIERS[ti][0]; })() : 'Town';
  rvT('Greetings from ' + g.n + '\'s island!', x + w / 2, y + h * 0.46 + 30, 13, '#4a2a7a', 'center');
  rvT(g.k + ' lands · ' + tier + ' · Season ' + (g.p + 1), x + w / 2, y + h * 0.46 + 48, 11, '#6a5a8a', 'center', false);
  rvT('Level ' + g.l + ' · ' + fmt(g.c) + ' crowns', x + w / 2, y + h * 0.46 + 64, 11, '#6a5a8a', 'center', false);
  ctx.restore();
}
function ghTab(cw) {
  const st = fs('ghosts'); st.seenTab = true; let y = 4;
  rowCard(y, 58, cw); drawIcon('mic', 28, y + 29, 34); rvT('Ghost duels', 54, y + 24, 16, '#ffd84d'); ctx.font = font(10, false); ctx.fillStyle = '#cfc6ee'; ctx.textAlign = 'left'; wrapText('Ghosts are saved builds — no internet needed. Nobody is online: the game plays both sides.', 54, y + 40, cw - 90, 12); rvInfo(cw, y + 12, 'ghosts'); y += 66;
  y = section(y, 'My ghost');
  const me = ghostSnapshot(), code = ghostEncode(me); rowCard(y, 138, cw);
  artHead(activeSkin().art, 30, y + 30, 20); rvT(me.n, 60, y + 26, 15, '#fff'); rvT('Lv ' + me.l + ' · ' + me.k + ' lands · ' + fmt(me.c) + ' crowns · power ' + fmt(ghPower(me)), 60, y + 44, 10, '#cfc6ee', 'left', false);
  const half = (cw - 24) / 2; cbtn(8, y + 56, half, 26, true, 'violet'); rvT('Next name', 8 + half / 2, y + 74, 11, '#fff', 'center'); chit(8, y + 56, half, 26, ghCycleName); cbtn(16 + half, y + 56, half, 26, true, 'violet'); rvT('Type a name', 16 + half + half / 2, y + 74, 11, '#fff', 'center'); chit(16 + half, y + 56, half, 26, ghRename);
  ctx.fillStyle = 'rgba(10,4,30,0.6)'; rr(8, y + 88, cw - 100, 40, 8); ctx.fill(); ctx.font = font(8, false); ctx.fillStyle = '#9af0b4'; ctx.textAlign = 'left'; const L = 26; for (let i = 0; i < 3; i++) ctx.fillText(code.slice(i * L, (i + 1) * L) + (i === 2 && code.length > 3 * L ? '…' : ''), 14, y + 102 + i * 10);
  cbtn(cw - 86, y + 88, 78, 40, true, 'gold'); rvT(Date.now() - ghMsgT < 2500 && ghMsg === 'Copied!' ? 'Copied!' : 'Copy', cw - 47, y + 113, 13, '#3a2410', 'center'); chit(cw - 86, y + 88, 78, 40, () => ghCopy(code)); y += 146;
  y = section(y, 'Challenge a ghost');
  const list = ghList();
  for (const g of list) {
    const sel = ghSel === g.id, def = !!st.defeated[g.id], pw = Math.sqrt(ghPower(g) / Math.max(1e-9, ghPower(me)));
    rowCard(y, 50, cw); if (sel) { ctx.strokeStyle = '#ffe98a'; ctx.lineWidth = 3; rr(2, y, cw - 4, 50, 12); ctx.stroke(); }
    artHead(skinDef(g.s).art, 28, y + 25, 17); rvT(g.n, 54, y + 22, 13, '#fff'); rvT((g.note || 'Friend ghost') + ' · ' + (pw < 0.8 ? 'weaker' : pw < 1.25 ? 'even' : pw < 2 ? 'stronger' : 'much stronger'), 54, y + 39, 10, '#cfc6ee', 'left', false);
    if (def) drawIcon('star', cw - 26, y + 25, 26); chit(2, y, cw - 4, 50, () => { ghSel = g.id; ghFlip = false; sfx('ui_tap'); }); y += 56;
  }
  cbtn(2, y, cw - 4, 36, true, 'pink'); rvT('Paste a friend\'s code', cw / 2, y + 23, 13, '#fff', 'center'); chit(2, y, cw - 4, 36, ghDoImport); y += 42;
  if (Date.now() - ghMsgT < 4000 && ghMsg && ghMsg !== 'Copied!') y = note(y, cw, ghMsg, '#ffb0b0');
  const g = list.find(q => q.id === ghSel) || list[2];
  if (g) {
    y = section(y + 2, ghFlip ? 'Postcard' : 'Selected ghost');
    if (ghFlip) { ghPostcard(6, y, cw - 12, 170, g); y += 182; }
    else { rowCard(y, 70, cw); rvT(g.n + (st.defeated[g.id] ? '  ★ defeated' : ''), 12, y + 22, 14, '#fff'); rvT('Lv ' + g.l + ' · hit ' + fmt(g.d) + ' · health ' + fmt(g.h) + ' · ' + (1 / g.r).toFixed(1) + ' shots/s', 12, y + 40, 10, '#cfc6ee', 'left', false); rvT(st.rewarded[g.id] === rvDayStr() ? 'Reward already taken today' : 'Win for gems, coins and a crown fragment (once a day)', 12, y + 56, 10, st.rewarded[g.id] === rvDayStr() ? '#ffb0b0' : '#9af0b4', 'left', false); y += 78; }
    const bh = (cw - 16) / 2; cbtn(4, y, bh, 40, true, 'go'); rvT('Duel!', 4 + bh / 2, y + 26, 15, '#fff', 'center'); chit(4, y, bh, 40, () => ghStartDuel(g)); cbtn(12 + bh, y, bh, 40, true, 'violet'); rvT(ghFlip ? 'Back' : 'Visit island', 12 + bh + bh / 2, y + 26, 13, '#fff', 'center'); chit(12 + bh, y, bh, 40, () => { ghFlip = !ghFlip; sfx('ui_tap'); }); y += 48;
  }
  y = note(y, cw, 'Duels: you and two band mates against a ghost and two of its mates, about 15 seconds. Wins: ' + st.wins + ' · Ghosts beaten: ' + Object.keys(st.defeated).length + '.', '#9d93c4');
  return y + 10;
}
regTab('more', 'ghosts', 'Ghosts', (cw) => { try { return ghTab(cw); } catch (e) { return 40; } });

// ================================================================ rivals tab (Goals)
function rvTab(cw) {
  const st = rvState(), A = fs('acts'); let y = 4;
  rowCard(y, 62, cw); drawIcon('trophy', 28, y + 31, 34); rvT('Rival bands', 54, y + 24, 16, '#ffd84d'); rvT('Wins ' + (A.rw || 0) + ' · Losses ' + (A.rl || 0) + ' · Crown fragments ' + (A.frags || 0), 54, y + 42, 10, '#cfc6ee', 'left', false); rvT('Rival posters: ' + Object.keys(A.posters || {}).length + '/' + RV_BANDS.length, 54, y + 55, 10, '#ffe98a', 'left', false); rvInfo(cw, y + 12, 'rivals'); y += 70;
  y = section(y, 'Invasions now');
  const tl = rvTakenList();
  if (!tl.length) {
    if (S.lands.length < 3) y = note(y, cw, 'Rival bands only show up once you own 3 lands. Keep exploring!');
    else y = note(y, cw, 'No rival band is here right now. Hint: they like to move into the land you have visited least recently, about every ' + (st.cd > 120 ? 'few' : 'couple of') + ' minutes of play. Next visit in about ' + Math.max(1, Math.ceil(st.cd / 60)) + ' min.');
  }
  for (const k of tl) {
    const B = RV_BANDS[st.taken[k].band]; rowCard(y, 88, cw); ctx.fillStyle = B.col; rr(2, y, 6, 88, 3); ctx.fill();
    B.m.forEach((m, i) => artHead(m.spr, 32 + i * 40, y + 28, 16)); rvT(B.name + ' took ' + biomeOf(k).name, 14, y + 64, 12, '#fff'); ctx.font = font(10, false); ctx.fillStyle = '#cfc6ee'; ctx.textAlign = 'left'; wrapText('Towers there are off and creatures are 40% tougher. Walk onto the glowing Stage Battle pad.', 14, y + 77, cw - 100, 11);
    if (st.cool[k]) rvT('Rest ' + Math.ceil(st.cool[k]) + 's', cw - 12, y + 24, 11, '#ffb0b0', 'right'); y += 96;
  }
  y = section(y + 2, 'The bands');
  RV_BANDS.forEach((B) => {
    rowCard(y, 66, cw); B.m.forEach((m, i) => artHead(m.spr, 30 + i * 36, y + 26, 14)); rvT(B.name, 14 + 3 * 36 + 8, y + 22, 13, B.col); rvT((A.bw[B.id] || 0) + ' wins · ' + (A.bl[B.id] || 0) + ' losses', 14 + 3 * 36 + 8, y + 38, 10, '#cfc6ee', 'left', false);
    ctx.font = font(9, false); ctx.fillStyle = '#9d93c4'; ctx.textAlign = 'left'; wrapText(B.theme, 12, y + 58, cw - 70, 10);
    if (A.posters[B.id]) { drawIcon('scroll', cw - 26, y + 24, 28); rvT('x' + A.posters[B.id], cw - 26, y + 52, 10, '#ffe98a', 'center'); } y += 72;
  });
  return y + 8;
}
regTab('goals', 'rivals', 'Rivals', (cw) => { try { return rvTab(cw); } catch (e) { return 40; } }, { show: () => S.lands.length >= 3 || Object.keys(S.feat.rivals && S.feat.rivals.taken || {}).length > 0 });

// ================================================================ registration
regFeature({
  id: 'rivals', keep: false,
  init(st) { if (typeof st.cd !== 'number') st.cd = rvCd(0); if (!st.taken) st.taken = {}; if (!st.visit) st.visit = {}; if (!st.cool) st.cool = {}; if (typeof st.seq !== 'number') st.seq = 0; if (typeof st.clock !== 'number') st.clock = 0; st.padHold = 0; st.battle = null; },
  tick(dt) { try { rvTick(dt); } catch (e) { /* never break the frame */ } },
  on: { spawn(e, z) { if (e && z && landTaken(z.k)) rvBuff(e); }, die() { if (rvState().battle) rvLose('You fainted'); } },
  drawWorld() { try { const st = rvState(); for (const k in st.taken) { if (!landTaken(+k)) continue; const z = S.lands[k - 1]; if (!z) continue; rvDrawTaken(z, st.taken[k]); rvDrawPad(+k, st.taken[k]); } } catch (e) { /* cosmetic */ } },
  drawHud() { try { rvDrawBattleHud(); rvDrawChips(); } catch (e) { /* cosmetic */ } },
  api: { RV_BANDS, rvInvade, rvStartBattle, rvEndBattle, rvPadSpot, rvTick, rvBuff, landTaken, rvTakenList, rvEligible, rvCd },
});
regFeature({
  id: 'acts', keep: true,
  init: acInit,
  tick(dt) { try { acTick(dt); } catch (e) { /* never break the frame */ } },
  on: {
    spawn(e) { acSpawn(e); },
    prestige() { try { const st = fs('acts'); st.lastGain = crownsToGain(); } catch (e) { /* ignore */ } },
  },
  onTour(st) {
    const b = acBonus(st.lastGain, st.vows.active);
    if (b > 0) { S.crowns += b; st.lastBonus = b; st.bonusTotal += b; toast('Vows kept! +' + b + ' bonus crowns', 'crown', 4.5); } else st.lastBonus = 0;
    st.vows.active = st.vows.pending.slice(); st.vows.pending = []; acPick = []; acConfirm = false;
    if (st.petStash && !S.activePet) S.activePet = st.petStash; st.petStash = null;
  },
  onLoad() { acRename(); },
  drawHud() { try { acDrawChip(); } catch (e) { /* cosmetic */ } },
  api: { AC_VOWS, actNow, actVows, acBonus, acBonusPct, acLock, acPrefix, acTint, acRename },
});
regFeature({
  id: 'ghosts', keep: true,
  init(st) { if (!st.name) st.name = GH_NAMES[0]; if (!st.defeated) st.defeated = {}; if (!st.rewarded) st.rewarded = {}; if (!Array.isArray(st.imports)) st.imports = []; st.imports = st.imports.filter(i => i && typeof i.code === 'string' && typeof i.id === 'string').slice(0, 8); for (const k of ['duels', 'wins']) if (typeof st[k] !== 'number') st[k] = 0; },
  drawHud() { try { ghDrawDuel(); } catch (e) { ghDuel = null; } },
  api: { ghostEncode, ghostDecode, ghostSnapshot, ghostImport, ghSim, ghList, ghNpc, ghStartDuel, ghDuelAdvance, ghFinish, ghCloseDuel, ghReward, ghDuel: () => ghDuel, ghPower },
});

// ================================================================ tutorial hooks (guarded: tutorial.js may be absent)
if (typeof tutAdd === 'function') {
  tutAdd({ id: 'rv_first', order: 5000, icon: 'tower', title: 'A rival band!',
    when: () => rvTakenList().length > 0 && !S.sheet,
    text: 'A rival band took over a land! Its towers stopped and its creatures are tougher. Walk onto the glowing Stage Battle pad there to win it back.',
    target: () => { const k = rvTakenList()[0]; return k ? rvPadSpot(k) : null; } });
  tutAdd({ id: 'ac_tour', order: 5100, icon: 'crown', title: 'Encore Tour vows',
    when: () => S.lands.length >= PRESTIGE_MIN && !S.sheet, sheet: 'perks', tab: 'tour',
    text: 'Before a tour you can pick Vows: harder rules for your next run that pay extra crowns later. A tour resets your island but you keep crowns, perks and critters.' });
  tutAdd({ id: 'ac_act', order: 5200, icon: 'star', title: 'A new Act!',
    when: () => actNow() >= 2 && !S.sheet, text: 'Every tour starts a new Act. The lands have new names and the creatures glow with a new colour and are a little tougher. Crown rewards grow too!' });
  tutAdd({ id: 'gh_first', order: 5300, icon: 'mic', title: 'Ghost duels',
    when: () => S.lands.length >= 3 && S.stats.kills > 60 && !S.sheet && !fs('ghosts').seenTab, text: 'Want a quick fight? Open More, then the Ghosts tab. A ghost is a saved build you can duel for gems. It works without internet.' });
}
if (typeof tutHelp === 'function') {
  tutHelp('help_rivals', 'Rival bands', 'Every ten minutes or so a rival band can take over one of your lands. Its towers stop and its creatures get tougher. Walk onto the glowing Stage Battle pad and beat all three band members in 90 seconds to win the land back. If you lose, nothing is lost. Look in Goals, then Rivals.', 'tower');
  tutHelp('help_acts', 'Acts and vows', 'Each Encore Tour begins a new Act with new land names and tougher creatures. Before you tour, open Perks, then Tour, to pick Vows. A vow makes your next run harder. When you tour again you get bonus crowns for every vow you kept.', 'crown');
  tutHelp('help_ghosts', 'Ghost duels', 'A ghost is a saved copy of a build. Open More, then Ghosts, to copy your own code for a friend, paste theirs, or duel one of five built-in ghosts. Win a duel for gems, coins and a crown fragment, once a day per ghost. No internet is needed.', 'mic');
}
if (typeof window !== 'undefined') { window.landTaken = landTaken; }
