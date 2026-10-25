// FORGE screen (run.phase === 'forge', run.pending = {kind:'forge', used, last}).
// Five big options; the player picks one (two with perk 'forgeExtra'), watches the animation, then continues.
import { COL, EASE, rgba, clamp, lerp } from './core.js';
import { Fx } from './fx.js';
import { drawBackground } from '../art/backgrounds.js';
import { drawCard, CARD_W, CARD_H } from '../art/cards.js';
import { drawHeart, drawCoin } from '../art/icons.js';
import * as RUN from '../engine/run.js';
import { cardSpec, canGraft, strainInfo } from '../engine/cards.js';
import { CARDS, GRAFTS } from '../data/index.js';
import { drawGauge, gaugeLabel, drawModal, openCards, openGraftChoice, makeAnim, updateAnim, drawAnim, infoFromDeck, stripDeck, toastDraw, cardName } from './shop.js';

const BRASS = '#C9A227';
const sfx = (app, name, o) => { const a = app.shared && app.shared.audio; if (a && a.sfx) a.sfx(name, o); };
let S = null;

const OPTS = [
  { id: 'rest', name: 'Rest', desc: 'Lie down by the coals. Heal 30% of your max HP.' },
  { id: 'expand', name: 'Expand', desc: 'Let out the seams. +1 Budget for the rest of the run.' },
  { id: 'refine', name: 'Refine', desc: 'Hammer one card into its upgraded form.' },
  { id: 'strip', name: 'Strip', desc: 'Pull one graft off a card. The card stays, the boon is lost, the price goes too.' },
  { id: 'reforge', name: 'Reforge', desc: 'Lift a graft off one card and stitch it onto another.' },
];
const OW = 214, OH = 350, OGAP = 22, OX0 = (1280 - (5 * OW + 4 * OGAP)) / 2, OY = 140;

const allowed = (run) => 1 + RUN.perkN(run, 'forgeExtra');
const upgradable = (run) => run.deck.filter((i) => !i.up && CARDS[i.id].up && CARDS[i.id].type !== 'junk');
const grafted = (run) => run.deck.filter((i) => i.grafts.length);
const movable = (inst, run) => inst.grafts.some((gid) => run.deck.some((d) => d !== inst && canGraft(d, gid)));
const reforgeSources = (run) => grafted(run).filter((i) => movable(i, run));

function reasonFor(run, id) {
  if (id === 'refine' && !upgradable(run).length) return 'Every card here is already refined.';
  if (id === 'strip' && !grafted(run).length) return 'No card carries a graft.';
  if (id === 'reforge') {
    if (!grafted(run).length) return 'No card carries a graft.';
    if (!reforgeSources(run).length) return 'No graft can move to another card.';
  }
  return null;
}
function detailFor(run, id) {
  if (id === 'rest') { const h = RUN.forgeHeal(run), to = Math.min(run.maxHp, run.hp + h); return { t: `HP ${run.hp} to ${to}  (+${to - run.hp})`, c: COL.good }; }
  if (id === 'expand') { const i = strainInfo(run); return { t: `Budget ${i.budget} to ${i.budget + 1}`, c: COL.lamp }; }
  if (id === 'refine') return { t: `${upgradable(run).length} cards can be refined`, c: COL.vellum };
  if (id === 'strip') return { t: `${grafted(run).length} cards carry grafts`, c: COL.vellum };
  return { t: `${reforgeSources(run).length} cards can give a graft`, c: COL.vellum };
}

// ---- option icons (procedural) ------------------------------------------------------------------------------------------
function drawOptIcon(g, id, cx, cy, k, t) {
  g.save(); g.translate(cx, cy); g.lineCap = 'round'; g.lineJoin = 'round';
  if (id === 'rest') {
    const fl = 1 + Math.sin(t * 8) * 0.05 + k * 0.1;
    const gl = g.createRadialGradient(0, 0, 4, 0, 0, 90); gl.addColorStop(0, `rgba(255,170,60,${0.45 + k * 0.3})`); gl.addColorStop(1, 'rgba(255,120,30,0)'); g.fillStyle = gl; g.fillRect(-90, -90, 180, 180);
    g.scale(fl, fl); const fg = g.createLinearGradient(0, -50, 0, 40); fg.addColorStop(0, '#ffe08a'); fg.addColorStop(0.5, '#ff9a3c'); fg.addColorStop(1, '#c0391b');
    g.fillStyle = fg; g.beginPath(); g.moveTo(0, -52); g.bezierCurveTo(30, -22, 34, 4, 26, 24); g.bezierCurveTo(20, 40, -20, 40, -26, 24); g.bezierCurveTo(-34, 4, -16, -14, 0, -52); g.fill();
    g.fillStyle = 'rgba(255,240,180,.85)'; g.beginPath(); g.moveTo(0, -10); g.bezierCurveTo(14, 6, 14, 24, 0, 30); g.bezierCurveTo(-14, 24, -12, 6, 0, -10); g.fill();
    g.strokeStyle = '#3a2418'; g.lineWidth = 9; g.beginPath(); g.moveTo(-40, 40); g.lineTo(40, 28); g.moveTo(-40, 28); g.lineTo(40, 40); g.stroke();
  } else if (id === 'expand') {
    for (let i = 0; i < 3; i++) { const x = -56 + i * 42, filled = i < 2; g.fillStyle = filled ? '#c9a227' : 'rgba(0,0,0,.4)'; g.strokeStyle = BRASS; g.lineWidth = 3; g.beginPath(); g.roundRect(x, -16, 34, 38, 5); g.fill(); g.stroke(); }
    g.strokeStyle = COL.lamp; g.lineWidth = 5; const o = Math.sin(t * 4) * 3 * k; g.beginPath(); g.moveTo(46, -50 + o); g.lineTo(46, -28 + o); g.moveTo(35, -39 + o); g.lineTo(57, -39 + o); g.stroke();
  } else if (id === 'refine') {
    g.fillStyle = '#2b2b30'; g.beginPath(); g.moveTo(-50, 34); g.lineTo(50, 34); g.lineTo(38, 18); g.lineTo(54, 6); g.lineTo(54, -8); g.lineTo(-30, -8); g.lineTo(-52, 10); g.lineTo(-30, 14); g.closePath(); g.fill(); g.strokeStyle = '#6a6a72'; g.lineWidth = 2; g.stroke();
    g.save(); g.translate(-10, -14); g.rotate(-0.9 + Math.sin(t * 5) * 0.25 * k); g.fillStyle = '#7a5a3a'; g.fillRect(-4, -52, 8, 56); g.fillStyle = '#9aa3a8'; g.fillRect(-18, -66, 36, 18); g.restore();
  } else if (id === 'strip') {
    g.strokeStyle = '#d8dde0'; g.lineWidth = 4; g.beginPath(); g.moveTo(-36, 40); g.lineTo(34, -44); g.stroke(); g.lineWidth = 2; g.beginPath(); g.arc(37, -48, 5, 0, 6.28); g.stroke();
    g.strokeStyle = COL.scar; g.lineWidth = 3; g.beginPath(); g.moveTo(37, -44);
    for (let i = 1; i <= 14; i++) g.lineTo(37 - i * 5 + Math.sin(i * 0.9 + t * 4 * k) * 8, -44 + i * 6.5); g.stroke();
  } else if (id === 'reforge') {
    const c1 = '#7FD1E0', c2 = '#F2C14E';
    g.fillStyle = c1; g.fillRect(-62, -26, 46, 54); g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(-62, -26, 46, 54);
    g.strokeStyle = 'rgba(232,220,196,.8)'; g.lineWidth = 2.5; g.strokeRect(-62, -26, 46, 54); g.strokeRect(16, -26, 46, 54);
    g.fillStyle = c2; g.fillRect(-52, -8, 26, 18);
    const o = Math.sin(t * 4) * 4 * k; g.strokeStyle = COL.lamp; g.lineWidth = 5; g.beginPath(); g.moveTo(-8 + o, 0); g.lineTo(8 + o, 0); g.moveTo(2 + o, -8); g.lineTo(10 + o, 0); g.lineTo(2 + o, 8); g.stroke();
    g.setLineDash([4, 4]); g.strokeStyle = 'rgba(232,220,196,.6)'; g.strokeRect(24, -2, 30, 22); g.setLineDash([]);
  }
  g.restore();
}

function drawOptionCard(app, run, i, o, over, k, disabledWhy, usedUp, shk) {
  const g = app.ctx, x = OX0 + i * (OW + OGAP) + shk, y = OY - 10 * k;
  const dim = !!disabledWhy || usedUp;
  g.save(); if (k > 0.02 && !dim) { g.shadowColor = 'rgba(255,140,50,.6)'; g.shadowBlur = 28 * k; }
  app.rr(x, y, OW, OH, 14);
  const gr = g.createLinearGradient(0, y, 0, y + OH); gr.addColorStop(0, dim ? '#26211e' : '#3d2a1e'); gr.addColorStop(1, dim ? '#161311' : '#1e1410'); g.fillStyle = gr; g.fill();
  g.shadowBlur = 0; g.lineWidth = over && !dim ? 3 : 2; g.strokeStyle = dim ? 'rgba(232,220,196,.2)' : over ? COL.lamp : rgba(BRASS, 0.7); g.stroke();
  g.save(); app.rr(x + 8, y + 8, OW - 16, OH - 16, 10); g.lineWidth = 1; g.strokeStyle = dim ? 'rgba(232,220,196,.1)' : 'rgba(201,162,39,.3)'; g.setLineDash([5, 4]); g.stroke(); g.restore();
  g.globalAlpha = dim ? 0.4 : 1; drawOptIcon(g, o.id, x + OW / 2, y + 88, k, app.t); g.globalAlpha = 1;
  app.text(o.name, x + OW / 2, y + 150, { size: 30, bold: true, align: 'center', color: dim ? 'rgba(232,220,196,.4)' : COL.lamp, shadow: !dim });
  app.text(o.desc, x + OW / 2, y + 196, { size: 15, ui: true, align: 'center', maxW: OW - 34, lineH: 19, color: dim ? 'rgba(232,220,196,.35)' : COL.vellum });
  if (disabledWhy) app.text(disabledWhy, x + OW / 2, y + OH - 64, { size: 14, ui: true, align: 'center', maxW: OW - 30, lineH: 17, color: COL.bad, bold: true });
  else if (!usedUp) { const d = detailFor(run, o.id); app.text(d.t, x + OW / 2, y + OH - 46, { size: 15, ui: true, bold: true, align: 'center', maxW: OW - 24, color: d.c }); }
  g.restore();
}

// ---- forge-specific animations ---------------------------------------------------------------------------------------
function startRest(app) {
  const run = app.shared.run, from = run.hp, h = RUN.forgeHeal(run);
  const r = RUN.forgeAct(run, 'rest'); if (!r.ok) return fail(app);
  S.anim = { kind: 'rest', t: 0, dur: 2.6, from, to: run.hp, max: run.maxHp, healed: run.hp - from };
  S.log.push(`Rested: HP ${from} to ${run.hp}.`); void h;
  sfx(app, 'restHeal');
}
function startExpand(app) {
  const run = app.shared.run, before = strainInfo(run);
  const r = RUN.forgeAct(run, 'expand'); if (!r.ok) return fail(app);
  S.anim = { kind: 'expand', t: 0, dur: 2.2, before, after: strainInfo(run), clunk: false };
  S.log.push(`Expanded: Budget ${before.budget} to ${before.budget + 1}.`);
}
function startRefine(app, inst) {
  const run = app.shared.run, before = cardSpec(inst), uid = inst.uid;
  const r = RUN.forgeAct(run, 'refine', uid); if (!r.ok) return fail(app);
  S.anim = { kind: 'refine', t: 0, dur: 2.6, before, after: cardSpec(inst), struck: false };
  S.log.push(`Refined: ${before.name} is now ${cardSpec(inst).name}.`);
}
function fail(app) { sfx(app, 'error'); S.toast = 'The forge refuses.'; S.toastT = 1.6; S.fx.shake(0.3); }

function pickRefine(app) {
  const run = app.shared.run;
  openCards(S.modal, {
    title: 'Refine which card?', sub: 'Pick a card to upgrade. Hover to compare before and after.', cards: upgradable(run),
    compare: (inst) => cardSpec({ ...inst, up: 1 }),
    info: (inst) => { const i = strainInfo(run); return { before: i, after: i, lines: [{ t: `${CARDS[inst.id].name} becomes ${CARDS[inst.id].name}+. Grafts stay as they are.`, c: COL.vellum }] }; },
    onPick: (inst) => startRefine(app, inst),
  });
}
function pickStrip(app) {
  const run = app.shared.run;
  openCards(S.modal, {
    title: 'Strip a graft from which card?', sub: 'The card stays. The boon is lost, and so is the price it carried.', cards: grafted(run),
    info: null, hint: 'Pick a card, then choose the graft to pull out.',
    onPick: (inst) => openGraftChoice(S.modal, {
      title: `Strip which graft from ${CARDS[inst.id].name}?`, inst,
      info: (gid) => infoFromDeck(run, stripDeck(run, inst.uid, gid), [{ t: `Loses: ${GRAFTS[gid].boon}`, c: COL.vellum }, { t: `Frees you of: ${GRAFTS[gid].price}`, c: COL.good }]),
      onPick: (gid) => {
        const before = cardSpec(inst);
        const info = infoFromDeck(run, stripDeck(run, inst.uid, gid));
        const r = RUN.forgeAct(run, 'strip', inst.uid, gid); if (!r.ok) return fail(app);
        S.anim = makeAnim('strip', { cx: 640, cy: 330, gid, specBefore: before, specAfter: cardSpec(inst), lines: info.lines });
        S.log.push(`Stripped ${GRAFTS[gid].name} from ${before.name}.`);
      },
    }),
  });
}
function moveDeck(run, from, gid, to) {
  return run.deck.map((i) => {
    if (i.uid === from.uid) { const k = i.grafts.indexOf(gid); return { ...i, grafts: i.grafts.filter((_, n) => n !== k) }; }
    if (i.uid === to.uid) return { ...i, grafts: [...i.grafts, gid] };
    return i;
  });
}
function pickReforge(app) {
  const run = app.shared.run;
  openCards(S.modal, {
    title: 'Reforge: take a graft from which card?', sub: 'Step 1 of 3. Pick the card that gives up a graft.', cards: grafted(run),
    reason: (inst) => (movable(inst, run) ? null : 'No graft on this card can move anywhere else.'),
    info: null, hint: 'Pick the source card, then the graft, then its new home.',
    onPick: (src) => openGraftChoice(S.modal, {
      title: `Which graft leaves ${CARDS[src.id].name}?`, inst: src,
      reason: (gid) => (run.deck.some((d) => d !== src && canGraft(d, gid)) ? null : 'No other card can take this graft.'),
      info: (gid) => infoFromDeck(run, stripDeck(run, src.uid, gid), [{ t: 'Step 2 of 3. Next you choose where it goes.', c: COL.vellum }]),
      onPick: (gid) => openCards(S.modal, {
        title: `Where does ${GRAFTS[gid].name} go?`, sub: 'Step 3 of 3. Only cards that can take it are shown.', cards: run.deck.filter((d) => d !== src && canGraft(d, gid)),
        info: (dst) => infoFromDeck(run, moveDeck(run, src, gid, dst), dst.grafts.length >= 2 ? [{ t: 'Overload: weighs +1, numbers x1.5, 25% Shatter on first play.', c: COL.lamp }] : []),
        onPick: (dst) => {
          const sb = cardSpec(src), db = cardSpec(dst), info = infoFromDeck(run, moveDeck(run, src, gid, dst));
          const r = RUN.forgeAct(run, 'reforge', src.uid, gid, dst.uid); if (!r.ok) return fail(app);
          S.anim = makeAnim('move', { gid, from: { x: 360, y: 330 }, to: { x: 920, y: 330 }, fromBefore: sb, fromAfter: cardSpec(src), toBefore: db, toAfter: cardSpec(dst), overload: dst.grafts.length > 2, tithe: info.after.strain > 0, lines: info.lines });
          S.log.push(`Reforged ${GRAFTS[gid].name} from ${sb.name} to ${db.name}.`);
        },
      }),
    }),
  });
}

function drawHammer(g, x, y, ang) {
  g.save(); g.translate(x, y); g.rotate(ang);
  g.fillStyle = '#6b4a2c'; g.fillRect(-7, -10, 14, 150);
  const mg = g.createLinearGradient(-50, 0, 50, 0); mg.addColorStop(0, '#8a9298'); mg.addColorStop(0.5, '#cfd6da'); mg.addColorStop(1, '#6a7278');
  g.fillStyle = mg; g.beginPath(); g.roundRect(-52, -52, 104, 48, 6); g.fill(); g.strokeStyle = '#2b2f33'; g.lineWidth = 3; g.stroke();
  g.restore();
}

function updateForgeAnim(app, a, dt) {
  if (['attach', 'strip', 'move', 'burn'].includes(a.kind)) return updateAnim(app, a, S.fx, dt);
  a.t += dt; const k = a.t / a.dur;
  if (a.kind === 'rest') { if (Math.random() < 0.7) S.fx.burst(640 + (Math.random() - 0.5) * 240, 520, 'ember', { n: 1 }); if (k > 0.3 && !a.healFx) { a.healFx = true; S.fx.burst(640, 360, 'heal', { n: 16 }); } }
  else if (a.kind === 'expand') { if (!a.clunk && k > 0.4) { a.clunk = true; sfx(app, 'graftScar'); S.fx.hitstop(40); S.fx.shake(0.3); S.fx.burst(640 + (a.after.budget - 1) * 30, 360, 'spark'); S.fx.flash(BRASS, 0.15, 0.2); } }
  else if (a.kind === 'refine') {
    if (!a.struck && k > 0.4) { a.struck = true; sfx(app, 'upgrade'); S.fx.hitstop(80); S.fx.shake(0.6); S.fx.burst(640, 330, 'spark', { n: 30, speed: 480 }); S.fx.burst(640, 330, 'ember', { n: 10 }); S.fx.flash('#ffb347', 0.35, 0.3); S.fx.ring(640, 330, '#ffb347', 220, 0.6); }
  }
  return a.t >= a.dur;
}
function drawForgeAnim(app, a) {
  const g = app.ctx, k = clamp(a.t / a.dur, 0, 1);
  if (['attach', 'strip', 'move', 'burn'].includes(a.kind)) return drawAnim(app, a, S.fx);
  g.save(); g.fillStyle = `rgba(8,4,2,${0.96 * clamp(k * 8, 0, 1) * (k > 0.94 ? (1 - k) / 0.06 : 1)})`; g.fillRect(0, 0, 1280, 720); g.restore();
  if (a.kind === 'rest') {
    const pulse = 0.7 + Math.sin(a.t * 6) * 0.1, fk = EASE.out(clamp((k - 0.2) / 0.5, 0, 1));
    const gl = g.createRadialGradient(640, 420, 10, 640, 420, 420); gl.addColorStop(0, `rgba(255,170,70,${0.5 * pulse})`); gl.addColorStop(1, 'rgba(255,120,30,0)'); g.fillStyle = gl; g.fillRect(0, 0, 1280, 720);
    drawOptIcon(g, 'rest', 640, 330, 1, app.t); // fire
    const hp = lerp(a.from, a.to, fk);
    app.text('Rest', 640, 100, { size: 40, bold: true, align: 'center', color: COL.lamp, shadow: true });
    drawHeart(g, 440, 520, 40);
    const bw = 360, bx = 470, by = 505;
    app.rr(bx, by, bw, 30, 8); g.fillStyle = 'rgba(0,0,0,.6)'; g.fill();
    g.save(); app.rr(bx, by, bw, 30, 8); g.clip(); g.fillStyle = COL.scar; g.fillRect(bx, by, bw * (a.from / a.max), 30); g.fillStyle = '#7fcf8a'; g.fillRect(bx, by, bw * (hp / a.max), 30); g.fillStyle = COL.scar; g.fillRect(bx, by, bw * (Math.min(hp, a.from) / a.max), 30); g.restore();
    app.rr(bx, by, bw, 30, 8); g.strokeStyle = 'rgba(232,220,196,.6)'; g.lineWidth = 2; g.stroke();
    app.text(`${Math.round(hp)} / ${a.max}`, 640, by + 3, { size: 22, bold: true, align: 'center', color: '#fff', shadow: true });
    if (a.healed) app.text(`+${a.healed}`, 860, 502, { size: 34, bold: true, color: COL.good, shadow: true, alpha: fk });
    app.text('The coals do the talking.', 640, 580, { size: 20, italic: true, align: 'center', color: 'rgba(232,220,196,.8)', alpha: fk });
  } else if (a.kind === 'expand') {
    const w = 560, x = 640 - w / 2;
    app.text('Expand', 640, 100, { size: 40, bold: true, align: 'center', color: COL.lamp, shadow: true });
    const slide = clamp(k / 0.4, 0, 1);
    const info = { ...a.after, budget: a.after.budget };
    drawGauge(app, x, 340, w, info, { h: 40, slide: { i: a.after.budget - 1, k: EASE.out(slide) } });
    app.text(`Budget ${Math.round(slide >= 1 ? a.after.budget : a.before.budget)}`, 640, 400, { size: 34, bold: true, align: 'center', color: COL.vellum, shadow: true });
    app.text(gaugeLabel(a.after), 640, 450, { size: 17, ui: true, align: 'center', color: a.after.strain ? COL.bad : 'rgba(232,220,196,.8)', alpha: slide });
    if (a.before.strain > a.after.strain) app.text('One Strain point eased.', 640, 480, { size: 17, ui: true, align: 'center', color: COL.good, alpha: slide });
  } else if (a.kind === 'refine') {
    const swing = clamp(k / 0.4, 0, 1), hit = k > 0.4;
    const ang = lerp(-1.2, 0.0, EASE.in(swing)) + (hit ? Math.max(0, 0.2 - (k - 0.4) * 1.2) : 0);
    app.text('Refine', 640, 70, { size: 40, bold: true, align: 'center', color: COL.lamp, shadow: true });
    // anvil
    g.fillStyle = '#25262a'; g.beginPath(); g.moveTo(420, 600); g.lineTo(860, 600); g.lineTo(800, 560); g.lineTo(880, 530); g.lineTo(880, 500); g.lineTo(400, 500); g.lineTo(350, 540); g.lineTo(420, 550); g.closePath(); g.fill();
    const flip = hit ? EASE.out(clamp((k - 0.45) / 0.3, 0, 1)) : 0;
    const spec = flip > 0.5 ? a.after : a.before, sx = Math.abs(Math.cos(flip * Math.PI)) * (flip > 0 && flip < 1 ? 1 : 1);
    g.save(); g.translate(640, 330); g.scale(flip > 0 && flip < 1 ? Math.max(0.05, sx) : 1, 1); drawCard(g, spec, 0, 0, { scale: 1.0, glow: hit ? 0.5 : 0 }); g.restore();
    if (!hit) drawHammer(g, 800, 220, ang * 0.9 + 0.4); else drawHammer(g, 800, 220 + Math.max(0, 40 - (k - 0.4) * 160), 0.4 - Math.min(0.9, (k - 0.4) * 1.4));
    if (k > 0.8) app.text(`${a.before.name} is now ${a.after.name}.`, 640, 665, { size: 22, italic: true, align: 'center', color: COL.vellum, shadow: true, alpha: clamp((k - 0.8) * 6, 0, 1) });
  }
}

export default {
  enter(app) { S = { fx: new Fx(), modal: { m: null }, h: {}, anim: null, toast: '', toastT: 0, log: [], t: 0, shakeI: -1, shakeT: 0 }; },

  update(app, dt) {
    if (!S) return; S.t += dt;
    S.shakeT = Math.max(0, S.shakeT - dt);
    const fdt = S.fx.update(dt);
    if (Math.random() < dt * 5) S.fx.emit({ x: 100 + Math.random() * 1080, y: 725, n: 1, colors: ['#ff6a2b', '#ffb347'], speed: 40, angle: -1.57, spread: 0.8, life: 3, size: 2.2, gravity: -30, glow: true, drag: 0.1 });
    if (S.anim) { if (updateForgeAnim(app, S.anim, fdt || 0) || (app.mouse.released && S.anim.t > 0.5)) S.anim = null; }
  },
  draw(app) {
    if (!S) return;
    const g = app.ctx, run = app.shared.run, flow = app.shared.flow, f = run.pending;
    if (!f || f.kind !== 'forge') return;
    const so = S.fx.shakeOffset();
    const locked = !!(S.modal.m || S.anim);
    g.save(); g.translate(so.x, so.y);
    drawBackground(g, 'forge', S.t);
    const gl = g.createRadialGradient(640, 760, 40, 640, 760, 700); gl.addColorStop(0, 'rgba(255,120,40,.35)'); gl.addColorStop(1, 'rgba(255,90,20,0)'); g.fillStyle = gl; g.fillRect(0, 0, 1280, 720);
    const vg = g.createRadialGradient(640, 360, 250, 640, 360, 800); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.5)'); g.fillStyle = vg; g.fillRect(0, 0, 1280, 720);
    app.blocked = locked || app.blocked;

    const max = allowed(run), left = max - f.used, info = strainInfo(run);
    // header
    app.text('The Forge', 40, 14, { size: 36, bold: true, color: COL.lamp, shadow: true });
    drawHeart(g, 330, 34, 30);
    app.text(`${run.hp} / ${run.maxHp}`, 352, 20, { size: 24, bold: true, color: COL.vellum, shadow: true });
    app.text('BUDGET', 520, 8, { size: 12, ui: true, bold: true, color: 'rgba(232,220,196,.7)' });
    drawGauge(app, 520, 26, 300, info);
    app.text(gaugeLabel(info), 520, 48, { size: 12, ui: true, color: info.strain ? COL.bad : 'rgba(232,220,196,.7)' });
    if (app.inRect(520, 4, 310, 60)) app.tooltip('Budget', `Total graft weight ${info.weight} against a Budget of ${info.budget}. Over it, each Strain point Tithes a Bare card (-25% numbers).` + (info.tithed.length ? `\nTithed now: ${info.tithed.map((u) => cardName(run, u)).join(', ')}.` : ''));
    if (app.inRect(320, 8, 160, 44)) app.tooltip('Health', `${run.hp} of ${run.maxHp} HP.`);
    if (app.button(`Deck (${run.deck.length})`, 1010, 10, 130, 44, { size: 18 })) flow.openDeck();
    app.panel(1152, 10, 112, 44, { fill: 'rgba(14,12,10,.9)', stroke: rgba(BRASS, 0.7) });
    drawCoin(g, 1174, 32, 24); app.text(String(run.gold), 1194, 17, { size: 24, bold: true, color: COL.gold, shadow: true });

    app.text(left > 0 ? (max > 1 ? `Choose ${left === max ? 'up to two' : 'one more'}. Your Forge Hammer allows ${max}.` : 'Choose one.') : 'The fire is banked. Time to go.', 640, 92, { size: 20, italic: true, align: 'center', color: 'rgba(232,220,196,.85)' });

    // options
    OPTS.forEach((o, i) => {
      const x = OX0 + i * (OW + OGAP), why = reasonFor(run, o.id), usedUp = left <= 0;
      const over = app.inRect(x, OY, OW, OH), dim = !!why || usedUp;
      const key = o.id, v = S.h[key] || 0, n = clamp(v + (over && !dim ? 1 : -1) * app.dt * 9, 0, 1); S.h[key] = n;
      const shk = S.shakeI === i && S.shakeT > 0 ? Math.sin(S.shakeT * 70) * 9 * (S.shakeT / 0.4) : 0;
      drawOptionCard(app, run, i, o, over, EASE.out(n), why, usedUp, shk);
      if (over) {
        app.cursor = dim ? 'not-allowed' : 'pointer';
        if (why) app.tooltip(o.name + ' (unavailable)', why, { color: COL.bad }); else if (usedUp) app.tooltip(o.name, 'You have used your Forge choice.'); else app.tooltip(o.name, o.desc);
        if (app.clicked(x, OY, OW, OH)) {
          if (dim) { sfx(app, 'error'); S.shakeI = i; S.shakeT = 0.4; S.fx.shake(0.25); if (why) { S.toast = why; S.toastT = 1.8; } }
          else { sfx(app, 'uiClick'); ({ rest: startRest, expand: startExpand, refine: pickRefine, strip: pickStrip, reforge: pickReforge })[o.id](app); }
        }
      }
    });

    // log + continue
    let ly = 506; for (const ln of S.log.slice(-2)) { ly += app.text(ln, 640, ly, { size: 17, ui: true, align: 'center', color: COL.good }) + 3; }
    toastDraw(app, S, 560);
    const done = f.used > 0;
    if (app.button(done ? 'Continue' : 'Leave without choosing', done ? 490 : 520, 610, done ? 300 : 240, done ? 72 : 52, { size: done ? 32 : 18, fill: done ? '#4a2a1c' : undefined, stroke: done ? COL.lamp : undefined })) { RUN.advance(run); flow.route(); }
    if (app.inRect(490, 610, 300, 72) && done) app.tooltip('Continue', 'Back to the map.');

    S.fx.draw(g);
    g.restore();
    S.fx.drawFlash(g, 1280, 720);
    app.blocked = false;
    if (S.anim) { drawForgeAnim(app, S.anim); S.fx.draw(g); if (S.anim.t > 0.5) app.text('click to skip', 640, 700, { size: 13, ui: true, align: 'center', color: 'rgba(232,220,196,.5)' }); }
    else if (S.modal.m) drawModal(app, S.modal, run);
  },
};
