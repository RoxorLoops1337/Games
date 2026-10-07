'use strict';
// Encore Island — meta features: SEASONS (calendar themes + quest line + exclusive outfit), CHALLENGE runs (daily/weekly rule-twisted mini-runs),
// COLLECTION BOOK (museum album with permanent milestone bonuses). Three features: 'seasons', 'challenge', 'book' (all keep:true).
// Emits: 'seasonQuest'(i), 'seasonDone'(seasonId), 'challengeStart'({mode,rules}), 'challenge'({mode,stars,score,key}), 'bookMilestone'({page,pct}).
// Expects (optional): gearAddScrap(n) for challenge prizes; S.feat.lands.found, S.feat.gear, S.feat.songs for the Book pages.

// ================================================================== shared helpers
const metaNow = () => { const f = S && S.feat && S.feat.seasons && S.feat.seasons.fakeNow; return f ? new Date(f) : new Date(); };
const metaHash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const metaLv = () => Math.max(1, S.lands.length);
function metaDayNum(d) { return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); }
function metaTime(sec) { sec = Math.max(0, Math.ceil(sec)); return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2); }
function metaStars(x, y, n, size, gap) { for (let i = 0; i < 3; i++) { ctx.globalAlpha = i < n ? 1 : 0.28; drawIcon('star', x + (i - 1) * gap, y, size); } ctx.globalAlpha = 1; }

// ================================================================== 1) SEASONS
const SEASONS = [
  { id: 'spring', name: 'Spring Blossom', months: [2, 3, 4], col: '#ff9ac8', col2: '#ffd0e6', tint: 'rgba(255,160,210,0.07)', fx: 'petal', ic: 'heart',
    skin: { id: 'sk_spring', name: 'Blossom Jasmin', art: 'jasmin_unicorn', comp: 'roxor_monster' },
    qs: ['Petal Patrol', 'Blossom Market', 'Garden Gate', 'Bloom Boss', 'Spring Fortune'] },
  { id: 'summer', name: 'Summer Festival', months: [5, 6, 7], col: '#ffd84d', col2: '#fff0a0', tint: 'rgba(255,214,110,0.06)', fx: 'firefly', ic: 'star',
    skin: { id: 'sk_summer', name: 'Festival Roxor', art: 'roxor_monster', comp: 'jasmin_unicorn' },
    qs: ['Fireworks Rush', 'Festival Stall', 'Beach Landing', 'Parade Crasher', 'Summer Jackpot'] },
  { id: 'autumn', name: 'Autumn Harvest', months: [8, 9, 10], col: '#ff9a2e', col2: '#ffd09a', tint: 'rgba(255,140,50,0.08)', fx: 'leaf', ic: 'coin',
    skin: { id: 'sk_autumn', name: 'Harvest RawClaw', art: 'rawclaw_goat', comp: 'jasmin', },
    qs: ['Leaf Sweepers', 'Harvest Fair', 'Orchard Trail', 'Scarecrow King', 'Golden Harvest'] },
  { id: 'winter', name: 'Winter Wonderland', months: [11, 0, 1], col: '#9ad8ff', col2: '#e4f6ff', tint: 'rgba(150,200,255,0.09)', fx: 'snow', ic: 'gem',
    skin: { id: 'sk_winter', name: 'Frosty Jasmin', art: 'jasmin_unicorn', comp: 'roxor_monster' },
    qs: ['Snowball Fight', 'Mittens Market', 'Frozen Shore', 'Ice Headliner', 'Winter Treasure'] },
];
const SEAS_KINDS = ['kill', 'sell', 'land', 'boss', 'earn'];
const SEAS_GEMS = [2, 3, 4, 6, 10], SEAS_COIN = [1, 2, 4, 8, 16];
// season skins join the global outfit list at load; they can only be earned through their quest line
for (const s of SEASONS) if (!SKINS.some(k => k.id === s.skin.id)) SKINS.push({ id: s.skin.id, name: s.skin.name, art: s.skin.art, comp: s.skin.comp, cost: 9999, cur: 'gem', season: s.id, lockText: 'Season quest line' });
if (typeof buySkin === 'function') { const _buySkin = buySkin; buySkin = function (id) { const d = SKINS.find(k => k.id === id); if (d && d.season && !skinOwned(id)) { float(S.player.x, S.player.y - 80, 'Finish the ' + seasDef(d.season).name + ' quest line', '#ffd94a'); return false; } return _buySkin(id); }; }

function seasDef(id) { return SEASONS.find(s => s.id === id) || SEASONS[0]; }
function seasonOfDate(d) { const m = d.getMonth(); return SEASONS.find(s => s.months.includes(m)); }
function seasonYear(d, id) { return (id === 'winter' && d.getMonth() <= 1) ? d.getFullYear() - 1 : d.getFullYear(); }
function seasCur() { const st = S.feat.seasons, d = metaNow(); return (st && st.force && SEASONS.find(s => s.id === st.force)) || seasonOfDate(d); }
function seasKey() { const d = metaNow(), sd = seasCur(); return sd.id + '-' + seasonYear(d, sd.id); }
function seasDaysLeft() { // days until the current calendar season ends (null when previewing a forced season)
  const d = metaNow(), real = seasonOfDate(d), sd = seasCur(); if (real.id !== sd.id) return null;
  let e = new Date(d.getFullYear(), d.getMonth(), 1); while (seasonOfDate(e).id === real.id) e = new Date(e.getFullYear(), e.getMonth() + 1, 1);
  return Math.max(0, Math.ceil((e - d) / 864e5));
}
function seasRec(key) { const st = S.feat.seasons; key = key || seasKey(); return st.rec[key] || (st.rec[key] = { i: 0, p: 0, g: [0, 0, 0, 0, 0], outfit: false }); }
function seasGoal(i, rec) {
  rec = rec || seasRec(); if (rec.g[i]) return rec.g[i];
  const k = SEAS_KINDS[i], g = k === 'kill' ? 60 : k === 'sell' ? 80 : k === 'land' ? 1 : k === 'boss' ? 1 : Math.ceil(300 * helmVal(metaLv()));
  return (rec.g[i] = g);
}
function seasQuestName(i, goal) { const k = SEAS_KINDS[i]; goal = goal || seasGoal(i); return k === 'kill' ? 'Defeat ' + goal + ' creatures' : k === 'sell' ? 'Sell ' + goal + ' items' : k === 'land' ? 'Open a new land' : k === 'boss' ? 'Defeat a Headliner' : 'Earn ' + fmt(goal) + ' coins'; }
function seasReward(i) { return { gems: SEAS_GEMS[i], coins: Math.ceil(40 * SEAS_COIN[i] * helmVal(metaLv())) }; }
function seasAdd(kind, n) {
  if (!S.started) return; const rec = seasRec(); if (rec.i >= 5 || SEAS_KINDS[rec.i] !== kind) return;
  rec.p = Math.min(seasGoal(rec.i, rec), rec.p + n);
}
const seasReady = () => { const r = seasRec(); return r.i < 5 && r.p >= seasGoal(r.i, r); };
function seasClaim() {
  const rec = seasRec(), i = rec.i; if (i >= 5 || rec.p < seasGoal(i, rec)) return false;
  const rw = seasReward(i), sd = seasCur();
  S.gems += rw.gems; S.stats.gemsFound += rw.gems; S.wallet += rw.coins; S.feat.seasons.lastEarn = S.stats.earned;
  rec.i++; rec.p = 0; sfx('levelup', true); starBurst(S.player.x, S.player.y - 40, 16, [sd.col, '#ffe98a'], 280);
  float(S.player.x, S.player.y - 90, '+' + rw.gems + ' gems  +' + fmt(rw.coins), '#ffd94a', true);
  fEmit('seasonQuest', i);
  if (rec.i >= 5 && !rec.outfit) {
    rec.outfit = true; S.skins.owned[sd.skin.id] = true; S.toasts.push({ txt: 'Season outfit: ' + sd.skin.name + '!', t: 0, ic: 'heart', life: 4 });
    JUICE.flash = 0.5; starBurst(S.player.x, S.player.y - 40, 30, [sd.col, '#ffe98a', '#fff4e6'], 380); sfx('win', true); fEmit('seasonDone', sd.id);
  }
  save(); return true;
}

function seasDrawFx() { // screen-space season tint + <= 28 ambient particles (no allocation)
  const st = S.feat.seasons; if (!st || st.off || !S.started) return;
  const sd = seasCur(), t = S.t;
  ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = sd.tint; ctx.fillRect(0, 0, vw, vh);
  if (S.settings.particles !== false) {
    const fx = sd.fx, N = fx === 'snow' ? 28 : 22;
    for (let i = 0; i < N; i++) {
      const sp = 0.04 + (i % 6) * 0.007, ph = (t * sp + i * 0.137) % 1, bx = (((i * 0.6180339) % 1) * vw) + Math.sin(t * 0.7 + i * 1.7) * 18, by = ph * (vh + 40) - 20;
      if (fx === 'petal') { ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.6; ctx.fillStyle = i % 3 ? '#ffb6d6' : '#fff0f6'; ctx.save(); ctx.translate(bx, by); ctx.rotate(t * 1.2 + i); ctx.scale(1, 0.5 + 0.5 * Math.abs(Math.sin(t * 2 + i))); ctx.beginPath(); ctx.ellipse(0, 0, 6, 3.4, 0, 0, TAU); ctx.fill(); ctx.restore(); }
      else if (fx === 'firefly') { const fy = vh * (0.25 + ((i * 0.37) % 0.6)) + Math.sin(t * 0.6 + i * 2.1) * 26, fxx = bx + Math.cos(t * 0.5 + i) * 22, a = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.6 + i * 1.3)); ctx.globalAlpha = a * 0.35; ctx.fillStyle = '#fff6a0'; ctx.beginPath(); ctx.arc(fxx, fy, 8, 0, TAU); ctx.fill(); ctx.globalAlpha = a; ctx.fillStyle = '#fffbd0'; ctx.beginPath(); ctx.arc(fxx, fy, 2.4, 0, TAU); ctx.fill(); }
      else if (fx === 'leaf') { ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.75; ctx.fillStyle = i % 3 === 0 ? '#e0662a' : i % 3 === 1 ? '#f0a02a' : '#b84a22'; ctx.save(); ctx.translate(bx + Math.sin(t * 1.4 + i) * 14, by); ctx.rotate(t * 1.6 + i * 2); ctx.beginPath(); ctx.moveTo(0, -6); ctx.quadraticCurveTo(6, 0, 0, 7); ctx.quadraticCurveTo(-6, 0, 0, -6); ctx.fill(); ctx.restore(); }
      else { ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.85; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(bx + Math.sin(t * 0.9 + i) * 10, by, 1.8 + (i % 4) * 0.7, 0, TAU); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function seasTab(cw) {
  const st = S.feat.seasons, sd = seasCur(), rec = seasRec(), dl = seasDaysLeft(); let y = 4;
  rowCard(y, 70, cw); ctx.fillStyle = sd.col; ctx.globalAlpha = 0.25; rr(2, y, cw - 4, 70, 12); ctx.fill(); ctx.globalAlpha = 1;
  drawIcon(sd.ic, 30, y + 35, 38); ctx.fillStyle = sd.col2; ctx.font = font(18); ctx.textAlign = 'left'; ctx.fillText(sd.name, 56, y + 28);
  ctx.fillStyle = '#e6dcff'; ctx.font = font(11, false); ctx.fillText(dl === null ? 'Preview mode — not claimable until it is the real season' : dl + ' day' + (dl === 1 ? '' : 's') + ' left this season', 56, y + 46);
  ctx.fillStyle = '#cfc6ee'; ctx.font = font(10, false); ctx.fillText('Quest line ' + Math.min(5, rec.i) + ' / 5', 56, y + 62);
  const on = !st.off, bx = cw - 74; pill(bx, y + 8, 62, 22, on ? '#7cf09a' : '#6a5aa0', on ? '#25a84f' : '#3e3076'); ctx.fillStyle = '#fff'; ctx.font = font(10); ctx.textAlign = 'center'; ctx.fillText(on ? 'FX ON' : 'FX OFF', bx + 31, y + 23); chit(bx, y + 4, 62, 30, () => { st.off = !st.off; sfx('ui_tap'); });
  y += 78; y = section(y, 'Seasonal quest line');
  for (let i = 0; i < 5; i++) {
    const done = i < rec.i, cur = i === rec.i, goal = seasGoal(i, rec), prog = cur ? rec.p : done ? goal : 0, can = cur && prog >= goal, rw = seasReward(i);
    rowCard(y, 66, cw); if (cur) { ctx.strokeStyle = sd.col; ctx.lineWidth = 2.5; rr(2, y, cw - 4, 66, 12); ctx.stroke(); }
    drawIcon(done ? 'tick' : cur ? 'scroll' : 'lock', 26, y + 33, 30);
    ctx.fillStyle = done ? '#9af0b4' : cur ? '#fff' : '#a69cc8'; ctx.font = font(12); ctx.textAlign = 'left'; ctx.fillText((i + 1) + '. ' + sd.qs[i], 50, y + 20);
    ctx.fillStyle = '#cfc6ee'; ctx.font = font(10, false); ctx.fillText(seasQuestName(i, goal), 50, y + 34);
    gbar(50, y + 40, cw - 160, 9, prog / goal, '#c6ffa0', '#3fcf6a'); ctx.fillStyle = '#cfc6ee'; ctx.font = font(9); ctx.fillText(fmt(prog) + ' / ' + fmt(goal) + '   +' + rw.gems + ' gems, ' + fmt(rw.coins) + ' coins', 50, y + 60);
    if (can) { cbtn(cw - 92, y + 16, 82, 34, true, 'go'); ctx.fillStyle = '#fff'; ctx.font = font(13); ctx.textAlign = 'center'; ctx.fillText('CLAIM', cw - 51, y + 38); chit(cw - 92, y + 16, 82, 34, seasClaim); }
    else if (done) { ctx.fillStyle = '#9af0b4'; ctx.font = font(11); ctx.textAlign = 'center'; ctx.fillText('CLAIMED', cw - 51, y + 38); }
    y += 72;
  }
  rowCard(y, 84, cw); const sk = SKINS.find(k => k.id === sd.skin.id), own = skinOwned(sd.skin.id);
  ctx.fillStyle = 'rgba(255,244,230,0.9)'; ctx.beginPath(); ctx.arc(40, y + 42, 32, 0, TAU); ctx.fill(); if (!own) ctx.globalAlpha = 0.55; artDraw(sk.art, 'idle', (S.t * 4) | 0, 40, y + 68, 0.3, false); ctx.globalAlpha = 1;
  ctx.fillStyle = sd.col; ctx.beginPath(); ctx.arc(66, y + 18, 10, 0, TAU); ctx.fill(); drawIcon(sd.ic, 66, y + 18, 14);
  ctx.fillStyle = '#ffd84d'; ctx.font = font(13); ctx.textAlign = 'left'; ctx.fillText('Exclusive outfit', 86, y + 28); ctx.fillStyle = '#fff'; ctx.font = font(15); ctx.fillText(sd.skin.name, 86, y + 48);
  ctx.fillStyle = own ? '#9af0b4' : '#cfc6ee'; ctx.font = font(10, false); ctx.fillText(own ? 'Yours! Wear it in Heroes > Outfits' : 'Finish all 5 quests to win it', 86, y + 66); y += 92;
  y = section(y, 'Earlier seasons'); let any = false;
  for (const key in st.rec) { if (key === seasKey()) continue; const r = st.rec[key]; any = true; rowCard(y, 30, cw); ctx.fillStyle = '#e6dcff'; ctx.font = font(11); ctx.textAlign = 'left'; ctx.fillText(key.replace('-', ' ').replace(/^./, c => c.toUpperCase()), 14, y + 20); ctx.fillStyle = r.outfit ? '#9af0b4' : '#cfc6ee'; ctx.textAlign = 'right'; ctx.fillText(r.outfit ? 'Outfit won' : Math.min(5, r.i) + ' / 5 (closed)', cw - 14, y + 20); y += 36; }
  if (!any) y = note(y, cw, 'Finished seasons show up here. You can only claim the current season.');
  return y + 6;
}

regFeature({
  id: 'seasons', keep: true,
  api: { SEASONS, seasonOfDate, seasCur, seasKey, seasRec, seasGoal, seasAdd, seasClaim, seasDaysLeft, seasReady, seasReward },
  init(st) { if (st.force === undefined) st.force = null; if (!st.rec) st.rec = {}; if (st.off === undefined) st.off = false; if (st.lastEarned === undefined) st.lastEarned = S.stats ? S.stats.earned : 0; if (!st.fakeNow) st.fakeNow = 0; if (S.stats && st.lastEarned > S.stats.earned) st.lastEarned = S.stats.earned; seasRec(); },
  tick() { const st = S.feat.seasons, e = S.stats.earned; if (e > st.lastEarned) { seasAdd('earn', e - st.lastEarned); } st.lastEarned = e; },
  drawWorld() { seasDrawFx(); },
  on: { kill() { seasAdd('kill', 1); }, sell() { seasAdd('sell', 1); }, land() { seasAdd('land', 1); }, boss() { seasAdd('boss', 1); } },
  pips() { return { goals: seasReady() }; },
});
regTab('goals', 'season', 'Season', seasTab);

// ================================================================== 2) CHALLENGE RUNS
const CHAL_RULES = [
  { id: 'nodash', name: 'No Dash', desc: 'Your dash is switched off. Walk carefully!', mul: 0.9 },
  { id: 'fans', name: 'Fans Only', desc: 'Your hero hits 80% softer. Let the crowd do the work!', mul: 0.5, mods: { dmg: 0.2 } },
  { id: 'onehit', name: 'One-Hit', desc: 'Any hit leaves you at 1 HP. Every kill heals you a bit.', mul: 0.8 },
  { id: 'glass', name: 'Glass Cannon', desc: 'Triple damage, but only 30% of your health.', mul: 1, mods: { dmg: 3, hp: 0.3 } },
  { id: 'beat', name: 'Beat Only', desc: 'Only kills landed on the beat count for your score.', mul: 0.8 },
  { id: 'speed', name: 'Speed Run', desc: 'Defeat 60 creatures fast. Spare time is bonus score.', mul: 1.1, goal: 60 },
  { id: 'slowfeet', name: 'Heavy Boots', desc: 'You walk 40% slower but hit 50% harder.', mul: 0.9, mods: { speed: 0.6, dmg: 1.5 } },
];
const CHAL = { on: false, rules: [], mods: { dmg: 1, hp: 1, speed: 1, rate: 1 }, flags: {}, t: 0, dur: 180, kills: 0, raw: 0, combo: 0, earn0: 0, spawnCd: 0, mode: 'daily', key: '', ko: false, goal: 0 };
const CHAL_STAR = [300, 600, 900];
const CHAL_PRIZE = { daily: { gems: [2, 4, 6], coin: [1, 2.5, 5], scrap: [2, 4, 8] }, weekly: { gems: [6, 12, 20], coin: [4, 10, 20], scrap: [6, 12, 24] } };
regMod('dmg', () => CHAL.on ? CHAL.mods.dmg : 1); regMod('hp', () => CHAL.on ? CHAL.mods.hp : 1); regMod('speed', () => CHAL.on ? CHAL.mods.speed : 1); regMod('rate', () => CHAL.on ? CHAL.mods.rate : 1);
if (typeof dashAbility === 'function') { const _dash = dashAbility; dashAbility = function () { if (CHAL.on && CHAL.flags.nodash) return false; return _dash(); }; }
if (typeof hurtPlayer === 'function') {
  const _hurt = hurtPlayer;
  hurtPlayer = function (d, src) {
    if (CHAL.on && CHAL.flags.onehit) { const p = S.player; if (p.invuln > 0) return; if (p.hp > 1.5) { p.hp = 1; p.hurtT = 0.18; p.invuln = 0.6; shake(5); sfx('hurt', true); S.combo = Math.floor(S.combo * 0.5); return; } }
    return _hurt(d, src);
  };
}
function chalDayKey(d) { return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
function chalWeekKey(d) { return 'W' + Math.floor((metaDayNum(d) + 3) / 7); }
function chalKey(mode, d) { d = d || metaNow(); return mode === 'weekly' ? chalWeekKey(d) : chalDayKey(d); }
function chalRules(mode, d) { // deterministic from the date: daily = one rule, weekly = two
  d = d || metaNow(); const N = CHAL_RULES.length, key = chalKey(mode, d);
  if (mode !== 'weekly') return [CHAL_RULES[metaHash('d' + key) % N]];
  const a = metaHash('w' + key) % N, b = (a + 1 + metaHash('x' + key) % (N - 1)) % N; return [CHAL_RULES[a], CHAL_RULES[b]];
}
function chalThresholds(mode, rules) { let m = mode === 'weekly' ? 1.5 : 1; for (const r of rules) m *= r.mul; return CHAL_STAR.map(v => Math.round(v * m / 10) * 10); }
function chalReset(mode) { // seconds until the next day/week
  const d = metaNow(), mid = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1), days = mode === 'weekly' ? 6 - ((metaDayNum(d) + 3) % 7) : 0;
  return Math.max(0, (mid - d) / 1000 + days * 86400);
}
function chalScore() { const coins = Math.max(0, S.stats.earned - CHAL.earn0); return CHAL.kills * 10 + CHAL.combo * 5 + Math.floor(coins / (helmVal(metaLv()) * 3)); }
function chalPrize(mode, stars) { const p = CHAL_PRIZE[mode], i = stars - 1; return stars < 1 ? { gems: 0, coins: 0, scrap: 0 } : { gems: p.gems[i], coins: Math.ceil(60 * helmVal(metaLv()) * p.coin[i]), scrap: p.scrap[i] }; }
function chalSpawn(z) {
  const before = S.enemies.length; spawnEnemy(z); if (S.enemies.length === before) return;
  const e = S.enemies[S.enemies.length - 1]; e.chal = true; e.hp = e.max = Math.max(1, Math.ceil(e.max * 0.6)); e.dmg *= 0.7;
  const w = wanderPoint(z); e.x = w.x; e.y = w.y; e.tx = w.x; e.ty = w.y;
}
function chalStart(mode) {
  const st = S.feat.challenge; if (!S.started || CHAL.on || st.result) return false;
  const rules = chalRules(mode), p = S.player, z = S.lands[S.lands.length - 1]; if (!z) return false;
  st.snap = { x: p.x, y: p.y, hp: p.hp, h: p.helmets.map(e => Object.assign({}, e)) }; st.active = true;
  Object.assign(CHAL, { on: true, rules, mode, key: chalKey(mode), t: 0, dur: mode === 'weekly' ? 210 : 180, kills: 0, raw: 0, combo: 0, earn0: S.stats.earned, spawnCd: 0, ko: false, flags: {}, goal: 0, land: z.k });
  CHAL.mods = { dmg: 1, hp: 1, speed: 1, rate: 1 };
  for (const r of rules) { CHAL.flags[r.id] = true; if (r.goal) CHAL.goal = r.goal; if (r.mods) for (const k in r.mods) CHAL.mods[k] *= r.mods[k]; }
  p.helmets = []; S.combo = 0; S.sheet = null; S.modal = null;
  const g = z.g, c = walkable(g.x, g.y, S.lands.length) ? { x: g.x, y: g.y } : wanderPoint(z); p.x = c.x; p.y = c.y; p.vx = p.vy = 0; p.invuln = 2.5; p.maxHp = pMaxHp(); p.hp = p.maxHp;
  for (let i = 0; i < 6; i++) chalSpawn(z);
  ringFx(p.x, p.y, 200, '#ffe98a', 0.6); starBurst(p.x, p.y - 30, 18, ['#ffe98a', '#ff9ac8'], 300); sfx('warp', true);
  S.toasts.push({ txt: rules.map(r => r.name).join(' + ') + ' — go!', t: 0, ic: 'trophy', life: 3 });
  fEmit('challengeStart', { mode, rules: rules.map(r => r.id) }); return true;
}
function chalRestore(keepHelmets) { // put the hero back where the run began and sweep the challenge creatures away
  const st = S.feat.challenge, sn = st.snap, p = S.player;
  if (sn) {
    const cur = keepHelmets || []; p.helmets = sn.h.concat(cur).slice(0, cap());
    p.x = sn.x; p.y = sn.y; if (!walkable(p.x, p.y, S.lands.length)) { p.x = STAGE.x; p.y = STAGE.y; }
    p.maxHp = pMaxHp(); p.hp = clamp(sn.hp, 1, p.maxHp); p.vx = p.vy = 0; p.invuln = 1.5;
  }
  for (const e of S.enemies) if (e.chal) e.hp = 0; compact(S.enemies, e => !e.chal);
  st.snap = null; st.active = false; CHAL.on = false; CHAL.mods = { dmg: 1, hp: 1, speed: 1, rate: 1 }; CHAL.flags = {};
  ringFx(p.x, p.y, 160, '#c6a8ff', 0.5);
}
function chalFinish(why) {
  if (!CHAL.on) return null; const st = S.feat.challenge, mode = CHAL.mode, key = CHAL.key, rules = CHAL.rules;
  let score = chalScore(); if (why === 'goal') score += Math.floor(Math.max(0, CHAL.dur - CHAL.t)) * 8;
  const p = S.player, mine = p.helmets; chalRestore(mine);
  if (why === 'abort') { S.toasts.push({ txt: 'Challenge aborted — nothing lost', t: 0, ic: 'trophy' }); return null; }
  const th = chalThresholds(mode, rules); let stars = 0; for (let i = 0; i < 3; i++) if (score >= th[i]) stars = i + 1;
  const bk = mode + ':' + key, prev = st.best[bk] || { score: 0, stars: 0 }, paid = st.paid[bk] || 0, newBest = score > prev.score;
  if (newBest) st.best[bk] = { score, stars: Math.max(stars, prev.stars) }; else if (stars > prev.stars) prev.stars = stars;
  const full = chalPrize(mode, Math.max(stars, paid)), had = chalPrize(mode, paid), rw = { gems: Math.max(0, full.gems - had.gems), coins: Math.max(0, full.coins - had.coins), scrap: Math.max(0, full.scrap - had.scrap) };
  if (stars > paid) st.paid[bk] = stars; else rw.gems = rw.coins = rw.scrap = 0;
  if (rw.gems) { S.gems += rw.gems; S.stats.gemsFound += rw.gems; } if (rw.coins) S.wallet += rw.coins; if (rw.scrap && !chalScrap(rw.scrap)) rw.scrap = 0;
  st.paid = chalTrim(st.paid); st.best = chalTrim(st.best);
  st.hist.push({ mode, key, score, stars, ts: metaNow().getTime() }); st.hist.sort((a, b) => b.score - a.score); st.hist.length = Math.min(5, st.hist.length);
  st.result = { mode, key, rules: rules.map(r => r.name), score, stars, best: Math.max(prev.score, score), newBest, rw, why, kills: CHAL.kills, combo: CHAL.combo, th };
  if (stars) { sfx('win', true); JUICE.flash = 0.4; starBurst(p.x, p.y - 40, 24, ['#ffe98a', '#ff9ac8', '#9af0b4'], 340); } else sfx('hurt');
  fEmit('challenge', { mode, stars, score, key }); save(); return st.result;
}
function chalHasScrap() { return typeof gearAddScrap === 'function' || !!(S.feat.gear && typeof S.feat.gear.scrap === 'number'); }
function chalScrap(n) { if (typeof gearAddScrap === 'function') { gearAddScrap(n); return true; } const G = S.feat.gear; if (G && typeof G.scrap === 'number') { G.scrap += n; return true; } return false; }
function chalTrim(o) { const ks = Object.keys(o); if (ks.length > 40) { ks.sort(); for (let i = 0; i < ks.length - 40; i++) delete o[ks[i]]; } return o; }
function chalAbort() { return chalFinish('abort'); }
function chalDraw() { // HUD pill under the rank pill + result card
  const st = S.feat.challenge;
  if (CHAL.on && !S.sheet) {
    const left = 188, right = vw - 96; if (right - left >= 100) {
      const w = clamp(right - left, 112, 214), x = left + (right - left - w) / 2, y = 44, h = 44, tl = Math.max(0, CHAL.dur - CHAL.t), f = tl / CHAL.dur, tw = w - 44;
      ctx.fillStyle = HV.line; rr(x - 2, y - 2, w + 4, h + 4, 14); ctx.fill(); const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#6a4ad0'); g.addColorStop(1, '#3a2784'); ctx.fillStyle = g; rr(x, y, w, h, 12); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; rr(x + 6, y + h - 8, w - 12, 4, 2); ctx.fill(); ctx.fillStyle = f < 0.2 ? '#ff6a5a' : '#9af0b4'; rr(x + 6, y + h - 8, Math.max(2, (w - 12) * f), 4, 2); ctx.fill();
      ctx.textAlign = 'left'; ctx.fillStyle = '#ffe98a'; ctx.font = font(9); let nm = CHAL.rules.map(r => r.name).join(' + '); if (ctx.measureText(nm).width > tw) { nm = CHAL.rules.map(r => r.name.split(' ')[0]).join('+'); } while (nm.length > 4 && ctx.measureText(nm).width > tw) nm = nm.slice(0, -2); ctx.fillText(nm, x + 8, y + 12);
      const sc = chalScore(), th = chalThresholds(CHAL.mode, CHAL.rules); let sn = 0; for (let i = 0; i < 3; i++) if (sc >= th[i]) sn = i + 1;
      ctx.fillStyle = '#fff'; ctx.font = font(15); ctx.fillText(metaTime(tl), x + 8, y + 29); const tx2 = x + 12 + ctx.measureText(metaTime(tl)).width; ctx.font = font(10); ctx.fillStyle = sn >= 3 ? '#9af0b4' : '#ffd94a'; ctx.fillText(CHAL.goal ? CHAL.kills + '/' + CHAL.goal : fmt(sc) + (sn ? ' ' + '★'.repeat(sn) : ' pts'), tx2, y + 29);
      const ax = x + w - 34, ay = y + 5; disc(ax + 14, ay + 14, 14, '#ff9a8a', '#e8384f'); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(ax + 9, ay + 9); ctx.lineTo(ax + 19, ay + 19); ctx.moveTo(ax + 19, ay + 9); ctx.lineTo(ax + 9, ay + 19); ctx.stroke(); ctx.lineCap = 'butt';
      hitRect(ax - 4, y - 2, 40, h + 4, chalAbort);
    }
  }
  const r = st.result; if (r && !S.sheet && !S.modal && !S.cards) {
    hits.push({ x: 0, y: 0, w: vw, h: vh, act: () => {} }); ctx.fillStyle = 'rgba(25,12,60,0.7)'; ctx.fillRect(0, 0, vw, vh);
    const w = Math.min(320, vw - 32), x = (vw - w) / 2, y = Math.max(70, vh * 0.17), h = 330, cx = vw / 2;
    card(x, y, w, h, 18); ctx.textAlign = 'center'; ctx.fillStyle = '#4a2a7a'; ctx.font = font(20); ctx.fillText(r.why === 'goal' ? 'GOAL REACHED!' : r.why === 'ko' ? 'KNOCKED OUT' : 'TIME!', cx, y + 34);
    ctx.fillStyle = '#7a62b0'; ctx.font = font(11); ctx.fillText((r.mode === 'weekly' ? 'Weekly: ' : 'Daily: ') + r.rules.join(' + '), cx, y + 54);
    metaStars(cx, y + 92, r.stars, 44, 52); ctx.fillStyle = '#4a2a7a'; ctx.font = font(26); ctx.fillText(fmt(r.score) + ' pts', cx, y + 150);
    ctx.font = font(11, false); ctx.fillStyle = r.newBest ? '#1f9a4a' : '#6a5a8a'; ctx.fillText(r.newBest ? 'NEW PERSONAL BEST!' : 'Personal best ' + fmt(r.best), cx, y + 170);
    ctx.fillStyle = '#6a5a8a'; ctx.font = font(10, false); ctx.fillText(r.kills + ' kills  ·  best combo ' + r.combo + '  ·  stars at ' + r.th.map(fmt).join(' / '), cx, y + 188);
    const parts = []; if (r.rw.gems) parts.push('+' + r.rw.gems + ' gems'); if (r.rw.coins) parts.push('+' + fmt(r.rw.coins) + ' coins'); if (r.rw.scrap) parts.push('+' + r.rw.scrap + ' scrap');
    ctx.fillStyle = '#4a2a7a'; ctx.font = font(13); ctx.fillText(parts.length ? 'Prize: ' + parts.join('  ') : r.stars ? 'Prize already claimed' : 'Reach 1 star for a prize', cx, y + 222);
    cbtn(x + 30, y + 250, w - 60, 48, true, 'go'); ctx.fillStyle = '#fff'; ctx.font = font(16); ctx.fillText('Back to the island', cx, y + 281); hitRect(x + 30, y + 250, w - 60, 48, () => { st.result = null; sfx('ui_tap'); });
  }
}
function chalCard(cw, y, mode) {
  const st = S.feat.challenge, rules = chalRules(mode), th = chalThresholds(mode, rules), bk = mode + ':' + chalKey(mode), best = st.best[bk], paid = st.paid[bk] || 0, wk = mode === 'weekly';
  const h = 164 + rules.length * 44; rowCard(y, h, cw); ctx.fillStyle = wk ? 'rgba(167,123,255,0.22)' : 'rgba(255,216,77,0.14)'; rr(2, y, cw - 4, h, 12); ctx.fill();
  drawIcon(wk ? 'crown' : 'trophy', 28, y + 28, 32); ctx.fillStyle = '#ffd84d'; ctx.font = font(16); ctx.textAlign = 'left'; ctx.fillText(wk ? 'Weekly Challenge' : 'Daily Challenge', 52, y + 26);
  ctx.fillStyle = '#cfc6ee'; ctx.font = font(10, false); ctx.fillText('New in ' + (chalReset(mode) > 86400 ? Math.floor(chalReset(mode) / 86400) + 'd ' : '') + Math.floor(chalReset(mode) % 86400 / 3600) + 'h ' + Math.floor(chalReset(mode) % 3600 / 60) + 'm  ·  ' + (wk ? '3.5' : '3') + ' minutes', 52, y + 42);
  rules.forEach((r, i) => { const b0 = y + 56 + i * 44; ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = font(13); ctx.fillText(r.name, 14, b0 + 8); ctx.fillStyle = '#e6dcff'; ctx.font = font(10, false); wrapText(r.desc, 14, b0 + 22, cw - 40, 12); });
  const yy = y + 56 + rules.length * 44 + 2; ctx.textAlign = 'left'; ctx.fillStyle = '#cfc6ee'; ctx.font = font(10, false); ctx.fillText('Stars at ' + th.map(fmt).join(' / ') + ' pts', 14, yy + 8);
  ctx.fillStyle = '#ffd94a'; ctx.fillText(best ? 'Best ' + fmt(best.score) + ' pts' : 'Not played yet', 14, yy + 22); metaStars(cw - 54, yy + 14, best ? best.stars : 0, 18, 22);
  const pz = chalPrize(mode, 3); ctx.fillStyle = '#6ee0d8'; ctx.fillText('Prize up to ' + pz.gems + ' gems + ' + fmt(pz.coins) + ' coins' + (chalHasScrap() ? ' + ' + pz.scrap + ' scrap' : '') + (paid ? '   (claimed ' + paid + ' star' + (paid > 1 ? 's' : '') + ')' : ''), 14, yy + 38);
  const by = y + h - 50, on = !CHAL.on && !st.result; cbtn(10, by, cw - 20, 42, on, wk ? 'violet' : 'go'); ctx.fillStyle = '#fff'; ctx.font = font(15); ctx.textAlign = 'center'; ctx.fillText(CHAL.on ? 'Run in progress…' : 'START', cw / 2, by + 27); if (on) chit(10, by, cw - 20, 42, () => chalStart(mode));
  return y + h + 8;
}
function chalTab(cw) {
  const st = S.feat.challenge; let y = 4;
  if (CHAL.on) { rowCard(y, 60, cw); ctx.fillStyle = '#ffe98a'; ctx.font = font(14); ctx.textAlign = 'left'; ctx.fillText('A challenge is running', 14, y + 24); cbtn(cw - 100, y + 12, 88, 36, true, 'red'); ctx.fillStyle = '#fff'; ctx.font = font(12); ctx.textAlign = 'center'; ctx.fillText('ABORT', cw - 56, y + 35); chit(cw - 100, y + 12, 88, 36, chalAbort); y += 68; }
  y = section(y, 'Short runs with a twist'); y = chalCard(cw, y, 'daily'); y = chalCard(cw, y, 'weekly');
  y = section(y, 'Your best runs');
  if (!st.hist.length) y = note(y, cw, 'Finish a challenge and your top 5 scores are listed here.');
  else st.hist.forEach((h, i) => { rowCard(y, 30, cw); ctx.fillStyle = '#e6dcff'; ctx.font = font(11); ctx.textAlign = 'left'; ctx.fillText((i + 1) + '.  ' + (h.mode === 'weekly' ? 'Weekly' : 'Daily') + '  ' + fmt(h.score) + ' pts', 14, y + 20); metaStars(cw - 50, y + 15, h.stars, 14, 18); y += 36; });
  return note(y, cw, 'You can abort any time with the red X on the timer. Your outfit, loot and position come back.') + 6;
}
regFeature({
  id: 'challenge', keep: true,
  api: { CHAL, CHAL_RULES, chalStart, chalFinish, chalAbort, chalRules, chalKey, chalScore, chalThresholds, chalPrize, chalReset },
  init(st) { if (!st.best) st.best = {}; if (!st.paid) st.paid = {}; if (!st.hist) st.hist = []; if (st.active === undefined) st.active = false; if (st.snap === undefined) st.snap = null; if (st.result === undefined) st.result = null; },
  tick(dt) {
    const st = S.feat.challenge;
    if (st.active && !CHAL.on) { chalRestore([]); S.player.helmets = S.player.helmets.slice(0, cap()); return; } // a run that survived a reload is unwound
    if (!CHAL.on) return;
    CHAL.t += dt; if (S.combo > CHAL.combo) CHAL.combo = S.combo;
    if (CHAL.ko) return void chalFinish('ko');
    if (CHAL.goal && CHAL.kills >= CHAL.goal) return void chalFinish('goal');
    if (CHAL.t >= CHAL.dur) return void chalFinish('time');
    CHAL.spawnCd -= dt; if (CHAL.spawnCd <= 0) { CHAL.spawnCd = 0.9; let n = 0; for (const e of S.enemies) if (e.chal && e.hp > 0) n++; if (n < 12) { const z = S.lands[CHAL.land - 1]; if (z) chalSpawn(z); } }
  },
  drawHud() { chalDraw(); },
  on: {
    kill(e) { if (!CHAL.on) return; CHAL.raw++; if (CHAL.flags.beat && !onBeatNow()) return; CHAL.kills++; if (CHAL.flags.onehit) { const p = S.player; p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.3); } },
    die() { if (CHAL.on) CHAL.ko = true; }, prestige() { if (CHAL.on) chalFinish('abort'); },
  },
});
regTab('goals', 'challenge', 'Challenge', chalTab);

// ================================================================== 3) COLLECTION BOOK
const BOOK_PAGES = [
  { id: 'creatures', label: 'Creatures', ic: 'paw', kind: 'dmg', amt: 0.02, what: 'damage' },
  { id: 'pets', label: 'Pets', ic: 'pet', kind: 'coin', amt: 0.02, what: 'coins' },
  { id: 'outfits', label: 'Outfits', ic: 'heart', kind: 'xp', amt: 0.03, what: 'XP' },
  { id: 'helmets', label: 'Helmets', ic: 'cap', kind: 'magnet', amt: 0.04, what: 'pickup range' },
  { id: 'secrets', label: 'Secrets', ic: 'star', kind: 'coin', amt: 0.02, what: 'coins' },
  { id: 'gear', label: 'Gear', ic: 'gear', kind: 'dmg', amt: 0.02, what: 'damage' },
  { id: 'songs', label: 'Songs', ic: 'sound', kind: 'xp', amt: 0.03, what: 'XP' },
];
const BOOK_SLOTS = [['mic', 'Mic'], ['shoe', 'Sneakers'], ['outfit', 'Outfit'], ['charm', 'Charm']];
const BOOK_SONGS = [['heart', 'Heart Beat'], ['cash', 'Cash Cow'], ['thunder', 'Thunder Clap'], ['lullaby', 'Lullaby'], ['magnet', 'Magnet Song'], ['rock', 'Rock Solid'], ['encore', 'Encore Boost'], ['frenzy', 'Fan Frenzy']];
const BOOK_MS = [0.25, 0.5, 0.75, 1], BOOK_GEMS = [2, 3, 5, 10], BOOK_HELM = 24, BOOK_CAP = 0.3;
const BK = { mul: { dmg: 1, coin: 1, xp: 1, magnet: 1 }, t: 0, view: null, viewT: 0, page: 'creatures', pages: null };
regMod('dmg', () => BK.mul.dmg); regMod('coin', () => BK.mul.coin); regMod('xp', () => BK.mul.xp); regMod('magnet', () => BK.mul.magnet);
const bkPretty = (id) => String(id).replace(/[_:]/g, ' ').replace(/^./, c => c.toUpperCase());
function bkBuild(id) {
  const st = S.feat.book, F = S.feat, slots = [];
  if (id === 'creatures') {
    for (let s = 0; s < 24; s++) slots.push({ id: 'sp' + s, name: foeName(s + 1), got: !!st.sp[s], art: foeArtName(s + 1, false), foe: true });
    for (let a = 0; a < 3; a++) slots.push({ id: 'bo' + a, name: BOSS_NAMES[a], got: !!st.boss[a], art: BOSS_ART[a], foe: true, boss: true });
  } else if (id === 'pets') { for (const p of PETS) slots.push({ id: p.id, name: p.name, got: petLvl(p.id) > 0, art: p.art, rar: p.rar, sub: petLvl(p.id) > 0 ? 'Lv' + petLvl(p.id) : RARITY[p.rar].name }); }
  else if (id === 'outfits') { for (const s of SKINS) slots.push({ id: s.id, name: s.name, got: skinOwned(s.id), art: s.art, season: s.season }); }
  else if (id === 'helmets') { for (let k = 1; k <= BOOK_HELM; k++) slots.push({ id: 'h' + k, name: metal(k).name, got: !!st.helm[k], helm: k }); }
  else if (id === 'secrets') {
    const L = F.lands; if (!L || !L.found || typeof L.found !== 'object') return { id, ok: false, slots: [], total: 0, got: 0 };
    const nl = Math.max(8, S.lands.length); for (let k = 1; k <= nl; k++) for (let j = 0; j < 3; j++) { const f = L.found[k]; slots.push({ id: 's' + k + '_' + j, name: 'Land ' + k + ' #' + (j + 1), got: !!(f && f[j]), ic: 'star' }); }
  } else if (id === 'gear') {
    const G = F.gear; if (!G || !G.inv || !G.eq) return { id, ok: false, slots: [], total: 0, got: 0 };
    for (let s = 0; s < BOOK_SLOTS.length; s++) for (let r = 0; r < 4; r++) slots.push({ id: 'g' + BOOK_SLOTS[s][0] + r, name: RARITY[r].name + ' ' + BOOK_SLOTS[s][1], got: !!st.gear[BOOK_SLOTS[s][0] + r], ic: 'gear', rar: r });
  } else {
    const G = F.gear; if (!G || !G.songs || typeof G.songs !== 'object') return { id, ok: false, slots: [], total: 0, got: 0 };
    const seen = {}; for (const [sid, nm] of BOOK_SONGS) { seen[sid] = 1; slots.push({ id: sid, name: nm, got: (G.songs[sid] || 0) > 0, ic: 'sound' }); }
    for (const sid in G.songs) if (!seen[sid]) slots.push({ id: sid, name: bkPretty(sid), got: G.songs[sid] > 0, ic: 'sound' });
  }
  let got = 0; for (const s of slots) if (s.got) got++;
  return { id, ok: true, slots, total: slots.length, got };
}
function bkScanGear() { const G = S.feat.gear, st = S.feat.book; if (!G || !G.inv || !G.eq) return; const see = (it) => { if (it && it.s !== undefined && it.r !== undefined) st.gear[it.s + it.r] = 1; }; for (const it of G.inv) see(it); for (const k in G.eq) see(G.eq[k]); }
function bkAll() { const o = {}; for (const p of BOOK_PAGES) o[p.id] = bkBuild(p.id); return o; }
const bkPct = (pg) => pg.ok && pg.total ? pg.got / pg.total : 0;
function bkReached(pg) { const f = bkPct(pg); let n = 0; for (const m of BOOK_MS) if (f + 1e-9 >= m) n++; return n; }
function bkRefresh() {
  const st = S.feat.book, tot = { dmg: 0, coin: 0, xp: 0, magnet: 0 }; let claimable = false; BK.pages = bkAll();
  for (const def of BOOK_PAGES) { const pg = BK.pages[def.id], n = bkReached(pg); tot[def.kind] += def.amt * n; if (n > (st.claimed[def.id] || 0)) claimable = true; }
  for (const k in tot) BK.mul[k] = 1 + Math.min(BOOK_CAP, tot[k]);
  BK.claimable = claimable; return BK.pages;
}
function bkClaim(pid) {
  const st = S.feat.book, def = BOOK_PAGES.find(p => p.id === pid), pg = BK.pages && BK.pages[pid]; if (!def || !pg) return false;
  const have = st.claimed[pid] || 0, n = bkReached(pg); if (n <= have) return false;
  let gems = 0; for (let i = have; i < n; i++) gems += BOOK_GEMS[i]; st.claimed[pid] = n; S.gems += gems; S.stats.gemsFound += gems;
  S.toasts.push({ txt: def.label + ' page: +' + gems + ' gems', t: 0, ic: 'chest' }); sfx('chest', true); starBurst(S.player.x, S.player.y - 40, 16, ['#ffe98a', '#6ee0d8'], 280);
  fEmit('bookMilestone', { page: pid, pct: BOOK_MS[n - 1] }); bkRefresh(); save(); return true;
}
function bkAck(pid) { const st = S.feat.book, pg = BK.pages && BK.pages[pid]; if (!pg) return; const k = st.known[pid] || (st.known[pid] = {}); for (const s of pg.slots) if (s.got) k[s.id] = 1; }
function bkNewCount(pid) { const st = S.feat.book, pg = BK.pages && BK.pages[pid]; if (!pg) return 0; const k = st.known[pid] || {}; let n = 0; for (const s of pg.slots) if (s.got && !k[s.id]) n++; return n; }
function bkSlot(s, x, y, w, h, isNew, pid) {
  const idx = ((S.t * 3) | 0);
  if (s.got) { card(x, y, w, h, 10); if (s.rar !== undefined) { ctx.strokeStyle = RARITY[s.rar].col; ctx.lineWidth = 2; rr(x, y, w, h, 10); ctx.stroke(); } if (s.season) { ctx.fillStyle = '#ffb640'; ctx.beginPath(); ctx.arc(x + w - 9, y + 9, 6, 0, TAU); ctx.fill(); drawIcon('star', x + w - 9, y + 9, 9); } }
  else { ctx.fillStyle = 'rgba(20,10,50,0.55)'; rr(x, y, w, h, 10); ctx.fill(); }
  const cx = x + w / 2, cy = y + h * 0.62;
  if (s.art) { if (s.got) artDraw(s.art, 'idle', idx, cx, cy, s.boss ? 0.2 : 0.3, true); else { ctx.globalAlpha = 0.22; artDraw(s.art, 'idle', 0, cx, cy, s.boss ? 0.2 : 0.3, true); ctx.globalAlpha = 0.6; ctx.fillStyle = '#1a0c3c'; ctx.beginPath(); ctx.arc(cx, cy - 14, 17, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; } }
  else if (s.helm) { if (!s.got) ctx.globalAlpha = 0.35; drawHelmetIcon(cx, y + h * 0.4, s.helm, 0.9); ctx.globalAlpha = 1; if (!s.got) { ctx.fillStyle = 'rgba(20,10,50,0.55)'; ctx.beginPath(); ctx.arc(cx, y + h * 0.4, 16, 0, TAU); ctx.fill(); } }
  else if (s.ic) { ctx.globalAlpha = s.got ? 1 : 0.3; drawIcon(s.ic, cx, y + h * 0.4, 30); ctx.globalAlpha = 1; }
  if (!s.got) { ctx.fillStyle = '#b4abd6'; ctx.font = font(18); ctx.textAlign = 'center'; ctx.fillText('?', cx, y + h * 0.5); }
  ctx.fillStyle = s.got ? '#4a2a7a' : '#8f86b8'; ctx.font = font(8); ctx.textAlign = 'center'; const nm = s.got ? s.name : '???'; let t = nm; while (t.length > 3 && ctx.measureText(t).width > w - 4) t = t.slice(0, -2); if (t !== nm) t += '.'; ctx.fillText(t, cx, y + h - 5);
  if (isNew) { ctx.fillStyle = HV.line; ctx.beginPath(); ctx.arc(x + 9, y + 9, 8, 0, TAU); ctx.fill(); ctx.fillStyle = '#ff3d6e'; ctx.beginPath(); ctx.arc(x + 9, y + 9, 6, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = font(6); ctx.fillText('NEW', x + 9, y + 11); }
}
function bookTab(cw) {
  const st = S.feat.book; if (!BK.pages) bkRefresh();
  if (BK.view && BK.view !== BK.page) bkAck(BK.view);
  BK.view = BK.page; BK.viewT = S.t; let y = 4;
  const pgDef = BOOK_PAGES.find(p => p.id === BK.page), pg = BK.pages[BK.page], n = bkReached(pg), have = st.claimed[BK.page] || 0;
  // page tabs: 4 + 3
  const tw = (cw - 4) / 4; BOOK_PAGES.forEach((p, i) => { const x = 2 + (i % 4) * tw, yy = y + Math.floor(i / 4) * 32, on = p.id === BK.page, nc = bkNewCount(p.id), f = bkPct(BK.pages[p.id]);
    pill(x + 2, yy, tw - 4, 28, on ? '#ffe98a' : '#6a5aa8', on ? '#f0b422' : '#3e3076'); ctx.fillStyle = on ? '#3a2410' : '#e6dcff'; ctx.font = font(11); ctx.textAlign = 'center'; ctx.fillText(p.label, x + tw / 2, yy + 14);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; rr(x + 10, yy + 20, tw - 20, 4, 2); ctx.fill(); ctx.fillStyle = on ? '#3fcf6a' : '#9af0b4'; rr(x + 10, yy + 20, Math.max(0, (tw - 20) * f), 4, 2); ctx.fill();
    if (nc > 0 && !on) { ctx.fillStyle = '#ff3d6e'; ctx.beginPath(); ctx.arc(x + tw - 8, yy + 6, 5, 0, TAU); ctx.fill(); }
    chit(x, yy, tw, 30, () => { BK.page = p.id; sfx('ui_tap'); S.sheet.scroll = 0; }); });
  y += 68;
  rowCard(y, 52, cw); drawIcon(pgDef.ic, 26, y + 26, 30); ctx.fillStyle = '#ffd84d'; ctx.font = font(14); ctx.textAlign = 'left'; ctx.fillText(pgDef.label + (pg.ok ? '  ' + pg.got + ' / ' + pg.total : ''), 50, y + 20);
  gbar(50, y + 28, cw - 80, 10, bkPct(pg), '#c6ffa0', '#3fcf6a'); ctx.fillStyle = '#cfc6ee'; ctx.font = font(10, false); ctx.fillText(pg.ok ? Math.floor(bkPct(pg) * 100) + '% complete  ·  each milestone: +' + Math.round(pgDef.amt * 100) + '% ' + pgDef.what + ' forever' : 'Coming soon', 50, y + 48); y += 60;
  // milestone ladder
  if (pg.ok) {
    const mw = (cw - 4) / 4; BOOK_MS.forEach((m, i) => { const x = 2 + i * mw, got = n > i, claimed = have > i, can = got && !claimed;
      plaque(x + 2, y, mw - 4, 70, 10); if (got) { ctx.fillStyle = 'rgba(63,207,106,0.2)'; rr(x + 2, y, mw - 4, 70, 10); ctx.fill(); }
      ctx.fillStyle = got ? '#9af0b4' : '#e6dcff'; ctx.font = font(12); ctx.textAlign = 'center'; ctx.fillText(Math.round(m * 100) + '%', x + mw / 2, y + 16); ctx.fillStyle = '#cfc6ee'; ctx.font = font(9); ctx.fillText('+' + Math.round(pgDef.amt * 100) + '% ' + pgDef.what.split(' ')[0], x + mw / 2, y + 28);
      if (can) { cbtn(x + 6, y + 36, mw - 12, 28, true, 'go'); drawIcon('chest', x + 20, y + 50, 18); ctx.fillStyle = '#fff'; ctx.font = font(11); ctx.fillText(BOOK_GEMS[i], x + mw / 2 + 8, y + 54); chit(x + 2, y + 30, mw - 4, 40, () => bkClaim(BK.page)); }
      else { drawIcon(claimed ? 'tick' : 'chest', x + mw / 2 - 12, y + 50, 20); ctx.fillStyle = claimed ? '#9af0b4' : '#a69cc8'; ctx.font = font(11); ctx.textAlign = 'left'; ctx.fillText(claimed ? 'Got' : BOOK_GEMS[i] + ' gems', x + mw / 2 + 0, y + 54); } });
    y += 78;
  }
  // slot grid
  const cols = 4, gw = (cw - 4 - 6 * (cols - 1)) / cols, gh = 78; const k = st.known[BK.page] || {};
  if (!pg.ok) y = note(y + 6, cw, 'This page fills up when that part of the island is added. Check back after the next update!');
  pg.slots.forEach((s, i) => { const x = 2 + (i % cols) * (gw + 6), yy = y + Math.floor(i / cols) * (gh + 6); bkSlot(s, x, yy, gw, gh, s.got && !k[s.id], BK.page); });
  return y + Math.ceil(pg.slots.length / cols) * (gh + 6) + 6;
}
regFeature({
  id: 'book', keep: true,
  api: { BK, BOOK_PAGES, bkRefresh, bkClaim, bkBuild, bkReached, bkNewCount },
  init(st) { if (!st.sp) st.sp = {}; if (!st.boss) st.boss = {}; if (!st.helm) st.helm = {}; if (!st.gear) st.gear = {}; if (!st.claimed) st.claimed = {}; if (!st.known) st.known = {}; if (st.ready === undefined) st.ready = false; BK.pages = null; if (S.bestiary) { for (let f = 0; f < 8; f++) if (S.bestiary[f] && S.bestiary[f].k > 0) st.sp[f] = 1; } },
  onLoad() { bkRefresh(); }, onTour() { bkRefresh(); },
  tick(dt) {
    const st = S.feat.book; BK.t -= dt;
    if (BK.t <= 0) { BK.t = 0.6; for (const e of S.player.helmets) if (e && e.k && !e.gem) st.helm[e.k] = 1; bkScanGear(); bkRefresh(); if (!st.ready) { st.ready = true; for (const p of BOOK_PAGES) bkAck(p.id); } if (BK.view && S.t - BK.viewT > 0.5) { bkAck(BK.view); BK.view = null; } }
  },
  on: {
    kill(e) { const st = S.feat.book; st.sp[(e.k - 1) % 24] = 1; if (e.boss) st.boss[foeAct(e.k)] = 1; },
    boss(e) { S.feat.book.boss[foeAct(e.k)] = 1; },
    drop(spec) { if (spec && spec.k && !spec.gem) S.feat.book.helm[spec.k] = 1; },
  },
  pips() { return { goals: !!(BK.claimable && S.feat.book.ready) }; },
});
regTab('goals', 'book', 'Book', bookTab);

// ================================================================== tutorial hooks (all guarded; tutorial.js may load later)
if (typeof tutAdd === 'function') {
  const open = () => S.started && !S.sheet && !S.modal && !S.cards;
  tutAdd({ id: 'meta_season', order: 4010, when: () => open() && S.stats.kills >= 15, title: 'Season quests', text: 'A seasonal quest line started. Finish all 5 quests in Goals > Season to win an exclusive outfit!', icon: 'trophy', sheet: 'goals', tab: 'season' });
  tutAdd({ id: 'meta_challenge', order: 4020, when: () => open() && S.lands.length >= 2 && S.level >= 4, title: 'Daily Challenge', text: "Try today's Challenge for gems. It only takes 3 minutes and you can abort any time. Open Goals > Challenge.", icon: 'trophy', sheet: 'goals', tab: 'challenge' });
  tutAdd({ id: 'meta_book', order: 4030, when: () => open() && !!BK.claimable, title: 'Collection Book milestone', text: 'You filled part of a Book page! Open Goals > Book and tap the chest to claim gems. Every milestone also gives a permanent bonus.', icon: 'chest', sheet: 'goals', tab: 'book' });
}
if (typeof tutHelp === 'function') {
  tutHelp('meta_seasons', 'Seasons', 'The island changes with the real seasons. Each season has a quest line of 5 steps. Finish them all in Goals > Season to win a season-only outfit. Old seasons cannot be claimed.', 'trophy');
  tutHelp('meta_challenge_h', 'Challenge runs and rules', 'In Goals > Challenge you get a daily and a weekly 3-minute run with a special rule, like No Dash. Earn up to 3 stars for gems and coins. Tap the red X on the timer to abort; nothing is lost.', 'crown');
  tutHelp('meta_book', 'Collection Book', 'Goals > Book is an album of creatures, pets, outfits and more. Fill each page to 25%, 50%, 75% and 100% to claim gem chests and earn permanent bonuses. A red NEW dot marks fresh finds.', 'chest');
}
