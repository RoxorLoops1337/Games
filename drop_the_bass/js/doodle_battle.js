// doodle_battle.js: the DOODLE look of the battle view (crayon notebook style). battle.js calls these at the top of drawBoard, drawPanel, drawHud,
// drawDeploy, drawHero, drawBanner and drawTutorial when the style is 'doodle'; each takes the Battle instance `b` first and keeps the same state
// (hpLag, coinPop, press, readyFlash...) and layout (R) as the classic drawing, so input and hit areas are identical in both styles.
// No glow, no additive blend, no gradients: paper bands, taped panels, fat crayon buttons, dashed crayon rings. Static art is baked via the HUD kit.
import { W, H, COLS, TURRETS, ENEMIES, BOSSES, COL, ECON, MAX_LEVEL, fmt, BOARD_Y, BOARD_H } from './data_core.js';
import { WAVE_MODS } from './data_run.js';
import { TUTORIAL } from './data_story.js';
import * as AE from './art_entities.js';
import * as AW from './art_world.js';
import * as K from './doodle_kit.js';
import * as DH from './doodle_hud.js';
import { R } from './battle.js';

const C = K.C, INK = C.ink, TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hh = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const easeOutBack = (k) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
const AFFIX_COL = { golden: '#ffc83a', swift: '#2fc4b2', armored: '#9a9aa6', regen: '#43b94a', giant: '#ff9226' };
const DIM = '#6b6477';
const frame = (t) => Math.floor(t * K.BOIL_FPS) % 3;

// a live wobbly crayon ring (cheap: one ink pass, one colour pass). dash optional.
function ring(ctx, x, y, r, col, w, t, o = {}) {
  const fr = frame(t), n = clamp(Math.round(r / 3), 12, 30), seed = o.seed || 0;
  const path = (rad) => {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) { const a = i / n * TAU, q = rad * (1 + (hh((i % n) * 5.3 + fr * 9.1 + seed) - 0.5) * 0.07); const px = x + Math.cos(a) * q, py = y + Math.sin(a) * q; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
  };
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (o.dash) { ctx.setLineDash(o.dash); ctx.lineDashOffset = -(o.march || 0); }
  if (o.ink !== false) { path(r); ctx.globalAlpha = (o.alpha == null ? 1 : o.alpha) * 0.85; ctx.strokeStyle = INK; ctx.lineWidth = w + 3; ctx.stroke(); }
  path(r); ctx.globalAlpha = o.alpha == null ? 1 : o.alpha; ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
  ctx.restore();
}
function rrectStroke(ctx, x, y, w, h, r, col, lw, alpha, dash, march) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round';
  if (dash) { ctx.setLineDash(dash); ctx.lineDashOffset = -(march || 0); }
  DH.rrect(ctx, x, y, w, h, r); ctx.stroke(); ctx.restore();
}

// ---------------------------------------------------------------------------------------------------- board
export function drawBoard(b, ctx, t, beat) {
  const run = b.run, fx = b.fx;
  AW.drawBoard(ctx, run.map.id, run.world.id, t, { beat, slotHint: b.slotHint, hoverSlot: b.hoverSlot ? [b.hoverSlot.c, b.hoverSlot.r] : null, dropSlot: b.targetSlot != null ? [b.targetSlot % COLS, Math.floor(b.targetSlot / COLS)] : null });
  AW.drawStageBase(ctx, run.world.id, run.map.base.x, run.map.base.y, { t, hp: run.stageFrac, hit: Math.max(0, b.hurtFlash), beat });
  // selected range: a pale tinted disc with a marching dashed crayon edge
  const sel = b.selected ? run.turretById(b.selected) : null;
  if (sel) {
    const rg = run.turretRange(sel), def = TURRETS[sel.type];
    ctx.save(); ctx.globalAlpha = 0.14; ctx.fillStyle = def.color; ctx.beginPath(); ctx.arc(sel.x, sel.y, rg, 0, TAU); ctx.fill(); ctx.restore();
    ring(ctx, sel.x, sel.y, rg, def.color, 4, t, { dash: [12, 9], march: t * 24, alpha: 0.9, seed: sel.id });
  }
  const dragT = b.drag && b.drag.moved ? run.turretById(b.drag.id) : null;
  const hintT = dragT || sel;
  // turrets: a scribbled ground shadow, a pop ring when new, and the merge invitation
  const ts = run.turrets.slice().sort((a, c) => a.y - c.y);
  for (const tu of ts) {
    const hidden = b.drag && b.drag.moved && b.drag.id === tu.id;
    const age = t - (tu.born || 0), def = TURRETS[tu.type];
    ctx.save(); ctx.globalAlpha = hidden ? 0.08 : 0.2; ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(tu.x, tu.y + 24, 25 + tu.level, 8, 0, 0, TAU); ctx.fill(); ctx.restore();
    if (age < 0.5) ring(ctx, tu.x, tu.y, 20 + age * 70, def.color, 3.5, t, { alpha: (0.5 - age) * 1.8, seed: tu.id });
    if (tu.fire > 0.5) ring(ctx, tu.x, tu.y, 38, def.color, 3, t, { alpha: (tu.fire - 0.5) * 1.2, ink: false, seed: tu.id });
    const canMerge = hintT && hintT !== tu && run.canMerge(hintT, tu);
    if (canMerge) {
      const k = 0.5 + 0.5 * Math.sin(t * 8);
      ring(ctx, tu.x, tu.y, 41 + k * 4, C.lime, 5, t, { alpha: 0.7 + 0.3 * k, seed: tu.id + 3 });
    }
    AE.drawTurret(ctx, tu.type, tu.level, tu.x, tu.y, {
      t, ang: tu.ang, fire: Math.max(0, tu.fire), jammed: tu.jam > 0, buff: tu.auraRate > 0 ? 'rate' : tu.auraDmg > 0 ? 'dmg' : null,
      selected: tu.id === b.selected, alpha: hidden ? 0.3 : 1, spawn: clamp(age / 0.25, 0, 1),
    });
  }
  // enemies: bosses get a marching dashed threat ring, elites a coloured ring
  const en = run.enemies.slice().sort((a, c) => (a.flying - c.flying) || (a.y - c.y));
  for (const e of en) {
    if (e.boss) {
      const bc = BOSSES[e.type].color;
      ring(ctx, e.x, e.y + e.r * 0.5, e.r * 1.5, e.gated ? C.gold : bc, 4, t, { dash: [14, 10], march: t * 30, alpha: 0.55 + 0.25 * Math.sin(t * 5), seed: 1 });
      AE.drawBoss(ctx, e.type, e.x, e.y, { t, ang: e.ang, hp: e.hp / e.maxHp, hit: e.hitT > 0 ? e.hitT / 0.12 : 0, gated: e.gated, phase: e.phase, scale: e.r / BOSSES[e.type].r });
    } else {
      if (e.affix) ring(ctx, e.x, e.y, e.r * 1.45, AFFIX_COL[e.affix] || C.gold, 3, t, { dash: [8, 6], march: t * 22, alpha: 0.7 + 0.2 * Math.sin(t * 6 + e.id), seed: e.id });
      const sc = e.r / ENEMIES[e.type].r;
      AE.drawEnemy(ctx, e.type, e.x, e.y, {
        t, ang: e.ang, hp: e.hp / e.maxHp, hit: e.hitT > 0 ? e.hitT / 0.12 : 0, slow: e.slowT > 0 && e.slowAmt > 0, stun: e.stun > 0, burn: e.burnT > 0, mark: e.markT > 0,
        shield: e.shieldMax ? e.shield / e.shieldMax : 0, affix: e.affix, scale: sc, rage: e.rage, id: e.id,
      });
    }
  }
  // projectiles: the doodle projectile and a ribbon trail, no glow
  for (const p of run.projectiles) {
    if (p.delay > 0) continue;
    const col = PROJ_COL[p.style] || C.paper;
    if (p.style !== 'hat') fx.trail(p.id, p.x, p.y, col, p.big ? 7 : 4.5);
    AE.drawProjectile(ctx, p.style, p.x, p.y, { t, ang: p.ang || 0, scale: p.small ? 0.7 : p.big ? 1.5 : 1 });
  }
  // dragged turret ghost
  if (b.drag && b.drag.moved) {
    const tu = run.turretById(b.drag.id);
    if (tu) {
      ring(ctx, b.drag.x, b.drag.y - 20, 46, TURRETS[tu.type].color, 4, t, { dash: [10, 8], march: t * 30, alpha: 0.9, seed: 7 });
      AE.drawTurret(ctx, tu.type, tu.level, b.drag.x, b.drag.y - 20, { t, ang: tu.ang, scale: 1.15, selected: true, alpha: 0.95 });
    }
  }
  b.panel = null;
  if (sel) b.drawPanel(ctx, sel);
}
// crayon-ish projectile ribbon colours: darker than the classic neon so they read on paper
const PROJ_COL = { kick: '#ff9226', snare: '#ffb81c', hat: '#2fc4b2', scratch: '#7b4fd0', cowbell: '#e8a21c', vocal: '#ff5fb0', orb: '#ff5fb0' };

// ---------------------------------------------------------------------------------------------------- selected-turret panel
export function drawPanel(b, ctx, tu) {
  DH.setHudTime(b.t);
  const run = b.run, def = TURRETS[tu.type];
  const top = tu.y > BOARD_Y + BOARD_H / 2;
  const box = { x: 16, y: top ? BOARD_Y + 6 : BOARD_Y + BOARD_H - 92, w: 508, h: 86 };
  ctx.save();
  DH.glass(ctx, box.x, box.y, box.w, box.h, 16, { edge: def.color });
  AE.drawTurretIconFlat(ctx, tu.type, box.x + 40, box.y + 43, 56);
  DH.text(ctx, def.name, box.x + 80, box.y + 24, 20, INK, 'left');
  for (let i = 0; i < MAX_LEVEL; i++) {   // level pips: inked dots
    ctx.beginPath(); ctx.arc(box.x + 300 + i * 13, box.y + 24, 4.6, 0, TAU);
    ctx.fillStyle = i < tu.level ? (tu.level >= 7 ? C.gold : def.color) : 'rgba(43,39,51,0.14)'; ctx.fill(); ctx.lineWidth = 1.8; ctx.strokeStyle = INK; ctx.stroke();
  }
  let line;
  if (def.kind === 'aura_rate') line = '+' + Math.round(def.aura * (1 + 0.2 * (tu.level - 1)) * 100 * (tu.level >= 7 ? 1.5 : 1)) + '% neighbour fire rate';
  else if (def.kind === 'aura_dmg') line = '+' + Math.round(def.aura * (1 + 0.2 * (tu.level - 1)) * 100 * (tu.level >= 7 ? 1.5 : 1)) + '% neighbour damage';
  else line = 'DMG ' + fmt(run.turretDmg(tu)) + '   RATE ' + run.turretRate(tu).toFixed(1) + '/s';
  DH.text(ctx, line, box.x + 80, box.y + 48, 15, DIM, 'left');
  const perk = Object.keys(def.perks).map(Number).filter((k) => k > tu.level).sort((a, c) => a - c)[0];
  DH.text(ctx, perk ? 'Lv ' + perk + ': ' + def.perks[perk] : 'Fully upgraded', box.x + 80, box.y + 70, 13, '#b8780a', 'left');
  const mode = { x: box.x + box.w - 214, y: box.y + 14, w: 112, h: 58 };
  const sell = { x: box.x + box.w - 94, y: box.y + 14, w: 84, h: 58 };
  const isAttacker = def.kind !== 'aura_rate' && def.kind !== 'aura_dmg';
  if (isAttacker) DH.button(ctx, mode, '#b9a6f0', { label: { first: 'First', last: 'Last', strong: 'Strongest', close: 'Closest' }[tu.mode], sub: 'TARGET', size: 15 });
  DH.button(ctx, sell, C.red, { label: '+' + Math.floor(tu.paid * Math.min(0.95, ECON.sellBack + run.mods.sell)), sub: 'SELL', size: 17 });
  b.panel = { box, mode: isAttacker ? mode : { x: -99, y: -99, w: 0, h: 0 }, sell };
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------------- HUD
// the top and bottom bars sit on translucent paper bands with a crayon rule in the stage colour (baked once per accent)
function band(ctx, key, y, h, accent, ruleAtBottom, t) {
  const e = K.sprite('db:band:' + key + ':' + accent, W, h, (pen, c) => {
    c.globalAlpha = 0.82; c.fillStyle = C.paper; c.fillRect(-W / 2, -h / 2, W, h); c.globalAlpha = 1;
    const ry = ruleAtBottom ? h / 2 - 3 : -h / 2 + 3, pts = []; for (let x = -W / 2 - 10; x <= W / 2 + 10; x += 30) pts.push(x, ry + pen.rr(-1.2, 1.2));
    pen.ln(pts, INK, 3, false, 0.8); pen.ln(pts.map((v, i) => (i % 2 ? v + 3.5 : v)), accent || C.blue, 2.4, false, 0.8);
  }, { seed: 3 });
  K.blit(ctx, e, W / 2, y + h / 2, t);
}
export function drawHud(b, ctx, t, beat) {
  DH.setHudTime(t);
  const run = b.run;
  const accent = b.world.accent;
  band(ctx, 'top', 0, 118, accent, true, t);
  band(ctx, 'bot', 838, H - 838, accent, false, t);
  // pause
  DH.button(ctx, R.pause, C.purple, { icon: 'pause', glyph: AE.drawGlyph, press: b.pressK('pause') });
  // stage health: heart socket + scribble bar with a ghost showing the damage taken
  const hp = R.hp, f = run.stageFrac;
  if (b.hpLag == null || b.hpLag < f) b.hpLag = f; else b.hpLag += (f - b.hpLag) * 0.06;
  DH.glass(ctx, hp.x, hp.y, hp.w, hp.h, 14, { edge: f < 0.3 ? C.red : C.blue, glow: f < 0.3 ? C.red : null, glowA: 0.5 + 0.3 * Math.sin(t * 9) });
  const bw = hp.w - 62;
  const hcol = f > 0.5 ? [C.green, '#8fe07a'] : f > 0.25 ? ['#e8a21c', C.yellow] : [C.red, '#ff8a7a'];
  DH.liquidBar(ctx, hp.x + 52, hp.y + 11, bw, 22, f, hcol[0], hcol[1], t, { lag: b.hpLag });
  ctx.save();
  const hs = 1 + (f < 0.3 ? 0.14 * Math.max(0, Math.sin(t * 9)) : 0) + b.hurtFlash * 0.25;
  ctx.translate(hp.x + 26, hp.y + 22); ctx.scale(hs, hs);
  AE.drawGlyph(ctx, 'heart', 0, 0, 30, COL.red);
  ctx.restore();
  DH.text(ctx, run.stageHp + '/' + run.stageMax, hp.x + 52 + bw / 2, hp.y + 23, 15, '#fff', 'center');
  // wave
  const w = R.wave;
  DH.glass(ctx, w.x, w.y, w.w, w.h, 14, { edge: C.blue });
  DH.text(ctx, run.endless ? 'WAVE ' + Math.max(1, run.wave) : 'WAVE ' + Math.max(1, run.wave) + '/' + run.wavesTotal, w.x + w.w / 2, w.y + 16, 19, INK, 'center');
  if (run.wmId) { const m = WAVE_MODS[run.wmId]; DH.text(ctx, m.name, w.x + w.w / 2, w.y + 37, 14, m.good ? C.green : C.orange, 'center'); }
  else if (run.phase === 'prep' && (run.endless || run.wave < run.wavesTotal)) {
    const spec = run.upcoming();
    const types = [...new Set(spec.groups.map((gr) => gr.type))].slice(0, 3);
    const n = types.length + (spec.boss ? 1 : 0) + (spec.mod ? 1 : 0);
    let x = w.x + w.w / 2 - (n - 1) * 13;
    DH.text(ctx, 'NEXT', w.x + 12, w.y + 37, 10, DIM, 'left');
    for (const ty of types) { AE.drawEnemy(ctx, ty, x + 8, w.y + 36, { t, scale: 0.62, hp: 1 }); x += 26; }
    if (spec.boss) { AE.drawGlyph(ctx, 'crown', x + 8, w.y + 36, 22, C.red); x += 26; }
    if (spec.mod) AE.drawGlyph(ctx, WAVE_MODS[spec.mod].glyph, x + 8, w.y + 36, 20, WAVE_MODS[spec.mod].good ? C.green : C.orange);
  } else DH.text(ctx, run.world.name, w.x + w.w / 2, w.y + 37, 13, DIM, 'center');
  // coins: the number pops when it changes
  const c = R.coins;
  if (b._coinLast == null) b._coinLast = run.coins;
  if (run.coins !== b._coinLast) { b.coinPop = run.coins > b._coinLast ? 1 : 0.5; b._coinLast = run.coins; }
  b.coinPop = Math.max(0, (b.coinPop || 0) - 0.06);
  DH.glass(ctx, c.x, c.y, c.w, c.h, 14, { edge: C.gold });
  ctx.save(); ctx.translate(c.x + 24, c.y + 22); const cs = 1 + b.coinPop * 0.25; ctx.scale(cs, cs);
  AE.drawGlyph(ctx, 'coin', 0, 0, 30); ctx.restore();
  ctx.save(); ctx.translate(c.x + 46, c.y + 23); const ts2 = 1 + b.coinPop * 0.18; ctx.scale(ts2, ts2); DH.text(ctx, fmt(run.coins), 0, 0, 24, '#e8a21c', 'left', 900); ctx.restore();
  // hype
  const h = R.hype, hf = clamp(run.hype / run.hypeNeed, 0, 1);
  DH.glass(ctx, h.x, h.y, h.w, h.h, 14, { edge: hf > 0.85 ? C.gold : C.blue, glow: hf > 0.85 ? C.gold : null, glowA: 0.5 + 0.3 * Math.sin(t * 8) });
  DH.liquidBar(ctx, h.x + 58, h.y + 10, h.w - 66, 20, hf, C.pink, C.gold, t, {});
  DH.bezel(ctx, h.x + 27, h.y + 20, 17, C.gold);
  DH.text(ctx, run.level + '', h.x + 27, h.y + 21, 16, INK, 'center');
  DH.text(ctx, 'HYPE', h.x + 58 + (h.w - 66) / 2, h.y + 20, 12, '#fff', 'center');
  // combo
  if (b.comboShow > 0.01) {
    ctx.save(); ctx.globalAlpha = b.comboShow;
    const big = run.combo >= 25, cs2 = 1 + Math.max(0, 1 - (t - (b.comboT || 0)) * 6) * 0.25;
    ctx.translate(R.hype.x + 10, R.hype.y + 56); ctx.scale(cs2, cs2);
    DH.text(ctx, run.combo + ' COMBO', 0, 0, big ? 18 : 15, big ? '#e8a21c' : C.blue, 'left', 900);
    ctx.restore();
  }
  if (run.combo !== b._comboLast) { b._comboLast = run.combo; b.comboT = t; }
  // speed
  DH.button(ctx, R.speed, C.sky, { label: b.speed + 'x', sub: 'SPEED', size: 20, press: b.pressK('speed') });
  // call wave
  const call = R.call;
  const prep = run.phase === 'prep', canCall = prep || (run.phase === 'wave' && !run.spawnQ.length);
  const left = prep ? Math.max(0, Math.ceil(run.prepT)) : 0;
  const lastWave = !run.endless && run.wave >= run.wavesTotal;
  const cp = b.pressK('call');
  if (lastWave && run.phase !== 'prep') DH.button(ctx, call, C.purple, { label: 'FINAL WAVE', size: 17, press: cp, glow: 0.4 + 0.3 * Math.sin(t * 6), glowColor: C.pink });
  else if (prep) DH.button(ctx, call, C.green, { label: run.wave === 0 ? 'START WAVE 1' : 'NEXT WAVE', sub: run.prepT > 100 ? 'tap to begin' : left + 's  +' + Math.round(Math.min(ECON.prepSeconds, run.prepT) * ECON.earlyBonusPerSec) + ' coins', size: 17, press: cp, glow: 0.25 + 0.25 * Math.sin(t * 6), glowColor: C.lime });
  else if (canCall) DH.button(ctx, call, C.blue, { label: 'CALL NEXT', sub: 'bonus coins', size: 17, press: cp });
  else DH.button(ctx, call, '#b9b3c8', { label: run.enemies.length + ' left', sub: 'fighting', size: 17, dim: true, press: cp });
  // boss bar: a taped nameplate over a scribble bar with a ghost
  const boss = run.enemies.find((e) => e.boss);
  if (boss) {
    const bx = 52, by = 112, bw2 = 436, bf = clamp(boss.hp / boss.maxHp, 0, 1);
    if (b.bossLag == null || b.bossLag < bf) b.bossLag = bf; else b.bossLag += (bf - b.bossLag) * 0.05;
    DH.glass(ctx, bx - 8, by - 6, bw2 + 16, 30, 12, { edge: C.red, glow: C.red, glowA: 0.35 });
    DH.liquidBar(ctx, bx, by, bw2, 18, bf, boss.gated ? '#e0a21c' : C.red, boss.gated ? C.yellow : '#ff8a7a', t, { lag: b.bossLag, ticks: boss.type === 'playback' ? [0.33, 0.66] : null });
    DH.text(ctx, BOSSES[boss.type].name.toUpperCase(), W / 2, by + 10, 13, '#fff', 'center');
  } else b.bossLag = null;
  // bottom bar
  b.drawHero(ctx, 'roxor', R.heroR, t);
  b.drawHero(ctx, 'jasmin', R.heroJ, t);
  const locked = !b.prof.autoMerge;
  DH.button(ctx, R.merge, locked ? '#b9b3c8' : C.green, { icon: locked ? 'lock' : 'merge', glyph: AE.drawGlyph, sub: 'MERGE', size: 13, press: b.pressK('merge'), dim: locked });
  DH.button(ctx, R.reroll, C.sky, { icon: 'reroll', glyph: AE.drawGlyph, sub: run.rerolls > 0 ? run.rerolls + ' free' : '3 gems', size: 13, press: b.pressK('reroll') });
  b.drawDeploy(ctx, t, beat);
  const slotsLeft = run.slotCapacity() - run.turrets.length;
  DH.text(ctx, run.turrets.length + '/' + run.slotCapacity() + ' tiles', W / 2, 833, 13, slotsLeft < 3 ? '#d4620a' : DIM, 'center');
}

export function drawDeploy(b, ctx, t, beat) {
  DH.setHudTime(t);
  const run = b.run, d = R.deploy;
  const cost = run.deployCost(false), can = run.coins >= cost && run.canDeploy().ok;
  const ph = b.beatPhase, nextDef = TURRETS[run.nextType];
  const near = b.prof.settings.beat && Math.min(ph, 1 - ph) * (60 / run.bpm) <= ECON.beatWindow;
  const pk = b.pressK('deploy');
  const sc = 1 + 0.035 * beat + Math.max(0, b.deployPulse) * 0.06 - pk * 0.04;
  ctx.save();
  ctx.translate(d.x + d.w / 2, d.y + d.h / 2); ctx.scale(sc, sc); ctx.translate(-(d.x + d.w / 2), -(d.y + d.h / 2));
  // the beat halo: a dashed crayon outline closing in on the button, solid green when the beat lands
  if (b.prof.settings.beat) {
    const grow = 1 + (1 - ph) * 0.2;
    ctx.save(); ctx.translate(d.x + d.w / 2, d.y + d.h / 2);
    rrectStroke(ctx, -d.w / 2 * grow, -d.h / 2 * grow, d.w * grow, d.h * grow, 28, INK, near ? 9 : 5, near ? 0.9 : 0.25 + 0.4 * ph, near ? null : [10, 8], t * 20);
    rrectStroke(ctx, -d.w / 2 * grow, -d.h / 2 * grow, d.w * grow, d.h * grow, 28, near ? C.lime : C.sky, near ? 5 : 3, near ? 1 : 0.3 + 0.6 * ph, near ? null : [10, 8], t * 20);
    ctx.restore();
  }
  DH.button(ctx, d, can ? C.pink : '#b9b3c8', { radius: 22, press: pk, glow: can ? 0.2 + 0.2 * beat : 0, glowColor: C.lime });
  // equalizer in the corner, bouncing to the beat
  ctx.save(); ctx.globalAlpha = can ? 0.7 : 0.35; ctx.fillStyle = '#fff';
  for (let i = 0; i < 5; i++) { const hh2 = 6 + 12 * (0.5 + 0.5 * Math.sin(t * (5 + i * 1.3) + i)) * (0.5 + beat * 0.7); DH.rrect(ctx, d.x + d.w - 38 + i * 6, d.y + 28 - hh2, 4, hh2, 2); ctx.fill(); }
  ctx.restore();
  // socket with the next turret: a paper disc with an inked rim
  ctx.beginPath(); ctx.arc(d.x + 44, d.y + d.h / 2 - 4, 31, 0, TAU); ctx.fillStyle = C.paper; ctx.fill();
  ring(ctx, d.x + 44, d.y + d.h / 2 - 4, 31, nextDef.color, 3.5, t, { seed: 11 });
  AE.drawTurretIconFlat(ctx, run.nextType, d.x + 44, d.y + d.h / 2 - 4, 54);
  DH.text(ctx, 'DROP', d.x + 90, d.y + 28, 27, '#fff', 'left', 900);
  DH.text(ctx, nextDef.name, d.x + 90, d.y + 50, 13, '#fff', 'left');
  if (run.mods.freeDeploys > 0) DH.text(ctx, 'FREE x' + run.mods.freeDeploys, d.x + 90, d.y + 71, 17, C.lime, 'left');
  else { AE.drawGlyph(ctx, 'coin', d.x + 100, d.y + 70, 20); DH.text(ctx, fmt(cost), d.x + 114, d.y + 71, 20, can ? C.yellow : '#ffd0d0', 'left'); }
  if (b.targetSlot != null) DH.text(ctx, 'to chosen tile', d.x + d.w - 10, d.y + 71, 12, '#fff', 'right');
  ctx.restore();
}

export function drawHero(b, ctx, who, c, t) {
  DH.setHudTime(t);
  const run = b.run, name = who === 'roxor' ? 'heroR' : 'heroJ';
  const ready = run.heroReady(who), max = run.heroMax(who), cd = run.heroCd[who];
  const col = who === 'roxor' ? C.green : C.pink;
  b._ready = b._ready || {};
  if (ready && b._ready[who] === false) b.readyFlash = Object.assign(b.readyFlash || {}, { [who]: t });
  b._ready[who] = ready;
  const rf = b.readyFlash && b.readyFlash[who] != null ? Math.max(0, 1 - (t - b.readyFlash[who]) * 2.2) : 0;
  const pk = b.pressK(name), pulse = ready ? 0.5 + 0.5 * Math.sin(t * 6) : 0;
  ctx.save();
  const sc = 1 - pk * 0.06 + rf * 0.08;
  ctx.translate(c.x, c.y); ctx.scale(sc, sc); ctx.translate(-c.x, -c.y);
  DH.bezel(ctx, c.x, c.y, c.r, ready ? col : '#b9b3c8');
  ctx.save(); ctx.beginPath(); ctx.arc(c.x, c.y, c.r - 6, 0, TAU); ctx.clip();
  ctx.fillStyle = ready ? K.C.paper : '#e6e1ef'; ctx.fillRect(c.x - c.r, c.y - c.r, c.r * 2, c.r * 2);
  ctx.globalAlpha = ready ? 1 : 0.55;
  AW.drawBust(ctx, who, c.x, c.y + 8, c.r * 2.1, { t, outfit: b.prof.outfits.worn[who], pose: ready ? 'hype' : 'idle' });
  ctx.globalAlpha = 1;
  if (!ready) {   // cooldown: a flat graphite wedge sweeping round
    const a0 = -Math.PI / 2, a1 = a0 + TAU * (cd / max);
    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.arc(c.x, c.y, c.r, a0, a1, false); ctx.closePath(); ctx.fillStyle = 'rgba(43,39,51,0.45)'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x + Math.cos(a1) * c.r, c.y + Math.sin(a1) * c.r); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
  }
  ctx.restore();
  if (!ready) DH.text(ctx, Math.ceil(cd) + '', c.x, c.y, 26, '#fff', 'center');
  if (ready) ring(ctx, c.x, c.y, c.r + 6 + pulse * 3, col, 4, t, { dash: [10, 8], march: t * 26, alpha: 0.6 + pulse * 0.4, seed: who === 'roxor' ? 2 : 4 });
  ctx.restore();
  const lab = who === 'roxor' ? 'BLAST' : 'SONG';
  DH.text(ctx, ready ? lab : lab[0] + lab.slice(1).toLowerCase(), c.x, c.y + c.r + 12, 12, ready ? (who === 'roxor' ? '#2a8a30' : '#d6358a') : DIM, 'center');
}

// ---------------------------------------------------------------------------------------------------- banner: a taped paper strip
export function drawBanner(b, ctx) {
  const bn = b.banner; if (!bn) return;
  DH.setHudTime(b.t);
  const inK = clamp(bn.t / 0.28, 0, 1), outK = clamp((bn.life - bn.t) / 0.3, 0, 1);
  const a = Math.min(inK, outK), k = bn.t / bn.life;
  const y = bn.small ? 300 : 380;
  const sc = 0.6 + 0.4 * easeOutBack(inK) + (bn.boss ? Math.sin(bn.t * 30) * 0.004 * (1 - k) : 0);
  ctx.save();
  ctx.globalAlpha = a; ctx.translate(W / 2, y); ctx.scale(sc, sc); ctx.rotate(bn.small ? 0 : -0.018);
  if (!bn.small) {
    const bh = bn.sub ? 112 : 80;
    DH.glass(ctx, -250, -52, 500, bh, 22, { edge: bn.boss ? C.red : bn.color });
    if (bn.boss) {   // red hazard ticks along the top edge
      ctx.globalAlpha = a * 0.55; ctx.strokeStyle = C.red; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath();
      const off = (bn.t * 40) % 40; for (let x = -230 + off; x < 230; x += 40) { ctx.moveTo(x, -44); ctx.lineTo(x + 14, -38); }
      ctx.stroke(); ctx.globalAlpha = a;
    }
  }
  DH.text(ctx, bn.text, 0, bn.small ? 0 : -14, bn.small ? 38 : (bn.text.length > 20 ? 28 : 40), bn.color, 'center', 900);
  if (bn.sub && !bn.small) DH.wrapText(ctx, bn.sub, 0, 28, 460, 16, 20, INK, 'center');
  else if (bn.sub) DH.text(ctx, bn.sub, 0, 36, 16, '#fff', 'center');
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------------- tutorial: a dimmed page with a crayon-circled spot and a paper speech bubble
export function drawTutorial(b, ctx) {
  const spot = b.tutSpot();
  const s = TUTORIAL[b.tut.i];
  if (!s) return;
  DH.setHudTime(b.t);
  ctx.save();
  if (spot && !s.free) {
    ctx.fillStyle = 'rgba(43,39,51,0.62)';
    ctx.beginPath(); ctx.rect(0, 0, W, H);
    if (spot.round) { ctx.moveTo(spot.x + spot.w, spot.y + spot.h / 2); ctx.arc(spot.x + spot.w / 2, spot.y + spot.h / 2, spot.w / 2, 0, TAU, true); }
    else DH.rrectPath(ctx, spot.x, spot.y, spot.w, spot.h, 16, true);
    ctx.fill('evenodd');
  } else if (!s.free) { ctx.fillStyle = 'rgba(43,39,51,0.5)'; ctx.fillRect(0, 0, W, H); }
  if (spot) {
    const k = 0.5 + 0.5 * Math.sin(b.t * 6);
    if (spot.round) ring(ctx, spot.x + spot.w / 2, spot.y + spot.h / 2, spot.w / 2 + 3, C.yellow, 5 + k * 2, b.t, { dash: [16, 9], march: b.t * 30, seed: 5 });
    else {
      rrectStroke(ctx, spot.x, spot.y, spot.w, spot.h, 16, INK, 10 + k * 2, 0.9, null);
      rrectStroke(ctx, spot.x, spot.y, spot.w, spot.h, 16, C.yellow, 5 + k * 2, 1, [16, 9], b.t * 30);
    }
  }
  // Loopy and a paper speech bubble with a tail, bobbing a little
  const atTop = spot && spot.y > 400 ? true : (spot ? spot.y < 400 ? false : true : false);
  const bob = Math.sin(b.t * 2.2) * 3;
  const by = (atTop ? 140 : 560) + bob, bw = 470, bh = 150, bx = 60;
  DH.glass(ctx, bx - 30, by, bw, bh, 22, { edge: C.yellow });
  ctx.beginPath(); ctx.moveTo(bx - 8, by + bh - 6); ctx.lineTo(bx - 38, by + bh + 28); ctx.lineTo(bx + 24, by + bh - 6); ctx.closePath();
  ctx.fillStyle = K.C.paper; ctx.fill(); ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bx - 4, by + bh - 7); ctx.lineTo(bx + 20, by + bh - 7); ctx.strokeStyle = K.C.paper; ctx.lineWidth = 6; ctx.stroke();
  AW.drawLoopy(ctx, 50, by + bh - 20, 78, { t: b.t, mood: 'happy', talk: b.tut.t < 2.5 });
  DH.wrapText(ctx, b.tutBubble ? b.tutBubble.text : '', bx + 70, by + 32, bw - 100, 20, 24, INK, 'left');
  if (s.wait === 'tap') { const k2 = 0.5 + 0.5 * Math.sin(b.t * 5); ctx.globalAlpha = 0.6 + 0.4 * k2; DH.text(ctx, 'tap to continue', bx - 30 + bw - 20, by + bh - 16, 14, C.purple, 'right'); }
  ctx.restore();
}
