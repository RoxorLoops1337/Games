'use strict';
// Encore Island — tutorial & onboarding. Coach cards ("tutAdd"), a permanent Help library ("tutHelp", More -> How to play), "?" buttons
// ("tutInfoButton") and the top-most coach card + arrow ("drawCoach", called last by main.js).
// Contract for other modules (all guarded by typeof in callers):
//   tutAdd({id, order, when, title, text, icon, target, sheet?, tab?, block?, cond?, who?, pos?, until?})
//   tutHelp(id, title, text, icon, cat?)   tutOpen(helpId)   tutInfoButton(x,y,helpId,size?)   tutInfoButtonSheet(x,y,helpId,size?)
//   tutorialDone(id)   tutFire(id)   drawCoach()
// Extras: target() may return {x,y,screen:true} for a SCREEN position; `who:'roxor'` picks the speaker; `pos:'top'|'bottom'` forces the card
// side; `until()` fades the card early once the player has done the thing it asks for.
const TUT = { steps: [], by: {}, help: [], helpBy: {}, cats: [] };
const TCO = { cur: null, gap: 99, poll: 0, last: 0, clock: 0, open: null };
const COACH_FADE = 14, COACH_GAP = 5;
const tutSt = () => { const st = fs('tutorial'); if (!st.seen) st.seen = {}; if (st.off === undefined) st.off = false; return st; };
const tutorialDone = (id) => !!tutSt().seen[id];

function tutAdd(step) {
  const s = Object.assign({ order: 500, title: '', text: '', icon: 'star', target: null, when: () => false }, step);
  if (!s.id) return null;
  const i = TUT.steps.findIndex(x => x.id === s.id); if (i >= 0) TUT.steps.splice(i, 1);
  TUT.steps.push(s); TUT.by[s.id] = s; TUT.steps.sort((a, b) => a.order - b.order);
  return s;
}
function tutHelp(id, title, text, icon, cat) {
  const e = { id, title, text, icon: icon || 'star', cat: cat || 'Basics' };
  const i = TUT.help.findIndex(x => x.id === id); if (i >= 0) TUT.help[i] = e; else TUT.help.push(e);
  TUT.helpBy[id] = e; if (!TUT.cats.includes(e.cat)) TUT.cats.push(e.cat);
  return e;
}
function tutOpen(helpId) {
  const h = TUT.helpBy[helpId]; if (!h) return false;
  TCO.cur = { id: 'help:' + helpId, title: h.title, text: h.text, icon: h.icon, age: 0, out: 0, manual: true, block: false, step: null, who: 'jasmin' };
  sfx('ui_open'); return true;
}
function coachCanShow(s) { return !!(S.started && !S.cards && !S.modal && !S.hold && (!S.sheet || s.sheet)); }
function coachShow(s) {
  const st = tutSt(); st.seen[s.id] = true;
  TCO.cur = { id: s.id, title: s.title, text: s.text, icon: s.icon, age: 0, out: 0, manual: false, block: !!s.block, step: s, who: s.who || 'jasmin' };
  if (s.block) S.hold = true;
  if (s.sheet) openSheet(s.sheet, s.tab);
  TCO.gap = 0; sfx('ui_open');
}
function tutFire(id) { const s = TUT.by[id]; if (!s) return false; if (TCO.cur && TCO.cur.block) S.hold = false; coachShow(s); return true; }
function coachDismiss() {
  const c = TCO.cur; if (!c) return;
  if (c.block) S.hold = false;
  if (c.out === 0) c.out = 0.001;
}
function coachSkip() { tutSt().off = true; coachDismiss(); toast('Tips are off. Turn them on again in More > How to play.', 'star', 4.5); }
function coachFinish() { const c = TCO.cur; if (c && c.block) S.hold = false; TCO.cur = null; TCO.gap = 0; }
function coachTick(dt) {
  const st = tutSt(); TCO.clock += dt;
  if (!S.hold && TCO.cur === null) TCO.gap += dt;
  if (TCO.cur) {
    if (TCO.cur.out > 0) { TCO.cur.out += dt * 3; if (TCO.cur.out >= 1) coachFinish(); }
    return;
  }
  TCO.poll -= dt; if (TCO.poll > 0) return; TCO.poll = 0.25;
  if (st.off || TCO.gap < COACH_GAP) return;
  for (let i = 0; i < TUT.steps.length; i++) {
    const s = TUT.steps[i]; if (st.seen[s.id]) continue;
    let ok = false; try { ok = !!s.when(); } catch (e) { ok = false; }
    if (!ok) continue;
    if (!coachCanShow(s)) return; // the best ready step waits its turn (priority queue)
    coachShow(s); return;
  }
}
// ---- drawing ----
function coachLines(txt, maxW) {
  const words = String(txt).split(' '), out = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
  if (line) out.push(line); return out;
}
function coachW2S(p) { return p.screen ? { x: p.x, y: p.y } : { x: vw / 2 + (p.x - CAM.x) * scl, y: vh * 0.46 + (p.y - CAM.y) * scl }; }
function coachPortrait(cx, cy, who, c) {
  disc(cx, cy, 27, '#fff4c0', '#ffd0e6');
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, 25, 0, TAU); ctx.clip();
  const fr = (c.age * 6) | 0;
  const ok = artDraw(who, who === 'roxor' ? 'idle' : 'cheer', fr, cx, cy + 50, 0.46, false);
  ctx.restore();
  if (!ok) drawIcon(c.icon || 'star', cx, cy, 30);
  ctx.strokeStyle = HV.line; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(cx, cy, 27, 0, TAU); ctx.stroke();
}
function coachArrow(tp, rect, c) {
  const sp = coachW2S(tp), pu = 1 + Math.sin(c.age * 7) * 0.12, bob = Math.sin(c.age * 6) * 5;
  const inside = sp.x > rect.x0 && sp.x < rect.x1 && sp.y > rect.y0 + 20 && sp.y < rect.y1;
  ctx.save(); ctx.lineJoin = 'round'; ctx.strokeStyle = HV.line; ctx.lineWidth = 5; ctx.fillStyle = '#ffd84d';
  if (inside) {
    ctx.strokeStyle = 'rgba(255,233,138,' + (0.45 + 0.4 * Math.sin(c.age * 6)) + ')'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(sp.x, sp.y, 26 + 6 * Math.sin(c.age * 6), 0, TAU); ctx.stroke();
    ctx.strokeStyle = HV.line; ctx.lineWidth = 5; ctx.translate(sp.x, sp.y - 44 - bob); ctx.scale(pu, pu);
    ctx.beginPath(); ctx.moveTo(0, 20); ctx.lineTo(-15, -2); ctx.lineTo(-5, -2); ctx.lineTo(-5, -16); ctx.lineTo(5, -16); ctx.lineTo(5, -2); ctx.lineTo(15, -2); ctx.closePath(); ctx.stroke(); ctx.fill();
  } else {
    const cx0 = vw / 2, cy0 = clamp(vh * 0.46, rect.y0 + 2, rect.y1 - 2), dx = sp.x - cx0, dy = sp.y - cy0, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
    const tx = ux > 1e-4 ? (rect.x1 - cx0) / ux : ux < -1e-4 ? (rect.x0 - cx0) / ux : 1e9, ty = uy > 1e-4 ? (rect.y1 - cy0) / uy : uy < -1e-4 ? (rect.y0 - cy0) / uy : 1e9, t = Math.min(tx, ty);
    ctx.translate(cx0 + ux * t, cy0 + uy * t); ctx.rotate(Math.atan2(dy, dx)); ctx.scale(pu, pu);
    ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-9, -13); ctx.lineTo(-3, 0); ctx.lineTo(-9, 13); ctx.closePath(); ctx.stroke(); ctx.fill();
  }
  ctx.restore();
}
function coachClockStep() {
  const now = Date.now(); const d = TCO.last ? clamp((now - TCO.last) / 1000, 0, 0.05) : 0.016; TCO.last = now; return d;
}
function drawCoach() {
  const c = TCO.cur, rdt = coachClockStep(); if (!c || !S.started || S.cards) return;
  if (!c.manual && (S.modal || (S.sheet && !c.step.sheet))) return; // parked while another screen is up
  if (!S.hold || c.block) c.age += rdt; if (c.age > 100) c.age = 100;
  if (!c.block && !c.manual && c.out === 0 && c.age > COACH_FADE) c.out = 0.001;
  if (c.step && c.step.until && c.out === 0 && c.age > 2.5) { try { if (c.step.until()) c.out = 0.001; } catch (e) { /* ignore */ } }
  if (c.out > 0) { c.out += rdt * 3; if (c.out >= 1) { coachFinish(); return; } }
  const inT = clamp(c.age / 0.4, 0, 1), e = easeBack(inT), al = clamp(c.age * 5, 0, 1) * (1 - Math.min(1, c.out)), full = c.block || c.manual;
  // target + side
  let tp = null; if (c.step && c.step.target) { try { tp = c.step.target(); } catch (er) { tp = null; } }
  const sp = tp ? coachW2S(tp) : null;
  let top = c.step && c.step.pos ? c.step.pos === 'top' : sp ? sp.y > vh * 0.52 : false;
  if (c.step && c.step.sheet) top = true;
  // layout
  const W = Math.min(380, vw - 24), x = (vw - W) / 2, pad = 12, tx = x + pad + 58 + 6, tw = x + W - pad - tx;
  ctx.font = font(15, true); const tl = coachLines(c.title, tw), body = font(13, false); ctx.font = body; const bl = coachLines(c.text, W - pad * 2);
  const headH = Math.max(52, tl.length * 19 + 8), h = pad + headH + 2 + bl.length * 17 + 8 + 44 + 10;
  let y = c.manual ? Math.max(40, vh * 0.5 - h / 2 - 20) : top ? 96 : vh - DOCK_H - 6 - 38 - h;
  const slide = (1 - e) * 36 * (top ? -1 : 1) + (c.out > 0 ? c.out * 20 * (top ? -1 : 1) : 0), sc = 0.9 + 0.1 * Math.min(1.05, e);
  if (full) { ctx.fillStyle = 'rgba(25,12,60,' + (c.manual ? 0.5 : 0.62) * al + ')'; ctx.fillRect(0, 0, vw, vh); hits.push({ x: 0, y: 0, w: vw, h: vh, act: c.manual ? coachDismiss : () => {} }); }
  if (tp && !full) coachArrow(tp, { x0: 26, x1: vw - 26, y0: top ? y + h + 22 : 120, y1: top ? vh - DOCK_H - 30 : y - 22 }, c);
  ctx.save(); ctx.globalAlpha = al; ctx.translate(vw / 2, y + h / 2 + slide); ctx.scale(sc, sc); ctx.translate(-vw / 2, -(y + h / 2));
  ctx.fillStyle = 'rgba(40,20,80,0.25)'; rr(x + 2, y + 6, W, h, 20); ctx.fill();
  card(x, y, W, h, 20); ctx.strokeStyle = '#ffb640'; ctx.lineWidth = 2; rr(x + 3, y + 3, W - 6, h - 6, 17); ctx.stroke();
  coachPortrait(x + pad + 28, y + pad + 27, c.who, c);
  ctx.textAlign = 'left'; ctx.fillStyle = '#4a2a7a'; ctx.font = font(15, true); for (let i = 0; i < tl.length; i++) ctx.fillText(tl[i], tx, y + pad + 16 + i * 19);
  ctx.fillStyle = '#5a4a7a'; ctx.font = body; for (let i = 0; i < bl.length; i++) ctx.fillText(bl[i], x + pad, y + pad + headH + 14 + i * 17);
  const by = y + h - 54, bw = 128, bx = x + W - pad - bw;
  cbtn(bx, by, bw, 44, true, 'go'); ctx.fillStyle = '#fff'; ctx.font = font(16, true); ctx.textAlign = 'center'; ctx.fillText('Got it!', bx + bw / 2, by + 29);
  if (!c.manual) { ctx.fillStyle = '#5a4a7a'; ctx.font = font(11, true); ctx.textAlign = 'left'; ctx.fillText('Skip tips', x + pad + 2, by + 27); }
  ctx.restore();
  // hit areas LAST so they win: card body absorbs taps, then Skip, then Got it
  hits.push({ x, y, w: W, h, act: () => {} });
  if (!c.manual) hitRect(x + pad - 6, by - 4, 92, 52, coachSkip);
  hitRect(bx - 6, by - 4, bw + 12, 52, () => { coachDismiss(); sfx('ui_tap'); });
}
// ---- "?" buttons ----
function coachInfoDraw(x, y, size) {
  const s = size || 22; disc(x, y, s / 2, '#fff4c0', '#f0b422'); ctx.strokeStyle = HV.line; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, s / 2, 0, TAU); ctx.stroke();
  ctx.fillStyle = '#4a2a7a'; ctx.font = font(Math.round(s * 0.68), true); ctx.textAlign = 'center'; ctx.fillText('?', x, y + s * 0.24);
}
function tutInfoButton(x, y, helpId, size) { coachInfoDraw(x, y, size); hitRect(x - 18, y - 18, 36, 36, () => tutOpen(helpId)); }
function tutInfoButtonSheet(x, y, helpId, size) { coachInfoDraw(x, y, size); chit(x - 18, y - 18, 36, 36, () => tutOpen(helpId)); }

// ---- Help tab (More -> How to play) ----
function helpTab(cw) {
  const st = tutSt(); let y = 4;
  rowCard(y, 42, cw); ctx.fillStyle = '#fff'; ctx.font = font(13, true); ctx.textAlign = 'left'; ctx.fillText('Show tips', 14, y + 26);
  const on = !st.off; pill(cw - 66, y + 9, 52, 24, on ? '#7cf09a' : '#6a5aa0', on ? '#25a84f' : '#3e3076'); ctx.fillStyle = '#fff'; ctx.font = font(11, true); ctx.textAlign = 'center'; ctx.fillText(on ? 'ON' : 'OFF', cw - 40, y + 26);
  chit(2, y, cw - 4, 42, () => { st.off = !st.off; sfx('ui_tap'); }); y += 48;
  cbtn(2, y, cw - 4, 42, true, 'violet'); ctx.fillStyle = '#fff'; ctx.font = font(14, true); ctx.textAlign = 'center'; ctx.fillText('Replay tutorial', cw / 2, y + 27);
  chit(2, y, cw - 4, 42, () => { tutReplay(); toast('Tutorial reset: tips will appear again', 'star', 3.5); }); y += 50;
  y = note(y, cw, 'Tap a topic to read it. The same help is behind every "?" button.');
  for (const cat of TUT.cats) {
    y = section(y, cat);
    for (const hp of TUT.help) {
      if (hp.cat !== cat) continue;
      const open = TCO.open === hp.id; ctx.font = font(12, false); const ls = open ? coachLines(hp.text, cw - 28) : [], rh = open ? 44 + ls.length * 16 + 10 : 44;
      rowCard(y, rh, cw); drawIcon(hp.icon, 26, y + 22, 28); ctx.fillStyle = '#fff'; ctx.font = font(13, true); ctx.textAlign = 'left'; ctx.fillText(hp.title, 48, y + 27);
      ctx.fillStyle = '#cfc6ee'; ctx.font = font(14, true); ctx.textAlign = 'right'; ctx.fillText(open ? '-' : '+', cw - 14, y + 27);
      if (open) { ctx.fillStyle = '#e6dcff'; ctx.font = font(12, false); ctx.textAlign = 'left'; for (let i = 0; i < ls.length; i++) ctx.fillText(ls[i], 14, y + 52 + i * 16); }
      chit(2, y, cw - 4, rh, () => { TCO.open = open ? null : hp.id; sfx('ui_tap'); });
      y += rh + 6;
    }
    y += 4;
  }
  return y + 8;
}
function tutReplay() { const st = tutSt(); st.seen = {}; st.off = false; TCO.gap = 99; if (TCO.cur) coachFinish(); }

regFeature({
  id: 'tutorial', keep: true,
  init(st) { if (!st.seen) st.seen = {}; if (st.off === undefined) st.off = false; },
  onLoad(st) { // a veteran save should not be lectured on the basics again
    if (Object.keys(st.seen).length === 0 && (S.stats.kills >= 40 || S.stats.earned >= 3000)) for (const s of TUT.steps) if (s.order <= 100) st.seen[s.id] = true;
  },
  tick(dt) { coachTick(dt); },
  on: { prestige() { if (TCO.cur) coachFinish(); } },
  api: { tutAdd, tutHelp, tutOpen, tutFire, tutorialDone, tutReplay, coachTick, drawCoach, dismiss: coachDismiss, finish: coachFinish, skip: coachSkip, TUT, CO: TCO, helpTab, tutInfoButton, tutInfoButtonSheet },
});
regTab('more', 'help', 'How to play', helpTab);

// ================= core coach steps =================
const tutDock = (id) => { const i = DOCK.findIndex(d => d[0] === id), w = Math.min(vw - 12, 540), x0 = (vw - w) / 2, bw = w / DOCK.length; return { x: x0 + bw * (i + 0.5), y: vh - DOCK_H - 6, screen: true }; };
function tutAffordPlate() {
  const p = S.player; let best = null, bd = 1e18;
  const c = (x, y, rem) => { if (rem > 0 && rem <= S.wallet) { const d = dist2(p.x, p.y, x, y); if (d < bd) { bd = d; best = { x, y }; } } };
  for (const k in UPG) c(UPG_POS[k].x, UPG_POS[k].y, upgCost(k, S.up[k]) - S.upPaid[k]);
  for (const z of S.lands) for (const pl of z.plates) if (!pl.built) c(pl.x, pl.y, pl.cost - pl.paid);
  return best;
}
const tutPlate = (id) => { for (const z of S.lands) for (const pl of z.plates) if (pl.id === id) return pl; return null; };
const tutFoe = (f) => { for (const e of S.enemies) if (e.hp > 0 && f(e)) return e; return null; };
const tutSum = (o) => { let n = 0; for (const k in o) n += o[k] || 0; return n; };
const tutSeen = (id) => !!(S.feat.tutorial && S.feat.tutorial.seen && S.feat.tutorial.seen[id]);

tutAdd({ id: 'welcome', order: 10, block: true, icon: 'mic', title: 'Welcome to Encore Island!', when: () => S.started,
  text: 'You are Jasmin, a singer whose voice is magic. RoxorLoops is your best friend and carries all your loot. To move, drag anywhere on the screen, or use W A S D or the arrow keys.' });
tutAdd({ id: 'meadow', order: 20, icon: 'dmg', title: 'Go sing at the creatures', when: () => tutSeen('welcome') && S.stats.kills < 1,
  target: () => S.lands[0] ? S.lands[0].g.den : null, until: () => S.stats.kills >= 1,
  text: 'Follow the arrow to the meadow. Stay close to the creatures and Jasmin sings at them by herself. No button needed!' });
tutAdd({ id: 'drops', order: 30, icon: 'cap', who: 'roxor', title: 'Loot! Walk over it', when: () => S.stats.kills >= 1 && (S.items.length > 0 || S.player.helmets.length > 0),
  target: () => { let b = null, bd = 1e18; for (const it of S.items) { const d = dist2(S.player.x, S.player.y, it.x, it.y); if (d < bd) { bd = d; b = it; } } return b ? { x: b.x, y: b.y } : null; },
  until: () => S.player.helmets.length >= 3,
  text: 'Creatures drop helmets. Walk over them and RoxorLoops stacks them up. He can only carry so many, the number above him shows how full he is (like 5/8).' });
tutAdd({ id: 'sell', order: 40, icon: 'coin', who: 'roxor', title: 'Time to sell!', when: () => S.player.helmets.length >= Math.min(3, cap()),
  target: () => ({ x: SELL.x, y: SELL.y }), until: () => S.stats.sold >= 1,
  text: 'Walk to the SELL stall and stand on it. Roxor hands over his helmets and they turn into coins that fly to the Vault.' });
tutAdd({ id: 'vault', order: 45, icon: 'coin', title: 'Collect your coins', when: () => S.pallet > 0 && S.stats.sold >= 1,
  target: () => ({ x: VAULT.x, y: VAULT.y }), until: () => S.pallet <= 0,
  text: 'Your coins are waiting in the Vault. Stand on the Vault until they pour into your wallet, the coin counter at the top.' });
tutAdd({ id: 'plates', order: 50, icon: 'dmg', title: 'Spend coins on glowing plates', when: () => S.wallet >= 8 && S.stats.sold >= 1,
  target: () => tutAffordPlate() || UPG_POS.dmg, until: () => tutSum(S.up) > 0 || S.lands.some(z => z.plates.some(p => p.built)),
  text: 'Walk onto a glowing plate and stand still. Your coins fill it up, and then you get the upgrade. Plates in the plaza make you stronger, faster and tougher.' });
tutAdd({ id: 'groove', order: 60, icon: 'groove', pos: 'top', title: 'Tap the BEAT button', when: () => S.stats.kills >= 12,
  target: () => ({ x: vw - 132, y: vh - DOCK_H - 6 - 84, screen: true }),
  text: 'Watch the ring shrink onto the pink BEAT button. Tap it exactly when the ring touches the button (or press B). A PERFECT tap fills the GROOVE bar and boosts your damage for 3 seconds. Full bar = ENCORE: double coins and damage!' });
tutAdd({ id: 'cards', order: 70, icon: 'star', title: 'Level up! Cards are yours', when: () => S.level >= 2 && tutSum(S.perks) > 0,
  text: 'Every level-up you pick 1 of 3 cards. The card you picked stays with you for this whole run. Choose what fits how you like to play.' });
tutAdd({ id: 'dash', order: 80, icon: 'speed', pos: 'top', title: 'Dash!', when: () => S.stats.kills >= 20,
  target: () => ({ x: vw - 52, y: vh - DOCK_H - 6 - 84, screen: true }), until: () => S.player.dashCd > 0,
  text: 'Tap the green DASH button (or press Space) to zip a short way. You cannot be hurt while dashing, so use it to escape. It needs a moment to recharge.' });
tutAdd({ id: 'ult', order: 85, icon: 'crit', pos: 'top', title: 'Your blast is ready', when: () => typeof ultReady === 'function' && ultReady(),
  target: () => ({ x: 52, y: vh - DOCK_H - 6 - 84, screen: true }), until: () => S.stats.ults > 0,
  text: 'Every kill charges the pink button. When it is full, tap it (or press E) for a huge blast that hits every creature around you. Great against bosses.' });
tutAdd({ id: 'towers', order: 90, icon: 'tower', title: 'Build a tower', when: () => S.stats.earned >= 80 && !!tutPlate('tower1') && !tutPlate('tower1').built,
  target: () => { const p = tutPlate('tower1'); return p ? { x: p.x, y: p.y } : null; }, until: () => !!(tutPlate('tower1') && tutPlate('tower1').built),
  text: 'Plates inside the meadow build towers. Towers sing at creatures for you, even while you are busy or away, so loot keeps coming in.' });
tutAdd({ id: 'newland', order: 100, icon: 'way', title: 'A new island awaits', when: () => !!S.unlockPlate && S.wallet >= S.unlockPlate.cost - S.unlockPlate.paid,
  target: () => S.unlockPlate ? { x: S.unlockPlate.x, y: S.unlockPlate.y } : null, until: () => S.lands.length >= 2,
  text: 'The gold NEW LAND chip at the top is lit up! Walk onto the glowing portal plate to open the next island, with tougher creatures and richer loot.' });
tutAdd({ id: 'crew', order: 110, icon: 'home', pos: 'top', title: 'Recruit your fans', when: () => S.pop.length === 0 && S.wallet >= recruitCost(),
  target: () => tutDock('town'), until: () => S.pop.length > 0,
  text: 'Tap Town to recruit fans. Collectors haul loot to the stall for you, and fighters help you sing. Train each fan to make them better, and upgrade buildings to boost the whole crew.' });
tutAdd({ id: 'gems', order: 125, icon: 'gem', title: 'You found a gem!', when: () => S.gems >= 1, target: () => ({ x: GEM_POS.magnet.x, y: GEM_POS.magnet.y }),
  text: 'Gems are rare. Spend them on the blue gem plates in the plaza (Magnet, Crit, Midas), or in Heroes to hatch critters.' });
tutAdd({ id: 'smelter', order: 120, icon: 'forge', title: 'The Smelter', when: () => !S.forge && S.stats.earned >= S.forgePlate.cost * 0.8, target: () => ({ x: FORGE.x, y: FORGE.y }),
  until: () => !!S.forge,
  text: 'Build the Smelter on its glowing plate. Feed it helmets and it makes shiny bars worth far more. Collect them from the tray next to it.' });
tutAdd({ id: 'daily', order: 130, icon: 'gift', pos: 'top', title: 'Your daily gift', when: () => typeof loginReady === 'function' && loginReady() && S.stats.kills >= 10,
  target: () => tutDock('more'), text: 'A free gift is waiting! Tap More, then Daily gift. Come back every day: the prizes get better, up to a jackpot on day 7.' });
tutAdd({ id: 'egg', order: 135, icon: 'egg', pos: 'top', title: 'Hatch a critter', when: () => S.gems >= eggCost(S.stats.hatches), target: () => tutDock('heroes'),
  text: 'You have enough gems for an egg! Tap Heroes, then Critters. A critter follows you and gives a bonus, plus a special move you can trigger.' });
tutAdd({ id: 'wheel', order: 138, icon: 'egg', pos: 'top', title: 'Fortune wheel', when: () => S.gems >= SPIN_COST && S.stats.hatches >= 1 && S.stats.spins === 0, target: () => tutDock('more'),
  text: 'Spare gems? Tap More, then Fortune wheel, and spin it for coins, gems, boosts or even a free egg.' });
tutAdd({ id: 'goals', order: 140, icon: 'trophy', pos: 'top', title: 'Goals give rewards', when: () => S.stats.quests >= 1 || S.stats.kills >= 40, target: () => tutDock('goals'),
  text: 'Tap Goals to see your quests and daily quests. Finish them for coins and gems. Milestones there unlock permanent rewards as you play.' });
tutAdd({ id: 'boss', order: 150, icon: 'crown', title: 'A Headliner appears!', when: () => !!tutFoe(e => e.boss),
  target: () => { const e = tutFoe(x => x.boss); return e ? { x: e.x, y: e.y } : null; },
  text: 'A Headliner is a big boss with lots of health that shoots back. Beat it and it drops a shiny crown, worth much more than normal loot, plus gems.' });
tutAdd({ id: 'chest', order: 160, icon: 'chest', title: 'Treasure chest!', when: () => !!S.chest, target: () => S.chest ? { x: S.chest.x, y: S.chest.y } : null, until: () => !S.chest,
  text: 'A treasure chest popped up on your island. Walk over it for a pile of coins, but be quick: it disappears after a while.' });
tutAdd({ id: 'champion', order: 165, icon: 'star', title: 'A Champion rises', when: () => !!tutFoe(e => e.elite),
  target: () => { const e = tutFoe(x => x.elite); return e ? { x: e.x, y: e.y } : null; },
  text: 'A Champion is a tougher creature with extra health. Defeat it for bonus coins, gems and extra loot.' });
tutAdd({ id: 'golden', order: 168, icon: 'gem', title: 'A golden creature!', when: () => !!tutFoe(e => e.gold),
  target: () => { const e = tutFoe(x => x.gold); return e ? { x: e.x, y: e.y } : null; },
  text: 'Golden creatures are rare and fragile. Catch one before it gets away for a gem and extra loot.' });
tutAdd({ id: 'tour', order: 170, icon: 'way', title: 'Ready for an Encore Tour', when: () => S.lands.length >= PRESTIGE_MIN, target: () => ({ x: MONU.x, y: MONU.y }),
  text: 'Stand still on the big monument to start an Encore Tour. You keep your crowns, critters, outfits, milestones and Help progress. Your islands, coins, upgrades, cards, fans and buildings start over, but you earn crowns to buy permanent Perks.' });
tutAdd({ id: 'perks', order: 175, icon: 'crown', pos: 'top', title: 'Spend your crowns', when: () => S.crowns >= 1 && S.prestiges >= 1, target: () => tutDock('perks'),
  text: 'Tap Perks to spend crowns on permanent bonuses. They stay with you through every Encore Tour and make each new run faster.' });
tutAdd({ id: 'death', order: 180, icon: 'heart', title: 'You dropped everything', when: () => S.player.deaths >= 1,
  text: 'When your health runs out you drop every helmet you carry. They stay on the ground where you fell, so walk back and pick them up. Sell often and buy Vitality to stay safe.' });

// ================= help library =================
const tutH = tutHelp;
tutH('move', 'Moving around', 'Drag anywhere on the screen to walk, like a joystick. On a keyboard use W A S D or the arrow keys. Jasmin sings at creatures automatically when they are close.', 'speed', 'Basics');
tutH('plates', 'Glowing plates', 'Stand on a glowing plate and your coins flow into it. When it is full you get the upgrade or building. You can leave halfway and come back, the coins stay put.', 'star', 'Basics');
tutH('loot', 'Loot and your stack', 'Creatures drop helmets. Walk over them and RoxorLoops stacks them. The number above him (like 5/8) shows how many he carries. When he is full he cannot pick up more, so go sell.', 'cap', 'Basics');
tutH('sell', 'Selling loot', 'Stand on the SELL stall and Roxor hands over his helmets one by one. Each one turns into coins that fly to the Vault. Better helmets from later islands are worth more.', 'coin', 'Basics');
tutH('vault', 'The Vault', 'Sold coins wait in the Vault. Stand on it to pour them into your wallet. Coins in the Vault are safe, and your crew and towers also add coins here.', 'coin', 'Basics');
tutH('flow', 'Keep it flowing', 'The longer you stay on the same stall (sell or vault), the faster it works. Short hops back and forth are slower than staying put.', 'speed', 'Basics');
tutH('upgrades', 'Plaza upgrades', 'The five plates at the bottom of the plaza raise Speed, Backpack (carry more), Power, Tempo (sing faster) and Vitality (health). Each level costs more than the last.', 'dmg', 'Basics');
tutH('groove', 'Groove and ENCORE', 'Tap the pink BEAT button (or press B) exactly when the shrinking ring touches it. PERFECT taps fill the groove bar, chain up for bonus fill, and boost your damage for 3 seconds. Late or early taps fill less. Kills add a tiny bit too. A full bar starts an ENCORE: double coins and double damage for a few seconds.', 'groove', 'Fighting');
tutH('combo', 'Combos', 'Defeat creatures one after another without a long pause to build a combo. Long streaks pay bonus coins, with big rewards at 25, 50, 100 and 200. Getting hurt cuts your combo in half.', 'star', 'Fighting');
tutH('cards', 'Level-up cards', 'Each time you level up you pick 1 of 3 cards, like louder notes or faster tempo. A card lasts for the whole run. You can get the same card again to stack it.', 'star', 'Fighting');
tutH('dash', 'Dash', 'Tap the green button (or press Space) to dash a short way. You cannot be hurt while you dash. It takes a moment to recharge.', 'speed', 'Fighting');
tutH('ult', 'Encore Blast', 'Every kill charges the pink button. When it is full, tap it (or press E) for a huge blast that hits every creature around you.', 'crit', 'Fighting');
tutH('boss', 'Headliners', 'A Headliner is a boss. Build the Headliner Stage plate on an island (from island 2) and stand on it to call one. Beat it for a crown helmet and gems.', 'crown', 'Fighting');
tutH('champion', 'Champions and golden foes', 'Now and then a creature turns into a Champion with extra health and better rewards. Golden creatures are rare and fragile and drop gems. Go and get them!', 'star', 'Fighting');
tutH('chest', 'Treasure chests', 'Every few minutes a chest appears somewhere on your islands. Walk over it for coins. If you wait too long it vanishes.', 'chest', 'Fighting');
tutH('death', 'If you faint', 'When your health runs out you drop everything you carry where you fell and wake up on the stage. Walk back and pick it up again. Health upgrades help.', 'heart', 'Fighting');
tutH('towers', 'Towers', 'Plates inside each island build towers: Speaker, Disco and Boom Box towers sing at creatures for you, and they keep working while you are away.', 'tower', 'Islands');
tutH('drums', 'War Drums, Gate and Amp', 'War Drums make you and the towers on that island fire faster. The Crowd Gate brings a bigger crowd of creatures (more loot). Amp Up makes your towers hit harder.', 'drums', 'Islands');
tutH('lands', 'New lands', 'The gold NEW LAND chip shows how close you are to the next island. Each one has tougher creatures, better loot and new plates. Tap the chip to be pointed at its portal.', 'way', 'Islands');
tutH('warp', 'Warp Pads', 'Once you open two islands you can build Warp Pads in the plaza. Stand still on a pad to jump between the plaza and your newest island.', 'way', 'Islands');
tutH('fans', 'Fans and jobs', 'Recruit fans in Town. Collectors haul loot to the stall and sell it. Fighters help you sing. Move fans between the two jobs, and train each fan to get better.', 'heart', 'Town');
tutH('town', 'Town buildings', 'Buildings give your whole crew a boost: more beds, bigger loads, harder hits and more. Upgrade them and your town grows from Hamlet to Megacity.', 'home', 'Town');
tutH('smelter', 'The Smelter', 'Build the Smelter in the plaza. Feed it helmets and it turns them into shiny bars worth far more. Collect the bars from the tray beside it and sell them.', 'forge', 'Town');
tutH('pets', 'Critters and eggs', 'Spend gems on an egg in Heroes to hatch a critter. Pick one to follow you for a bonus, and use its special move with the round button (or press Q).', 'egg', 'Rewards');
tutH('gems', 'Gems and gem plates', 'Gems come from bosses, champions, golden creatures, goals and gifts. Spend them on the blue gem plates in the plaza (Magnet, Crit, Midas) or on eggs.', 'gem', 'Rewards');
tutH('wheel', 'Wheel and daily gift', 'Open More for a free daily gift (better each day in a row) and the Fortune wheel, which costs a few gems per spin and can pay out coins, gems, boosts or an egg.', 'gift', 'Rewards');
tutH('quests', 'Quests', 'Goals has three quests and three daily quests. Finish them for coins, and sometimes gems. When you finish one a new one appears.', 'scroll', 'Rewards');
tutH('miles', 'Milestones and records', 'Milestones are big achievements, like 100 creatures or your first Encore Tour. Records keep your best numbers and the Creatures tab lists everyone you have met.', 'trophy', 'Rewards');
tutH('tour', 'Crowns and Encore Tour', 'With enough islands open you can stand on the monument for an Encore Tour. You start over, but earn crowns. You keep crowns, perks, critters, outfits and milestones. You lose islands, coins, upgrades, cards, fans and buildings.', 'crown', 'Rewards');
tutH('perks', 'Perks', 'Spend crowns in the Perks sheet on permanent bonuses like more coins, damage, health and speed. They last through every Encore Tour.', 'crown', 'Rewards');
tutH('offline', 'Earning while away', 'Your towers and fans keep earning while the game is closed. When you return, the coins wait in the Vault. The Snack Bar building boosts this.', 'coin', 'Rewards');
