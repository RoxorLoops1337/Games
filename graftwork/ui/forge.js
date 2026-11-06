// FORGE screen (run.phase === 'forge', run.pending = {kind:'forge', used, last}).
// Five big options; the player picks one (two with perk 'forgeExtra'), watches the animation, then continues.
import { tscale, wrapLimit } from './graft_parts.js';
import { COL, EASE, rgba, clamp, lerp } from './core.js';
import { Fx } from './fx.js';
import { drawBackground } from '../art/backgrounds.js';
import { drawCard, CARD_W, CARD_H } from '../art/cards.js';
import { drawHeart, drawCoin, drawForgeIcon } from '../art/icons.js';
import * as RUN from '../engine/run.js';
import { cardSpec, canGraft, strainInfo, canTemper, instWeight, fusedWeight, FUSE_CAP } from '../engine/cards.js';
import { CARDS, GRAFTS } from '../data/index.js';
import { withGloss } from './tooltips.js';
import { infoOpen, infoClose, touchUi, openInfoCard, infoChip, drawInfoCard } from './card_zoom.js';
import { drawGauge, gaugeLabel, drawModal, openCards, openGraftChoice, makeAnim, updateAnim, drawAnim, infoFromDeck, stripDeck, toastDraw, cardName } from './shop.js';
import { lnw } from '../art/linework.js';

const BRASS = '#C9A227';
const sfx = (app, name, o) => { const a = app.shared && app.shared.audio; if (a && a.sfx) a.sfx(name, o); };
let S = null;

const OPTS = [
  { id: 'rest', name: 'Rest', desc: 'Lie down by the coals. Heal 30% of your max HP.' },
  { id: 'expand', name: 'Expand', desc: 'Let out the seams. +1 Budget for the rest of the run.' },
  { id: 'refine', name: 'Refine', desc: 'Hammer one card into its upgraded form.' },
  { id: 'temper', name: 'Temper', short: 'Fuse a card\'s patches into it for good. The slots open up again.', desc: 'Hammer a card\'s patches into the card for good. Their boons and prices stay, the patches come off, and the slots open up for new grafts. Tempered grafts weigh 1 less, and an Overload loses its x1.5 and its Shatter risk.' },
  { id: 'strip', name: 'Strip', desc: 'Pull one graft off a card. The card stays, the boon is lost, the price goes too.' },
  { id: 'reforge', name: 'Reforge', desc: 'Lift a graft off one card and stitch it onto another.' },
];
const OW = 182, OH = 350, OGAP = 16, OX0 = (1280 - (OPTS.length * OW + (OPTS.length - 1) * OGAP)) / 2, OY = 140;
// Centre x of option i (tests click here).
export const optionCenterX = (i) => OX0 + i * (OW + OGAP) + OW / 2;
export const optionIndex = (id) => OPTS.findIndex((o) => o.id === id);

const allowed = (run) => 1 + RUN.perkN(run, 'forgeExtra');
const upgradable = (run) => run.deck.filter((i) => !i.up && CARDS[i.id].up && CARDS[i.id].type !== 'junk');
const grafted = (run) => run.deck.filter((i) => i.grafts.length);
const temperable = (run) => run.deck.filter(canTemper);
const temperedOf = (inst) => ({ ...inst, fused: [...(inst.fused || []), ...inst.grafts], grafts: [] });
const temperDeck = (run, uid) => run.deck.map((i) => (i.uid === uid ? temperedOf(i) : i));
const movable = (inst, run) => inst.grafts.some((gid) => run.deck.some((d) => d !== inst && canGraft(d, gid)));
const reforgeSources = (run) => grafted(run).filter((i) => movable(i, run));

function reasonFor(run, id) {
  if (id === 'refine' && !upgradable(run).length) return 'Every card here is already refined.';
  if (id === 'temper' && !temperable(run).length) return grafted(run).length ? `A card can hold at most ${FUSE_CAP} tempered grafts.` : 'No card carries a patch to hammer.';
  if (id === 'strip' && !grafted(run).length) return 'No card carries a graft.';
  if (id === 'reforge') {
    if (!grafted(run).length) return 'No card carries a graft.';
    if (!reforgeSources(run).length) return 'No graft can move to another card.';
  }
  return null;
}
function detailFor(run, id) {
  if (id === 'rest') { const h = RUN.forgeHeal(run), to = Math.min(run.maxHp, run.hp + h); return to === run.hp ? { t: `Already at full HP (${run.hp})`, c: COL.vellum } : { t: `HP ${run.hp} to ${to}  (+${to - run.hp})`, c: COL.good }; }
  if (id === 'expand') { const i = strainInfo(run); return { t: `Budget ${i.budget} to ${i.budget + 1}`, c: COL.lamp }; }
  if (id === 'refine') return { t: `${upgradable(run).length} ${upgradable(run).length === 1 ? 'card' : 'cards'} can be refined`, c: COL.vellum };
  if (id === 'temper') return { t: `${temperable(run).length} ${temperable(run).length === 1 ? 'card' : 'cards'} can be tempered`, c: COL.vellum };
  if (id === 'strip') return { t: `${grafted(run).length} ${grafted(run).length === 1 ? 'card carries' : 'cards carry'} grafts`, c: COL.vellum };
  return { t: `${reforgeSources(run).length} ${reforgeSources(run).length === 1 ? 'card' : 'cards'} can give a graft`, c: COL.vellum };
}

// ---- option icons (procedural) ------------------------------------------------------------------------------------------
function drawOptIcon(g, id, cx, cy, k, t, app) {
  const st = app && app.shared && app.shared.meta && app.shared.meta.settings;
  drawForgeIcon(g, id, cx, cy, 128, { t, k, quality: app && app.quality, reduced: !!(st && (st.reduceMotion || st.reducedMotion)) }); // engraved, art/icons.js
}

function drawOptionCard(app, run, i, o, over, k, disabledWhy, usedUp, shk) {
  const g = app.ctx, x = OX0 + i * (OW + OGAP) + shk, y = OY - 10 * k;
  const dim = !!disabledWhy || usedUp;
  g.save(); if (k > 0.02 && !dim) { g.shadowColor = 'rgba(255,140,50,.6)'; g.shadowBlur = 28 * k; }
  app.rr(x, y, OW, OH, 14);
  const gr = g.createLinearGradient(0, y, 0, y + OH); gr.addColorStop(0, dim ? '#26211e' : '#3d2a1e'); gr.addColorStop(1, dim ? '#161311' : '#1e1410'); g.fillStyle = gr; g.fill();
  g.shadowBlur = 0; g.lineWidth = lnw(over && !dim ? 3 : 2); g.strokeStyle = dim ? 'rgba(232,220,196,.2)' : over ? COL.lamp : rgba(BRASS, 0.7); g.stroke();
  g.shadowBlur = 0; app.panel(x, y, OW, OH, { fill: 'rgba(0,0,0,0)', stroke: 'rgba(0,0,0,0)', r: 14, lw: 2 }); // chrome overlay: engraved hatch, inset shadow, rivets (cached)
  g.save(); app.rr(x + 8, y + 8, OW - 16, OH - 16, 10); g.lineWidth = lnw(1); g.strokeStyle = dim ? 'rgba(232,220,196,.1)' : 'rgba(201,162,39,.3)'; g.setLineDash([5, 4]); g.stroke(); g.restore();
  g.globalAlpha = dim ? 0.4 : 1; drawOptIcon(g, o.id, x + OW / 2, y + 88, k, app.t, app); g.globalAlpha = 1;
  const nameH = app.text(o.name, x + OW / 2, y + 150, { size: 30, bold: true, align: 'center', color: dim ? 'rgba(232,220,196,.4)' : COL.lamp, shadow: !dim });
  // bottom block (reason or live detail) is sized from its real wrapped lines; the description gets what is left (phones inflate the text)
  let bt = '', bo, bl = 0; const bsz = disabledWhy ? 14 : 15;
  if (disabledWhy) { bt = disabledWhy; bo = { size: 14, ui: true, align: 'center', maxW: OW - 30, lineH: 17, color: COL.bad, bold: true }; }
  else if (!usedUp) { const d = detailFor(run, o.id); bt = d.t; bo = { size: 15, ui: true, bold: true, align: 'center', maxW: OW - 24, color: d.c }; }
  const bpitch = disabledWhy ? Math.round(17 * app.sz(14, { ui: true }) / 14) : Math.round(app.sz(15, { ui: true, bold: true }) * 1.22);
  if (bt) bl = app.wrap(bt, bo.maxW, bsz, { ui: true, bold: true }).length;
  const botTop = y + OH - 14 - bl * bpitch, descTop = y + 150 + nameH + 2;
  const dpitch = Math.round(17 * app.sz(14, { ui: true }) / 14), nl = Math.max(1, Math.floor((botTop - descTop - 2) / dpitch));
  const full = app.wrap(o.short || o.desc, OW - 30, 14, { ui: true }), trunc = full.length > nl || (!!o.short && !!o.desc && o.short !== o.desc);
  wrapLimit(app, o.short || o.desc, OW - 30, 14, nl, { ui: true }).forEach((ln, q) => app.text(ln, x + OW / 2, descTop + q * dpitch, { size: 14, ui: true, align: 'center', lineH: 17, color: dim ? 'rgba(232,220,196,.35)' : COL.vellum }));
  if (bt) app.text(bt, x + OW / 2, botTop, bo);
  g.restore();
  return { trunc, text: { x: x + 8, y: descTop - 2, w: OW - 16, h: Math.max(20, nl * dpitch + 4) } };
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
function startTemper(app, inst) {
  const run = app.shared.run, before = cardSpec(inst), names = inst.grafts.map((g) => GRAFTS[g].name);
  const r = RUN.forgeAct(run, 'temper', inst.uid); if (!r.ok) return fail(app);
  const tr = app.shared && app.shared.transitions;
  S.anim = tr && tr.TEMPER ? { kind: 'temper', t: 0, dur: tr.TEMPER.dur, before, after: cardSpec(inst), n: names.length } : { kind: 'refine', t: 0, dur: 2.6, before, after: cardSpec(inst), struck: false };
  S.log.push(`Tempered ${before.name}: ${names.join(' and ')} are part of the card now.`);
}
function pickTemper(app) {
  const run = app.shared.run;
  openCards(S.modal, {
    title: 'Temper which card?', sub: 'The hammer fuses its patches into the card. Boons and prices stay for good, and the patch slots open up again.', cards: temperable(run),
    compare: (inst) => cardSpec(temperedOf(inst)), compareTag: 'FUSED: patches become part of the card',
    info: (inst) => {
      const w0 = instWeight(inst), w1 = instWeight(temperedOf(inst)), lines = [];
      lines.push({ t: `Fused for good: ${inst.grafts.map((g) => GRAFTS[g].name).join(', ')}.`, c: COL.vellum });
      lines.push({ t: w1 < w0 ? `Weight ${w0} to ${w1}: tempered grafts weigh 1 less.` : `Weight stays ${w0}: tempered grafts weigh 1 less, but never under 1.`, c: w1 < w0 ? COL.good : COL.vellum });
      lines.push({ t: `Patch slots free again: ${2}.`, c: COL.vellum });
      if (inst.grafts.length > 2) lines.push({ t: 'No longer an Overload: the x1.5 and the Shatter risk are gone.', c: COL.lamp });
      return infoFromDeck(run, temperDeck(run, inst.uid), lines);
    },
    onPick: (inst) => startTemper(app, inst),
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
  g.fillStyle = mg; g.beginPath(); g.roundRect(-52, -52, 104, 48, 6); g.fill(); g.strokeStyle = '#2b2f33'; g.lineWidth = lnw(3); g.stroke();
  g.restore();
}

function updateForgeAnim(app, a, dt) {
  if (['attach', 'strip', 'move', 'burn'].includes(a.kind)) return updateAnim(app, a, S.fx, dt);
  if (a.kind === 'temper') return app.shared.transitions.temperUpdate(app, a, S.fx, dt);
  a.t += dt; const k = a.t / a.dur;
  if (a.kind === 'rest') { if (Math.random() < 0.7) S.fx.burst(640 + (Math.random() - 0.5) * 240, 520, 'ember', { n: 1 }); if (k > 0.3 && !a.healFx) { a.healFx = true; S.fx.burst(640, 360, 'heal', { n: 16 }); } }
  else if (a.kind === 'expand') { if (!a.clunk && k > 0.4) { a.clunk = true; sfx(app, 'graftScar'); S.fx.hitstop(40); S.fx.shake(0.3); S.fx.burst(640 + (a.after.budget - 1) * 30, 360, 'spark'); S.fx.flash(BRASS, 0.15, 0.2); } }
  else if (a.kind === 'refine') {
    if (!a.struck && k > 0.4) { a.struck = true; sfx(app, 'upgrade'); S.fx.hitstop(80); S.fx.shake(0.6); S.fx.burst(640, 330, 'spark', { n: 30, speed: 480 }); S.fx.burst(640, 330, 'ember', { n: 10 }); S.fx.flash('#ffb347', 0.35, 0.3); S.fx.ring(640, 330, '#ffb347', 220, 0.6); }
  }
  return a.t >= a.dur;
}
function drawForgeAnim(app, a) {
  app.reg('forge-anim', 0, 0, 1280, 720, { overlay: true });
  const g = app.ctx, k = clamp(a.t / a.dur, 0, 1);
  if (['attach', 'strip', 'move', 'burn'].includes(a.kind)) return drawAnim(app, a, S.fx);
  g.save(); g.fillStyle = `rgba(8,4,2,${0.96 * clamp(k * 8, 0, 1) * (k > 0.94 ? (1 - k) / 0.06 : 1)})`; g.fillRect(0, 0, 1280, 720); g.restore();
  if (a.kind === 'rest') {
    const pulse = 0.7 + Math.sin(a.t * 6) * 0.1, fk = EASE.out(clamp((k - 0.2) / 0.5, 0, 1));
    const gl = g.createRadialGradient(640, 420, 10, 640, 420, 420); gl.addColorStop(0, `rgba(255,170,70,${0.5 * pulse})`); gl.addColorStop(1, 'rgba(255,120,30,0)'); g.fillStyle = gl; g.fillRect(0, 0, 1280, 720);
    drawOptIcon(g, 'rest', 640, 330, 1, app.t, app); // fire
    const hp = lerp(a.from, a.to, fk);
    app.text('Rest', 640, 100, { size: 40, bold: true, align: 'center', color: COL.lamp, shadow: true });
    drawHeart(g, 440, 520, 40);
    const bw = 360, bx = 470, by = 505;
    app.rr(bx, by, bw, 30, 8); g.fillStyle = 'rgba(0,0,0,.6)'; g.fill();
    g.save(); app.rr(bx, by, bw, 30, 8); g.clip(); g.fillStyle = COL.scar; g.fillRect(bx, by, bw * (a.from / a.max), 30); g.fillStyle = '#7fcf8a'; g.fillRect(bx, by, bw * (hp / a.max), 30); g.fillStyle = COL.scar; g.fillRect(bx, by, bw * (Math.min(hp, a.from) / a.max), 30); g.restore();
    app.rr(bx, by, bw, 30, 8); g.strokeStyle = 'rgba(232,220,196,.6)'; g.lineWidth = lnw(2); g.stroke();
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
  } else if (a.kind === 'temper') {
    const T = app.shared.transitions, hit = a.t >= T.TEMPER.strikes[0], flip = a.t >= T.TEMPER.pop ? 1 : 0, hp = T.hammerPose(a.t);
    app.text('Temper', 640, 70, { size: 40, bold: true, align: 'center', color: COL.lamp, shadow: true });
    g.fillStyle = '#25262a'; g.beginPath(); g.moveTo(420, 600); g.lineTo(860, 600); g.lineTo(800, 560); g.lineTo(880, 530); g.lineTo(880, 500); g.lineTo(400, 500); g.lineTo(350, 540); g.lineTo(420, 550); g.closePath(); g.fill();
    drawCard(g, flip ? a.after : a.before, 640, 330, { scale: 1.0, glow: T.heatAt(a.t) * 0.25 });
    T.temperTint(app, a, 640, 330, CARD_W, CARD_H); T.temperRivets(app, a, 640, 330, CARD_W, CARD_H, a.n);
    drawHammer(g, 715, 250 + hp.dy, hp.ang);
    if (a.t > 1.7) app.text(`${a.before.name}: the patches are part of the card now.`, 640, 665, { size: 22, italic: true, align: 'center', color: COL.vellum, shadow: true, alpha: clamp((a.t - 1.7) * 4, 0, 1) });
    void hit;
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
  enter(app) { infoClose(); S = { fx: new Fx(), modal: { m: null }, h: {}, anim: null, toast: '', toastT: 0, log: [], t: 0, shakeI: -1, shakeT: 0 }; },

  update(app, dt) {
    if (!S) return; S.t += dt;
    S.shakeT = Math.max(0, S.shakeT - dt);
    const fdt = S.fx.update(dt);
    if (Math.random() < dt * 5) S.fx.emit({ x: 100 + Math.random() * 1080, y: 725, n: 1, colors: ['#ff6a2b', '#ffb347'], speed: 40, angle: -1.57, spread: 0.8, life: 3, size: 2.2, gravity: -30, glow: true, drag: 0.1 });
    if (S.anim) { if (updateForgeAnim(app, S.anim, fdt || 0) || (app.mouse.released && S.anim.t > 0.5)) S.anim = null; }
  },
  // dense screen: the text scale is honoured up to 110%
  draw(app) {
    const ts = app.textScale; app.textScale = Math.min(tscale(app), 1.1);
    try { this.drawForge(app); } finally { app.textScale = ts; }
  },
  drawForge(app) {
    if (!S) return;
    const g = app.ctx, run = app.shared.run, flow = app.shared.flow, f = run.pending;
    if (!f || f.kind !== 'forge') return;
    const so = S.fx.shakeOffset();
    const locked = !!(S.modal.m || S.anim || infoOpen());
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
    app.reg('forge-head', 24, 4, 470, 56, { group: 'head' }); app.reg('forge-budget', 520, 4, 310, 60, { group: 'budget' });
    app.text('BUDGET', 520, 6, { size: 13, ui: true, bold: true, color: 'rgba(232,220,196,.7)' });
    drawGauge(app, 520, 26, 300, info);
    app.text(gaugeLabel(info), 520, 46, { size: 14, ui: true, maxW: 300, color: info.strain ? COL.bad : 'rgba(232,220,196,.7)' });
    if (app.inRect(520, 4, 310, 60)) app.tooltip('Budget', `Total graft weight ${info.weight} against a Budget of ${info.budget}. Over it, each Strain point Tithes a Bare card (-25% numbers).` + (info.tithed.length ? `\nTithed now: ${info.tithed.map((u) => cardName(run, u)).join(', ')}.` : ''));
    if (app.inRect(320, 8, 160, 44)) app.tooltip('Health', `${run.hp} of ${run.maxHp} HP.`);
    // the top-right corner (x 1128..1272, y 0..56) belongs to the global Pause / Fullscreen buttons
    app.reg('forge-gold', 880, 10, 112, 44, { group: 'gold' }); app.reg('forge-deck', 1004, 10, 112, 44, { group: 'deckbtn' });
    if (app.button(`Deck (${run.deck.length})`, 1004, 10, 112, 44, { size: 16 })) flow.openDeck();
    app.panel(880, 10, 112, 44, { fill: 'rgba(14,12,10,.9)', stroke: rgba(BRASS, 0.7) });
    drawCoin(g, 900, 32, 24); app.text(String(run.gold), 916, 17, { size: 24, bold: true, color: COL.gold, shadow: true, maxW: 72 });

    app.text(left > 0 ? (max > 1 ? `Choose ${left === max ? 'up to two' : 'one more'}. Your Forge Hammer allows ${max}.` : 'Choose one.') : 'The fire is banked. Time to go.', 640, 92, { size: 20, italic: true, align: 'center', maxW: 900, color: 'rgba(232,220,196,.85)' });

    // options
    OPTS.forEach((o, i) => {
      const x = OX0 + i * (OW + OGAP), why = reasonFor(run, o.id), usedUp = left <= 0;
      app.reg('forge-opt' + i, x - 4, OY - 4, OW + 8, OH + 8, { group: 'opt' + i });
      const over = app.inRect(x, OY, OW, OH), dim = !!why || usedUp;
      const key = o.id, v = S.h[key] || 0, n = clamp(v + (over && !dim ? 1 : -1) * app.dt * 9, 0, 1); S.h[key] = n;
      const shk = S.shakeI === i && S.shakeT > 0 ? Math.sin(S.shakeT * 70) * 9 * (S.shakeT / 0.4) : 0;
      const od = drawOptionCard(app, run, i, o, over, EASE.out(n), why, usedUp, shk);
      if (od.trunc && touchUi(app)) { // phones: no hover, so the full text opens on a tap of the chip or of the cut-off words
        if (infoChip(app, x + OW - 18, OY + 18, [od.text])) { sfx(app, 'uiClick'); openInfoCard(app, o.name, withGloss(why ? `${o.desc}\n${why}` : o.desc), COL.lamp); }
      }
      if (over) {
        app.cursor = dim ? 'not-allowed' : 'pointer';
        const oa = { x, y: OY, w: OW, h: OH }; // beside the option card, never over it
        if (why) app.tooltip(o.name + ' (unavailable)', why, { color: COL.bad, anchor: oa }); else if (usedUp) app.tooltip(o.name, 'You have used your Forge choice.', { anchor: oa }); else app.tooltip(o.name, o.desc, { anchor: oa });
        if (app.clicked(x, OY, OW, OH)) {
          if (dim) { sfx(app, 'error'); S.shakeI = i; S.shakeT = 0.4; S.fx.shake(0.25); if (why) { S.toast = why; S.toastT = 1.8; } }
          else { sfx(app, 'uiClick'); ({ rest: startRest, expand: startExpand, refine: pickRefine, temper: pickTemper, strip: pickStrip, reforge: pickReforge })[o.id](app); }
        }
      }
    });

    // log + continue
    let ly = 506; app.reg('forge-log', 340, 500, 600, 44, { group: 'log' }); for (const ln of S.log.slice(-2)) { ly += app.text(ln, 640, ly, { size: 17, ui: true, align: 'center', color: COL.good, maxW: 590 }) + 3; }
    toastDraw(app, S, 560);
    const done = f.used > 0;
    app.reg('forge-leave', done ? 490 : 480, 610, done ? 300 : 320, done ? 72 : 52, { group: 'leave' });
    if (app.button(done ? 'Continue' : 'Leave without choosing', done ? 490 : 480, 610, done ? 300 : 320, done ? 72 : 52, { size: done ? 32 : 18, fill: done ? '#4a2a1c' : undefined, stroke: done ? COL.lamp : undefined })) { RUN.advance(run); flow.route(); }
    if (app.inRect(490, 610, 300, 72) && done) app.tooltip('Continue', 'Back to the map.');

    S.fx.draw(g);
    g.restore();
    S.fx.drawFlash(g, 1280, 720);
    app.blocked = false;
    if (S.anim) { drawForgeAnim(app, S.anim); S.fx.draw(g); if (S.anim.t > 0.5) app.text('click to skip', 640, 700, { size: 13, ui: true, align: 'center', color: 'rgba(232,220,196,.5)' }); }
    else if (S.modal.m) drawModal(app, S.modal, run);
    drawInfoCard(app);
  },
};
