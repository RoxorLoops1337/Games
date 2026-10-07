'use strict';
// Encore Island — menus: bottom sheets (Town, Heroes, Goals, Perks, More), modals (wheel, daily gift, confirm) and pointer/keyboard input.
const SHEETS = {
  town: { title: 'Town', icon: 'home', tabs: [['crew', 'Crew'], ['build', 'Buildings']] }, heroes: { title: 'Heroes', icon: 'mic', tabs: [['outfits', 'Outfits'], ['critters', 'Critters']] },
  goals: { title: 'Goals', icon: 'trophy', tabs: [['quests', 'Quests'], ['miles', 'Milestones'], ['records', 'Records'], ['dex', 'Creatures']] },
  perks: { title: 'Perks', icon: 'crown', tabs: null }, more: { title: 'More', icon: 'menu', tabs: null },
};
function openSheet(id, tab) { const d = SHEETS[id]; S.modal = null; S.sheet = { id, tab: tab || (d.tabs ? d.tabs[0][0] : null), scroll: 0, vel: 0, max: 0, openT: 0 }; }
function closeSheet() { S.sheet = null; }
let SR = { x: 0, y: 0, w: 0, h: 0 }; // content region of the open sheet
function chit(x, y, w, h, act) { // hit in content space (scrolls with the sheet)
  const sy = y - S.sheet.scroll + SR.y, top = Math.max(sy, SR.y), bot = Math.min(sy + h, SR.y + SR.h); if (bot - top > 4) hits.push({ x, y: top, w, h: bot - top, act, sheet: true });
}
function drawSheet() {
  const sh = S.sheet; if (!sh) return;
  sh.openT = Math.min(1, sh.openT + 0.09); const slide = (1 - easeOut(sh.openT)) * vh * 0.4;
  ctx.fillStyle = 'rgba(25,12,60,' + (0.55 * sh.openT) + ')'; ctx.fillRect(0, 0, vw, vh);
  hits.push({ x: 0, y: 0, w: vw, h: vh, act: closeSheet });
  const bot0 = vh - DOCK_H - 14, topMax = Math.round(vh * 0.13), headH = SHEETS[sh.id].tabs ? 104 : 70, fitH = sh.H ? clamp(headH + sh.H + 14, 300, bot0 - topMax) : bot0 - topMax; // sheets hug their content
  const top = bot0 - fitH + slide, bot = vh - DOCK_H - 14, w = Math.min(vw - 16, 520), x = (vw - w) / 2, h = bot - top;
  hits.push({ x, y: top, w, h, act: () => {} });
  // sheet body
  ctx.fillStyle = HV.line; rr(x - 3, top - 3, w + 6, h + 6, 24); ctx.fill();
  const g = ctx.createLinearGradient(0, top, 0, bot); g.addColorStop(0, '#3a2a86'); g.addColorStop(1, '#1d1450'); ctx.fillStyle = g; rr(x, top, w, h, 21); ctx.fill();
  ctx.strokeStyle = 'rgba(255,244,230,0.45)'; ctx.lineWidth = 1.5; rr(x + 3, top + 3, w - 6, h - 6, 18); ctx.stroke();
  const d = SHEETS[sh.id]; drawIcon(d.icon, x + 34, top + 30, 42); ctx.font = font(26); const ttw = ctx.measureText(d.title.toUpperCase()).width; stickerText(d.title.toUpperCase(), x + 66 + ttw / 2, top + 40, 26, '#fff6c0', '#ffb640', 0);
  disc(x + w - 28, top + 28, 16, '#ff9a8a', '#e8384f'); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x + w - 34, top + 22); ctx.lineTo(x + w - 22, top + 34); ctx.moveTo(x + w - 22, top + 22); ctx.lineTo(x + w - 34, top + 34); ctx.stroke(); ctx.lineCap = 'butt';
  hitRect(x + w - 50, top + 6, 44, 44, closeSheet);
  let cy = top + 58;
  if (d.tabs) { const tw = (w - 24) / d.tabs.length; d.tabs.forEach(([id, label], i) => { const tx = x + 12 + i * tw, on = sh.tab === id; pill(tx + 2, cy, tw - 4, 28, on ? '#ffe98a' : '#6a5aa8', on ? '#f0b422' : '#3e3076'); ctx.fillStyle = on ? '#3a2410' : '#e6dcff'; ctx.font = font(12); ctx.textAlign = 'center'; ctx.fillText(label, tx + tw / 2, cy + 19); hitRect(tx, cy, tw, 28, () => { sh.tab = id; sh.scroll = 0; sh.vel = 0; sfx('ui_tap'); }); }); cy += 38; }
  SR = { x: x + 8, y: cy, w: w - 16, h: bot - cy - 8 };
  ctx.save(); rr(SR.x, SR.y, SR.w, SR.h, 12); ctx.clip(); ctx.translate(SR.x, SR.y - sh.scroll);
  const H = SHEET_DRAW[sh.id](SR.w, sh); ctx.restore();
  sh.H = H; sh.max = Math.max(0, H - SR.h + 6);
  if (!sh.drag) { sh.scroll = clamp(sh.scroll + sh.vel, 0, sh.max); sh.vel *= 0.92; if (Math.abs(sh.vel) < 0.3) sh.vel = 0; } sh.scroll = clamp(sh.scroll, 0, sh.max);
  if (sh.max > 0) { const bh = Math.max(24, SR.h * SR.h / (H + 6)), by = SR.y + (SR.h - bh) * (sh.scroll / sh.max); ctx.fillStyle = 'rgba(255,255,255,0.35)'; rr(SR.x + SR.w - 4, by, 4, bh, 2); ctx.fill(); }
}
// content helpers: all draw in sheet space (0,0 = region top-left); `cw` is the region width
function section(y, txt) { ctx.fillStyle = '#e6dcff'; ctx.font = font(12); ctx.textAlign = 'left'; ctx.fillText(txt.toUpperCase(), 6, y + 14); return y + 22; }
function rowCard(y, h, cw) { plaque(2, y, cw - 4, h, 12); }
function note(y, cw, txt, col) { ctx.fillStyle = col || '#cfc6ee'; ctx.font = font(11, false); ctx.textAlign = 'left'; return wrapText(txt, 8, y + 12, cw - 16, 14) + 6; }
function stepper(x, y, val, minus, plus) {
  const b = (bx, lab, act, on) => { cbtn(bx, y, 34, 30, on, on ? (lab === '+' ? 'go' : 'violet') : 'off'); ctx.fillStyle = '#fff'; ctx.font = font(20); ctx.textAlign = 'center'; ctx.fillText(lab, bx + 17, y + 22); if (on) chit(bx, y, 34, 30, act); };
  b(x, '−', minus, true); ctx.fillStyle = '#fff'; ctx.font = font(18); ctx.textAlign = 'center'; ctx.fillText(val, x + 54, y + 22); b(x + 76, '+', plus, true);
}
// centred "[icon] text" with the pair measured, so the icon never lands on the number
function iconText(cx, y, draw, txt, col, sz) {
  ctx.font = font(sz); const tw = ctx.measureText(txt).width, iw = sz + 10, x0 = cx - (tw + iw) / 2;
  draw(x0 + iw / 2, y - sz * 0.35, sz + 4); ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.fillText(txt, x0 + iw, y); ctx.textAlign = 'center';
}
const coinDraw = (x, y, sz) => drawIcon('coin', x, y, sz + 6);
const SHEET_DRAW = {
  town(cw, sh) { return sh.tab === 'build' ? SHEET_DRAW.townBuild(cw, sh) : SHEET_DRAW.townCrew(cw, sh); },
  townHead(cw, y) { // town banner: tier, level progress, crew headline numbers
    const tier = townTierIdx(), nxt = TOWN_TIERS[tier + 1], sum = townLevelSum(), cs = crewStats();
    rowCard(y, 78, cw); disc(34, y + 36, 24, '#ffe98a', '#f0b422'); drawIcon('home', 34, y + 36, 32);
    ctx.fillStyle = '#fff'; ctx.font = font(16); ctx.textAlign = 'left'; ctx.fillText(TOWN_TIERS[tier][0], 68, y + 26);
    ctx.fillStyle = '#ffd94a'; ctx.font = font(11); ctx.fillText('+' + 5 * tier + '% coins  ·  Town level ' + sum, 68, y + 43);
    gbar(68, y + 52, cw - 150, 9, nxt ? (sum - TOWN_TIERS[tier][1]) / (nxt[1] - TOWN_TIERS[tier][1]) : 1, '#ffe98a', '#f0a81e');
    ctx.fillStyle = '#cfc6ee'; ctx.font = font(10, false); ctx.textAlign = 'right'; ctx.fillText(nxt ? nxt[0] + ' at ' + nxt[1] : 'MAX TOWN', cw - 12, y + 61);
    ctx.fillStyle = '#9af0b4'; ctx.font = font(12); ctx.fillText(cs.collectors + ' collectors · carry ' + cs.carry, cw - 12, y + 24); ctx.fillStyle = '#ff9ac8'; ctx.fillText(cs.fighters + ' fighters · ' + fmt(cs.dps) + ' dps', cw - 12, y + 40);
    return y + 88;
  },
  townCrew(cw, sh) {
    let y = 4; const cap = popCap(), n = S.pop.length;
    y = SHEET_DRAW.townHead(cw, y);
    const canR = n < cap && S.wallet >= recruitCost();
    cbtn(2, y, cw - 4, 54, canR, 'go'); ctx.fillStyle = '#fff'; ctx.font = font(14); ctx.textAlign = 'center';
    ctx.fillText(n >= cap ? 'NO FREE BEDS — build Cottages' : 'RECRUIT A FAN  ·  ' + n + ' / ' + cap + ' beds', cw / 2, y + 22); if (n < cap) iconText(cw / 2, y + 43, coinDraw, fmt(recruitCost()), canR ? '#fff' : '#cfc6ee', 14);
    chit(2, y, cw - 4, 54, recruit); y += 64;
    y = section(y, 'Jobs');
    const jobs = [['gather', 'Collectors', 'Haul loot to the stall and sell it.', 'cap'], ['fight', 'Fighters', 'Follow you and sing along with notes.', 'dmg']];
    for (const [role, name, desc, icon] of jobs) { rowCard(y, 62, cw); drawIcon(icon, 30, y + 31, 36); ctx.fillStyle = '#fff'; ctx.font = font(14); ctx.textAlign = 'left'; ctx.fillText(name, 56, y + 24); ctx.fillStyle = '#cfc6ee'; ctx.font = font(10, false); wrapText(desc, 56, y + 40, cw - 220, 12);
      const c = fansOf(role); stepper(cw - 130, y + 16, c, () => setFans(role, c - 1), () => setFans(role, c + 1)); y += 70; }
    y = section(y + 2, 'Your crew  ·  train each fan');
    if (!n) return note(y, cw, 'No fans yet — recruit one! Every fan can be trained individually, and the Talent Academy raises how far.') + 2;
    const maxL = fanMaxLvl(), vTop = sh.scroll - 80, vBot = sh.scroll + SR.h + 80;
    S.pop.forEach((f, i) => {
      const h = 70, row = y; y += h + 6; if (row + h < vTop || row > vBot) return;
      const fight = f.role === 'fight', lv = f.lvl || 0, full = lv >= maxL, cost = fanTrainCost(f), can = !full && S.wallet >= cost;
      rowCard(row, h, cw); disc(30, row + 36, 22, fight ? '#ff9ac8' : '#7fe0d8', fight ? '#c8306a' : '#1f9a98');
      artDraw(f.art, 'idle', (S.t * 4 + i) | 0, 30, row + 56, 0.27, false);
      ctx.fillStyle = '#fff'; ctx.font = font(13); ctx.textAlign = 'left'; ctx.fillText(fanName(f), 60, row + 20); const nw = ctx.measureText(fanName(f)).width;
      ctx.fillStyle = fight ? '#ff9ac8' : '#7fe0d8'; ctx.font = font(10); ctx.fillText(fight ? 'FIGHTER' : 'COLLECTOR', 60 + nw + 8, row + 20);
      ctx.fillStyle = '#cfc6ee'; ctx.font = font(10, false); ctx.fillText(fight ? 'Dmg ' + fmt(fanDmgOf(f)) + ' · ' + (1 / fanRateOf(f)).toFixed(2) + '/s' : 'Carries ' + fanCarryCap(f) + ' per trip', 60, row + 36);
      for (let k = 0; k < maxL; k++) { ctx.fillStyle = k < lv ? '#ffd94a' : 'rgba(255,255,255,0.16)'; rr(60 + k * 11, row + 46, 9, 8, 3); ctx.fill(); }
      ctx.fillStyle = '#e6dcff'; ctx.font = font(10); ctx.fillText('Lv ' + lv + '/' + maxL, 60 + maxL * 11 + 4, row + 54);
      const bx = cw - 108, bw = 100;
      cbtn(bx, row + 8, bw, 32, can, full ? 'off' : 'go'); ctx.textAlign = 'center';
      if (full) { ctx.fillStyle = '#cfc6ee'; ctx.font = font(12); ctx.fillText('MAX', bx + bw / 2, row + 29); } else { ctx.fillStyle = can ? '#fff' : '#cfc6ee'; ctx.font = font(10); ctx.fillText('TRAIN', bx + bw / 2, row + 19); iconText(bx + bw / 2, row + 34, coinDraw, fmt(cost), can ? '#fff' : '#cfc6ee', 11); }
      chit(bx, row + 8, bw, 32, () => trainFan(f));
      cbtn(bx, row + 44, bw, 20, true, 'violet'); ctx.fillStyle = '#fff'; ctx.font = font(10); ctx.textAlign = 'center'; ctx.fillText('Switch to ' + (fight ? 'collector' : 'fighter'), bx + bw / 2, row + 58);
      chit(bx, row + 44, bw, 20, () => { f.role = fight ? 'gather' : 'fight'; f.carry = []; f.route = null; f.state = 'seek'; sfx('ui_tap'); });
    });
    return y + 4;
  },
  townBuild(cw, sh) {
    let y = 4; y = SHEET_DRAW.townHead(cw, y);
    y = section(y, 'Buildings  ·  they upgrade every fan at once');
    const vTop = sh.scroll - 120, vBot = sh.scroll + SR.h + 120;
    for (const b of TOWN) {
      const h = 104, row = y; y += h + 8; if (row + h < vTop || row > vBot) continue;
      const lv = townLvl(b.id), full = lv >= b.max, lock = townLocked(b), cost = townCost(b), can = canTown(b);
      rowCard(row, h, cw);
      ctx.save(); ctx.globalAlpha = lock ? 0.45 : 1; disc(36, row + 36, 27, b.col[0], b.col[1]); drawIcon(b.icon, 36, row + 36, 36); ctx.restore();
      if (lock) drawIcon('lock', 50, row + 52, 22);
      ctx.fillStyle = '#fff'; ctx.font = font(14); ctx.textAlign = 'left'; ctx.fillText(b.name, 72, row + 22);
      ctx.fillStyle = '#ffd94a'; ctx.font = font(11); ctx.textAlign = 'right'; ctx.fillText(lock ? 'Opens at land ' + b.need : 'Lv ' + lv + ' / ' + b.max, cw - 12, row + 22);
      for (let k = 0; k < b.max; k++) { ctx.fillStyle = k < lv ? b.col[0] : 'rgba(255,255,255,0.15)'; rr(72 + k * 15, row + 30, 12, 7, 3); ctx.fill(); }
      ctx.textAlign = 'left'; ctx.fillStyle = '#cfc6ee'; ctx.font = font(10, false); ctx.fillText(b.desc, 72, row + 52);
      ctx.fillStyle = '#9af0b4'; ctx.font = font(11); ctx.fillText(lv ? 'Now: ' + b.eff(lv) : 'Not built yet', 72, row + 68);
      if (!full && !lock) { ctx.fillStyle = '#ffe98a'; ctx.fillText('Next: ' + b.eff(lv + 1), 72, row + 83); }
      if (full) { ctx.fillStyle = '#ffd94a'; ctx.fillText('FULLY UPGRADED', 72, row + 83); }
      else if (!lock) { const bw = 98, bx = cw - bw - 10, by = row + 54; cbtn(bx, by, bw, 38, can, 'gold'); ctx.textAlign = 'center'; ctx.fillStyle = can ? '#3a2410' : '#cfc6ee'; ctx.font = font(10); ctx.fillText(lv ? 'UPGRADE' : 'BUILD', bx + bw / 2, by + 15); iconText(bx + bw / 2, by + 31, coinDraw, fmt(cost), can ? '#3a2410' : '#cfc6ee', 11); chit(bx, by, bw, 38, () => buyTown(b.id)); }
    }
    return y + 2;
  },
  heroes(cw, sh) { return sh.tab === 'critters' ? SHEET_DRAW.critters(cw) : SHEET_DRAW.outfits(cw); },
  outfits(cw) {
    let y = 4; const cols = 2, w = (cw - 12) / cols;
    SKINS.forEach((s, i) => { const x = 2 + (i % cols) * (w + 8), yy = y + Math.floor(i / cols) * 132, owned = skinOwned(s.id), act = S.skins.active === s.id, locked = !owned && s.rank !== undefined && heroRankIdx() < s.rank;
      card(x, yy, w, 122, 14); if (act) { ctx.strokeStyle = '#ffd84d'; ctx.lineWidth = 4; rr(x, yy, w, 122, 14); ctx.stroke(); }
      if (!owned) ctx.globalAlpha = 0.75; artDraw(s.art, 'idle', (S.t * 4 + i) | 0, x + w * 0.5, yy + 84, 0.37, false); ctx.globalAlpha = 1;
      ctx.fillStyle = '#4a2a7a'; ctx.font = font(12); ctx.textAlign = 'center'; ctx.fillText(s.name, x + w / 2, yy + 100);
      let lab = '', col = '#6a5a8a'; if (act) { lab = 'EQUIPPED'; col = '#1f9a4a'; } else if (owned) { lab = 'Tap to wear'; col = '#6a5a8a'; } else if (locked) { lab = 'Reach ' + RANKS[s.rank].name; col = '#a8265f'; } else lab = s.cost + (s.cur === 'crown' ? ' crowns' : ' gems');
      ctx.fillStyle = col; ctx.font = font(10); ctx.fillText(lab, x + w / 2, yy + 115); chit(x, yy, w, 122, () => buySkin(s.id)); });
    return y + Math.ceil(SKINS.length / cols) * 132 + 4;
  },
  critters(cw) {
    let y = 4; const hatch = eggCost(S.stats.hatches), can = S.gems >= hatch;
    cbtn(2, y, cw - 4, 50, can, 'go'); drawIcon('egg', 36, y + 25, 36); ctx.fillStyle = '#fff'; ctx.font = font(16); ctx.textAlign = 'center'; ctx.fillText('HATCH A CRITTER', cw / 2 + 12, y + 22); iconText(cw / 2 + 12, y + 42, (gx, gy) => drawGemIcon(gx, gy + 4, 0.8), String(hatch), can ? '#fff' : '#cfc6ee', 14); chit(2, y, cw - 4, 50, hatchEgg); y += 60;
    const ap = activePet(); if (ap) { rowCard(y, 52, cw); artDraw(ap.art, 'idle', (S.t * 4) | 0, 34, y + 46, 0.34, false); ctx.fillStyle = '#ffd84d'; ctx.font = font(13); ctx.textAlign = 'left'; ctx.fillText(ap.name + '  Lv' + petLvl(ap.id), 66, y + 22); ctx.fillStyle = '#cfc6ee'; ctx.font = font(11, false); ctx.fillText(ap.desc + '  ·  tap its button for a power move', 66, y + 40); y += 62; }
    const cols = 3, w = (cw - 4 - 8 * (cols - 1)) / cols; y = section(y, 'Collection ' + petsOwned() + '/' + PETS.length + '  (+' + petsOwned() * 2 + '% coins)');
    PETS.forEach((p, i) => { const x = 2 + (i % cols) * (w + 8), yy = y + Math.floor(i / cols) * 108, lv = petLvl(p.id), act = S.activePet === p.id; card(x, yy, w, 100, 12);
      ctx.strokeStyle = act ? '#ffd84d' : RARITY[p.rar].col; ctx.lineWidth = act ? 4 : 2; rr(x, yy, w, 100, 12); ctx.stroke();
      if (lv > 0) { artDraw(p.art, 'idle', (S.t * 3 + i) | 0, x + w / 2, yy + 66, 0.34, true); ctx.fillStyle = '#4a2a7a'; ctx.font = font(10); ctx.textAlign = 'center'; ctx.fillText(p.name, x + w / 2, yy + 82); ctx.fillStyle = RARITY[p.rar].col === '#e6dcff' ? '#6a5a8a' : RARITY[p.rar].col; ctx.fillText('Lv' + lv, x + w / 2, yy + 94); chit(x, yy, w, 100, () => setPet(p.id)); }
      else { ctx.globalAlpha = 0.5; artDraw(p.art, 'idle', 0, x + w / 2, yy + 66, 0.34, true); ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(40,20,80,0.55)'; rr(x + 2, yy + 2, w - 4, 96, 10); ctx.fill(); drawIcon('lock', x + w / 2, yy + 48, 30); ctx.fillStyle = '#cfc6ee'; ctx.font = font(10); ctx.textAlign = 'center'; ctx.fillText(RARITY[p.rar].name, x + w / 2, yy + 90); } });
    return y + Math.ceil(PETS.length / cols) * 108 + 4;
  },
  goals(cw, sh) { return SHEET_DRAW[sh.tab === 'miles' ? 'miles' : sh.tab === 'records' ? 'records' : sh.tab === 'dex' ? 'dex' : 'quests'](cw); },
  quests(cw) {
    let y = 4; if (S.streak > 0) { rowCard(y, 34, cw); ctx.fillStyle = '#ffd84d'; ctx.font = font(13); ctx.textAlign = 'left'; ctx.fillText('Daily streak: ' + S.streak + ' day' + (S.streak > 1 ? 's' : ''), 14, y + 22); y += 42; }
    const draw = (q) => { rowCard(y, 62, cw); drawIcon(q.done ? 'tick' : 'scroll', 28, y + 31, 34); ctx.fillStyle = q.done ? '#9af0b4' : '#fff'; ctx.font = font(13); ctx.textAlign = 'left'; ctx.fillText(questName(q), 54, y + 22); gbar(54, y + 32, cw - 150, 10, q.prog / q.goal, '#c6ffa0', '#3fcf6a'); ctx.fillStyle = '#cfc6ee'; ctx.font = font(10); ctx.fillText(fmt(q.prog) + ' / ' + fmt(q.goal), 54, y + 56); ctx.font = font(13); const rt = fmt(q.reward), rw = ctx.measureText(rt).width; ctx.fillStyle = '#ffd94a'; ctx.textAlign = 'right'; ctx.fillText(rt, cw - 14, y + 28); drawIcon('coin', cw - 14 - rw - 13, y + 23, 22); if (q.gems) { ctx.font = font(11); ctx.fillStyle = '#6ee0d8'; ctx.fillText('+ gem', cw - 14, y + 46); } ctx.textAlign = 'left'; y += 70; };
    y = section(y, 'Today'); S.dailies.forEach(draw); y = section(y + 6, 'Island quests'); S.quests.forEach(draw); return y + 6;
  },
  miles(cw) {
    let y = 4; const done = ACH.filter(a => S.ach[a.id]).length; y = section(y, done + ' / ' + ACH.length + ' milestones'); const w = (cw - 12) / 2;
    ACH.forEach((a, i) => { const x = 2 + (i % 2) * (w + 8), yy = y + Math.floor(i / 2) * 50, got = !!S.ach[a.id]; plaque(x, yy, w, 44, 10); if (got) { ctx.fillStyle = 'rgba(63,207,106,0.22)'; rr(x, yy, w, 44, 10); ctx.fill(); } drawIcon(got ? 'trophy' : 'lock', x + 22, yy + 22, 28); ctx.fillStyle = got ? '#9af0b4' : '#e6dcff'; ctx.font = font(11); ctx.textAlign = 'left'; ctx.fillText(a.name, x + 42, yy + 19); ctx.fillStyle = '#b4abd6'; ctx.font = font(9, false); wrapText(a.d, x + 42, yy + 32, w - 48, 10); });
    return y + Math.ceil(ACH.length / 2) * 50 + 4;
  },
  records(cw) {
    const st = S.stats, rows = [['Creatures defeated', fmt(st.kills)], ['Headliners defeated', fmt(st.bosses)], ['Coins earned', fmt(st.earned)], ['Items sold', fmt(st.sold)], ['Gems found', fmt(st.gemsFound)], ['Treasure chests', fmt(st.chests)], ['Quests done', fmt(st.quests)], ['Lands opened', fmt(S.lands.length)], ['Crowns', fmt(S.crowns)], ['Encore Tours', fmt(S.prestiges)], ['On-beat kills', fmt(st.perfect)], ['ENCORE modes', fmt(st.encores)], ['Best combo', fmt(S.comboBest)], ['Hero level', fmt(S.level)], ['Critters tamed', petsOwned() + '/' + PETS.length], ['Time played', fmtTime(st.playT)], ['Rank', heroRank().name], ['Renown', fmt(renown())]];
    let y = 4; rows.forEach(([l, v], i) => { rowCard(y, 34, cw); ctx.fillStyle = '#e6dcff'; ctx.font = font(12, false); ctx.textAlign = 'left'; ctx.fillText(l, 14, y + 22); ctx.fillStyle = '#ffd94a'; ctx.font = font(14); ctx.textAlign = 'right'; ctx.fillText(v, cw - 14, y + 23); y += 40; }); return y + 4;
  },
  dex(cw) {
    let y = 4; y = section(y, bestiarySeen() + ' / 8 families met'); const w = (cw - 12) / 2;
    for (let f = 0; f < 8; f++) { const x = 2 + (f % 2) * (w + 8), yy = y + Math.floor(f / 2) * 96, rec = S.bestiary[f], seen = rec && rec.k > 0; plaque(x, yy, w, 88, 12);
      ctx.fillStyle = 'rgba(255,244,230,0.92)'; ctx.beginPath(); ctx.arc(x + 36, yy + 44, 30, 0, TAU); ctx.fill();
      if (seen) { artDraw(FOE_ART[0][f], 'idle', (S.t * 3 + f) | 0, x + 36, yy + 70, 0.42, true); ctx.fillStyle = '#fff'; ctx.font = font(12); ctx.textAlign = 'left'; ctx.fillText(FOE_ACT_NAMES[0][f], x + 72, yy + 28); ctx.fillStyle = '#cfc6ee'; ctx.font = font(10, false); ctx.fillText(ARCH_DESC[FOE_ARCH[f]], x + 72, yy + 44); ctx.fillStyle = '#e6dcff'; ctx.font = font(11); ctx.fillText('defeated ' + fmt(rec.k), x + 72, yy + 62); ctx.fillText('bosses ' + fmt(rec.b || 0), x + 72, yy + 78); }
      else { ctx.globalAlpha = 0.4; artDraw(FOE_ART[0][f], 'idle', 0, x + 36, yy + 70, 0.42, true); ctx.globalAlpha = 1; ctx.fillStyle = '#9d93c4'; ctx.font = font(13); ctx.textAlign = 'left'; ctx.fillText('? ? ?', x + 72, yy + 34); ctx.font = font(10, false); ctx.fillText('Not met yet', x + 72, yy + 52); } }
    return y + 4 * 96 + 4;
  },
  perks(cw) {
    let y = 4; rowCard(y, 60, cw); drawIcon('crown', 32, y + 30, 40); ctx.fillStyle = '#ffd84d'; ctx.font = font(20); ctx.textAlign = 'left'; ctx.fillText(S.crowns + ' crowns', 62, y + 28); ctx.fillStyle = '#cfc6ee'; ctx.font = font(11, false); ctx.fillText('Permanent perks — they survive every Encore Tour', 62, y + 46); y += 70;
    y = section(y, 'Encore Tour');
    const ready = S.lands.length >= PRESTIGE_MIN; rowCard(y, 62, cw); drawIcon('way', 30, y + 31, 36); ctx.fillStyle = '#fff'; ctx.font = font(13); ctx.textAlign = 'left'; ctx.fillText(ready ? 'Ready: +' + crownsToGain() + ' crowns' : 'Open ' + PRESTIGE_MIN + ' lands to tour', 56, y + 24); ctx.fillStyle = '#cfc6ee'; ctx.font = font(10, false); wrapText('Stand still on the crown monument in the Stage Plaza. Your island resets, your crowns and critters stay.', 56, y + 40, cw - 70, 12); y += 72;
    y = section(y, 'Crown hall');
    for (const p of CPERKS) { const lv = cpk(p.id), cost = cperkCost(lv), can = lv < p.max && S.crowns >= cost; rowCard(y, 58, cw); ctx.fillStyle = '#fff'; ctx.font = font(13); ctx.textAlign = 'left'; ctx.fillText(p.name + '  Lv' + lv + '/' + p.max, 12, y + 22); ctx.fillStyle = '#cfc6ee'; ctx.font = font(10, false); ctx.fillText(p.desc + '  ·  now +' + Math.round(p.amt * lv * (p.kind === 'crown' ? 1 : 100)) + (p.kind === 'crown' ? '' : '%'), 12, y + 40);
      if (lv < p.max) { cbtn(cw - 84, y + 11, 76, 36, can, 'go'); drawIcon('crown', cw - 66, y + 29, 20); ctx.fillStyle = can ? '#fff' : '#cfc6ee'; ctx.font = font(14); ctx.textAlign = 'left'; ctx.fillText(cost, cw - 52, y + 34); chit(cw - 84, y + 11, 76, 36, () => buyCperk(p.id)); } else { ctx.fillStyle = '#9af0b4'; ctx.font = font(12); ctx.textAlign = 'right'; ctx.fillText('MAX', cw - 14, y + 34); } y += 66; }
    y = section(y + 4, 'This run');
    const owned = CARDS.filter(c => pk(c.id) > 0); if (!owned.length) y = note(y, cw, 'Level up to pick perks — they last until your next Encore Tour.'); else { const per = Math.floor(cw / 62); owned.forEach((c, i) => { const x = 8 + (i % per) * 62, yy = y + Math.floor(i / per) * 60; drawIcon(c.icon, x + 24, yy + 24, 38); ctx.fillStyle = '#ffd84d'; ctx.font = font(11); ctx.textAlign = 'center'; ctx.fillText('x' + pk(c.id), x + 24, yy + 52); }); y += Math.ceil(owned.length / per) * 60; }
    return y + 8;
  },
  more(cw) {
    let y = 4; const tile = (icon, label, sub, pip, act, kind) => { cbtn(2, y, cw - 4, 56, true, kind); drawIcon(icon, 34, y + 28, 40); ctx.fillStyle = '#fff'; ctx.font = font(16); ctx.textAlign = 'left'; ctx.fillText(label, 66, y + 24); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = font(11, false); ctx.fillText(sub, 66, y + 42); if (pip) { ctx.fillStyle = HV.line; ctx.beginPath(); ctx.arc(cw - 20, y + 14, 8, 0, TAU); ctx.fill(); ctx.fillStyle = '#ff4d7a'; ctx.beginPath(); ctx.arc(cw - 20, y + 14, 6, 0, TAU); ctx.fill(); } chit(2, y, cw - 4, 56, act); y += 64; };
    tile('gift', 'Daily gift', loginReady() ? 'Your gift is ready!' : 'Come back tomorrow', loginReady(), () => { S.modal = { id: 'daily' }; S.sheet = null; }, 'pink');
    tile('egg', 'Fortune wheel', 'Spin for prizes · ' + SPIN_COST + ' gems', S.gems >= SPIN_COST, () => { S.modal = { id: 'wheel' }; S.sheet = null; }, 'violet');
    y = section(y + 6, 'Settings');
    const sets = [['music', 'Music'], ['sfx', 'Sound effects'], ['shake', 'Screen shake'], ['particles', 'Sparkles'], ['dmgNums', 'Damage numbers'], ['haptics', 'Vibration']];
    for (const [k, label] of sets) { rowCard(y, 40, cw); ctx.fillStyle = '#fff'; ctx.font = font(13); ctx.textAlign = 'left'; ctx.fillText(label, 14, y + 25); const on = S.settings[k] !== false; pill(cw - 66, y + 8, 52, 24, on ? '#7cf09a' : '#6a5aa0', on ? '#25a84f' : '#3e3076'); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cw - (on ? 28 : 52), y + 20, 9, 0, TAU); ctx.fill(); chit(2, y, cw - 4, 40, () => toggleSetting(k)); y += 46; }
    y += 6; cbtn(2, y, cw - 4, 40, true, 'red'); ctx.fillStyle = '#fff'; ctx.font = font(13); ctx.textAlign = 'center'; ctx.fillText('Reset all progress', cw / 2, y + 25); chit(2, y, cw - 4, 40, () => { S.modal = { id: 'reset' }; S.sheet = null; }); y += 52;
    return note(y, cw, 'Encore Island · the long-awaited sequel · characters by RoxorLoops & Jasmin', '#9d93c4') + 10;
  },
};
function toggleSetting(k) { S.settings[k] = S.settings[k] === false; sfx('ui_tap'); applyAudioSettings(); save(); }
function applyAudioSettings() { if (typeof AUDIO === 'undefined') return; AUDIO.setVolume && AUDIO.setVolume(S.settings.music === false ? 0 : 1, S.settings.sfx === false ? 0 : 1); }
// ---- modals ----
function drawModal() {
  const m = S.modal; if (!m) return;
  ctx.fillStyle = 'rgba(25,12,60,0.78)'; ctx.fillRect(0, 0, vw, vh);
  const cx = vw / 2;
  if (m.id === 'reset') {
    hits.push({ x: 0, y: 0, w: vw, h: vh, act: () => { S.modal = null; } }); const w = Math.min(320, vw - 40), x = cx - w / 2, y = vh * 0.3; hits.push({ x, y, w, h: 190, act: () => {} });
    card(x, y, w, 190, 18); ctx.fillStyle = '#4a2a7a'; ctx.font = font(20); ctx.textAlign = 'center'; ctx.fillText('Reset everything?', cx, y + 40); ctx.fillStyle = '#6a5a8a'; ctx.font = font(12, false); wrapText('This erases your island, crowns, critters and outfits. It cannot be undone.', cx, y + 66, w - 40, 16);
    cbtn(x + 16, y + 120, (w - 44) / 2, 46, true, 'violet'); ctx.fillStyle = '#fff'; ctx.font = font(14); ctx.fillText('Keep playing', x + 16 + (w - 44) / 4, y + 148); hitRect(x + 16, y + 120, (w - 44) / 2, 46, () => { S.modal = null; });
    cbtn(x + 28 + (w - 44) / 2, y + 120, (w - 44) / 2, 46, true, 'red'); ctx.fillStyle = '#fff'; ctx.fillText('Reset', x + 28 + (w - 44) * 0.75, y + 148); hitRect(x + 28 + (w - 44) / 2, y + 120, (w - 44) / 2, 46, () => { resetAll(); S.started = true; S.modal = null; sfx('die', true); });
    return;
  }
  hits.push({ x: 0, y: 0, w: vw, h: vh, act: () => { S.modal = null; } });
  const top = Math.max(60, vh * 0.1); stickerText(m.id === 'wheel' ? 'FORTUNE WHEEL' : 'DAILY GIFT', cx, top, Math.min(32, vw / 11), '#fff6c0', '#ffb640', 0);
  disc(vw - 30, top - 8, 15, '#ff9a8a', '#e8384f'); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(vw - 36, top - 14); ctx.lineTo(vw - 24, top - 2); ctx.moveTo(vw - 24, top - 14); ctx.lineTo(vw - 36, top - 2); ctx.stroke(); ctx.lineCap = 'butt'; hitRect(vw - 52, top - 30, 44, 44, () => { S.modal = null; });
  if (m.id === 'wheel') drawWheelModal(cx, top); else drawDailyModal(cx, top);
}
function drawWheelModal(cx, top) {
  ctx.fillStyle = '#e6dcff'; ctx.font = font(12, false); ctx.textAlign = 'center'; ctx.fillText('Spin for a prize · you have ' + S.gems + ' gems', cx, top + 24);
  const rad = Math.min(140, vw * 0.34, vh * 0.2), wy = top + 70 + rad, n = WHEEL.length, seg = TAU / n, SPIN = 2.0, spinning = S.wheel && S.wheel.spinT < SPIN;
  if (S.wheel) S.wheel.spinT += 1 / 60;
  let rot = -Math.PI / 2 + Math.sin(S.t * 0.6) * 0.03;
  if (S.wheel) { const fin = -Math.PI / 2 - (S.wheel.idx * seg + seg / 2); if (spinning) { const et = Math.min(1, S.wheel.spinT / SPIN); rot = fin + (1 - easeOut(et)) * 6 * TAU; } else rot = fin + Math.sin(S.t * 0.6) * 0.03; }
  ctx.fillStyle = HV.line; ctx.beginPath(); ctx.arc(cx, wy, rad + 20, 0, TAU); ctx.fill(); ctx.fillStyle = '#ff7eb6'; ctx.beginPath(); ctx.arc(cx, wy, rad + 16, 0, TAU); ctx.fill();
  for (let i = 0; i < 24; i++) { const a = i * TAU / 24, on = (((S.t * 6) | 0) + i) % 2; ctx.fillStyle = on ? '#fff4c0' : '#ffd84d'; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * (rad + 10), wy + Math.sin(a) * (rad + 10), on ? 3.6 : 2.6, 0, TAU); ctx.fill(); }
  ctx.fillStyle = HV.line; ctx.beginPath(); ctx.arc(cx, wy, rad + 3, 0, TAU); ctx.fill();
  for (let i = 0; i < n; i++) { const a0 = rot + i * seg, a1 = a0 + seg, mid = a0 + seg / 2, landed = S.wheel && S.wheel.idx === i && !spinning; ctx.beginPath(); ctx.moveTo(cx, wy); ctx.arc(cx, wy, rad, a0, a1); ctx.closePath(); ctx.fillStyle = WHEEL[i].col; ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,' + (i % 2 ? 0.16 : 0.04) + ')'; ctx.fill(); ctx.strokeStyle = HV.line; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke(); if (landed) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke(); }
    const ic = { coins: 'coin', gems: 'gem', boon: 'groove', gold: 'coin', egg: 'egg', xp: 'star', hp: 'hp', jack: 'gift' }[WHEEL[i].id]; ctx.save(); ctx.translate(cx + Math.cos(mid) * rad * 0.64, wy + Math.sin(mid) * rad * 0.64); if (ic === 'gem') drawGemIcon(0, 0, 1.3); else drawIcon(ic, 0, 0, 34); ctx.restore(); }
  disc(cx, wy, rad * 0.22, '#fff4c0', '#f0b422'); drawIcon('star', cx, wy, rad * 0.34);
  ctx.fillStyle = HV.line; ctx.beginPath(); ctx.moveTo(cx, wy - rad - 2); ctx.lineTo(cx - 16, wy - rad - 30); ctx.lineTo(cx + 16, wy - rad - 30); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#ff4d8d'; ctx.beginPath(); ctx.moveTo(cx, wy - rad - 7); ctx.lineTo(cx - 11, wy - rad - 27); ctx.lineTo(cx + 11, wy - rad - 27); ctx.closePath(); ctx.fill();
  if (S.wheel && !spinning) { ctx.fillStyle = '#ffd94a'; ctx.font = font(16); ctx.textAlign = 'center'; ctx.fillText(S.wheel.msg, cx, wy + rad + 40); }
  const can = S.gems >= SPIN_COST && !spinning, sw = 210, sx = cx - sw / 2, sy = wy + rad + 56; cbtn(sx, sy, sw, 48, can, 'pink'); ctx.fillStyle = can ? '#fff' : '#cfc6ee'; ctx.font = font(17); ctx.textAlign = 'center'; ctx.fillText(spinning ? 'SPINNING…' : 'SPIN  ' + SPIN_COST, cx - 6, sy + 31); if (!spinning) drawGemIcon(cx + 52, sy + 24, 0.9); if (can) hitRect(sx, sy, sw, 48, () => spinWheel());
}
function drawDailyModal(cx, top) {
  const ready = loginReady(), cur = S.login.day % 7; ctx.fillStyle = '#e6dcff'; ctx.font = font(12, false); ctx.textAlign = 'center'; ctx.fillText(ready ? 'Your gift is ready — come back every day!' : 'Claimed today — see you tomorrow!', cx, top + 24);
  const cols = 4, w = Math.min(86, (vw - 24) / cols - 6), gy = top + 50;
  for (let i = 0; i < 7; i++) { const row = i < 4 ? 0 : 1, col = row === 0 ? i : i - 4, nrow = row === 0 ? 4 : 3, x = cx - (nrow * (w + 6) - 6) / 2 + col * (w + 6), y = gy + row * 104, active = i === cur && ready, past = i < cur || (i === cur && !ready);
    card(x, y, w, 96, 12); if (active) { ctx.strokeStyle = '#ffd84d'; ctx.lineWidth = 4; rr(x, y, w, 96, 12); ctx.stroke(); } ctx.fillStyle = '#6a5a8a'; ctx.font = font(11); ctx.textAlign = 'center'; ctx.fillText('DAY ' + (i + 1), x + w / 2, y + 18);
    if (DAILY[i].ic === 'gem') drawGemIcon(x + w / 2, y + 46, 1.5); else drawIcon(DAILY[i].ic, x + w / 2, y + 46, 40); ctx.fillStyle = '#4a2a7a'; ctx.font = font(10); ctx.fillText(DAILY[i].n, x + w / 2, y + 86); if (past) { ctx.fillStyle = 'rgba(40,20,80,0.45)'; rr(x, y, w, 96, 12); ctx.fill(); drawIcon('tick', x + w / 2, y + 46, 40); } }
  const cw = 230, cxx = cx - cw / 2, cy = gy + 2 * 104 + 14; cbtn(cxx, cy, cw, 52, ready, 'go'); ctx.fillStyle = ready ? '#fff' : '#cfc6ee'; ctx.font = font(18); ctx.textAlign = 'center'; ctx.fillText(ready ? 'CLAIM DAY ' + (cur + 1) : 'CLAIMED', cx, cy + 33); if (ready) hitRect(cxx, cy, cw, 52, () => { claimLogin(); });
}
// ---- input ----
const PT = { down: false, x: 0, y: 0, sx: 0, sy: 0, moved: 0, id: null, inSheet: false, lastY: 0, vel: 0 };
function pointerXY(ev) { const r = cvs.getBoundingClientRect(); return { x: (ev.clientX !== undefined ? ev.clientX : ev.touches[0].clientX) - r.left, y: (ev.clientY !== undefined ? ev.clientY : ev.touches[0].clientY) - r.top }; }
function hitAt(x, y) { for (let i = hits.length - 1; i >= 0; i--) { const h = hits[i]; if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h; } return null; }
function onDown(ev) {
  ev.preventDefault(); if (typeof AUDIO !== 'undefined') { AUDIO.init(); if (S.settings.music !== false) AUDIO.musicStart(); applyAudioSettings(); }
  const p = pointerXY(ev);
  if (!S.started) { S.started = true; sfx('unlock', true); S.toasts.push({ txt: 'Walk onto glowing plates to spend coins!', t: 0, ic: 'star' }); return; }
  PT.down = true; PT.id = ev.pointerId; PT.x = PT.sx = p.x; PT.y = PT.sy = p.y; PT.moved = 0; PT.lastY = p.y; PT.vel = 0;
  if (S.sheet || S.modal) { PT.inSheet = true; if (S.sheet) { S.sheet.drag = false; S.sheet.vel = 0; } return; }
  PT.inSheet = false;
  const h = hitAt(p.x, p.y); if (h) { PT.down = false; h.act(); return; }
  S.stick = { ax: p.x, ay: p.y, dx: 0, dy: 0 };
}
function onMove(ev) {
  if (!PT.down || (ev.pointerId !== undefined && PT.id !== null && ev.pointerId !== PT.id)) return;
  const p = pointerXY(ev); PT.moved = Math.max(PT.moved, Math.hypot(p.x - PT.sx, p.y - PT.sy)); // displacement from the touch-down point, so finger jitter never cancels a tap
  if (PT.inSheet) { if (S.sheet && PT.moved > 14 && PT.sy > SR.y - 4 && PT.sy < SR.y + SR.h) { S.sheet.drag = true; S.sheet.scroll = clamp(S.sheet.scroll - (p.y - PT.lastY), 0, S.sheet.max); S.sheet.vel = -(p.y - PT.lastY) * 0.9; } PT.lastY = p.y; PT.x = p.x; PT.y = p.y; return; }
  PT.x = p.x; PT.y = p.y; if (!S.stick) return;
  let dx = (p.x - S.stick.ax) / 46, dy = (p.y - S.stick.ay) / 46; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; } S.stick.dx = dx; S.stick.dy = dy;
}
function onUp(ev) {
  if (!PT.down) { S.stick = null; return; } if (ev.pointerId !== undefined && PT.id !== null && ev.pointerId !== PT.id) return;
  PT.down = false;
  if (PT.inSheet) { if (S.sheet) S.sheet.drag = false; if (PT.moved <= 14) { const h = hitAt(PT.sx, PT.sy); if (h) { sfx('ui_tap'); h.act(); } } PT.inSheet = false; return; }
  S.stick = null;
}
const KEYS = {};
function onKey(ev, down) {
  const k = ev.key.toLowerCase(); KEYS[k] = down; if (!down) return;
  if (k === ' ' || k === 'shift') dashAbility(); else if (k === 'e') castUlt(); else if (k === 'q') petAbility(); else if (k === 'escape') { closeSheet(); S.modal = null; }
  else if (k === '1') openSheet('town'); else if (k === '2') openSheet('heroes'); else if (k === '3') openSheet('goals'); else if (k === '4') openSheet('perks'); else if (k === '5') openSheet('more');
}
function keyStick() { if (S.sheet || S.modal || S.stick) return; const dx = (KEYS.d || KEYS.arrowright ? 1 : 0) - (KEYS.a || KEYS.arrowleft ? 1 : 0), dy = (KEYS.s || KEYS.arrowdown ? 1 : 0) - (KEYS.w || KEYS.arrowup ? 1 : 0); S.keyStick = dx || dy ? { dx: dx / (Math.hypot(dx, dy) || 1), dy: dy / (Math.hypot(dx, dy) || 1) } : null; }
