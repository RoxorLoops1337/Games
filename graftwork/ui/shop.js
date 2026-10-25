// SHOP screen (run.phase === 'shop', run.pending = shop) plus the shared "workbench kit" the Forge screen reuses:
// gauges, card / graft pickers with live Budget-Strain-Tithe preview, and the attach / strip / move flourishes.
import { COL, EASE, rgba, clamp, lerp } from './core.js';
import { Fx } from './fx.js';
import { drawBackground } from '../art/backgrounds.js';
import { drawCard, drawGraftPatch, CARD_W, CARD_H } from '../art/cards.js';
import { drawRelic, drawPotion, drawCoin } from '../art/icons.js';
import * as RUN from '../engine/run.js';
import { cardSpec, canGraft, strainInfo, previewGraft, MAX_GRAFTS_NORMAL } from '../engine/cards.js';
import { cardLines, priceLines } from '../engine/text.js';
import { CARDS, GRAFTS, RELICS, POTIONS } from '../data/index.js';

const BRASS = '#C9A227';
const sfx = (app, name, o) => { const a = app.shared && app.shared.audio; if (a && a.sfx) a.sfx(name, o); };

// =====================================================================================================================
// SHARED KIT (named exports; the Forge imports these)
// =====================================================================================================================

export const typeLabel = (spec) => ({ attack: 'Attack', skill: 'Skill', power: 'Power', junk: 'Junk' }[spec.type] || spec.type);
export function graftLines(g) {
  return [`Weight ${g.weight}  (${g.tier})`, `Boon: ${g.boon}`, `Price: ${g.price}`];
}
export function tithedUids(run) { return new Set(strainInfo(run).tithed); }
export function cardName(run, uid) { const i = RUN.findInst(run, uid); return i ? CARDS[i.id].name : '?'; }

// Budget gauge: brass cells up to the Budget, red cells for Strain. o.slide = {i, k} animates one cell sliding in.
export function drawGauge(app, x, y, w, info, o = {}) {
  const g = app.ctx;
  const n = Math.max(info.budget, info.weight, 1), gap = 4;
  const cw = clamp((w - (n - 1) * gap) / n, 8, 28), ch = o.h || 18;
  for (let i = 0; i < n; i++) {
    const cx = x + i * (cw + gap);
    let oy = 0, al = 1;
    if (o.slide && o.slide.i === i) { oy = -(1 - o.slide.k) * 70; al = clamp(o.slide.k * 1.5, 0, 1); }
    const inB = i < info.budget, filled = i < info.weight;
    g.save(); g.globalAlpha = al;
    app.rr(cx, y + oy, cw, ch, 4);
    if (filled) { const gr = g.createLinearGradient(0, y + oy, 0, y + oy + ch); gr.addColorStop(0, inB ? '#e6c75a' : '#d8485c'); gr.addColorStop(1, inB ? '#8d7216' : '#7a1626'); g.fillStyle = gr; }
    else g.fillStyle = 'rgba(0,0,0,.45)';
    g.fill();
    g.lineWidth = 1.6; g.strokeStyle = inB ? 'rgba(201,162,39,.8)' : COL.scar;
    if (!inB) g.setLineDash([3, 3]);
    g.stroke(); g.setLineDash([]);
    g.restore();
  }
  return n * (cw + gap);
}
export function gaugeLabel(info) {
  return `Weight ${info.weight} of Budget ${info.budget}` + (info.strain ? `   Strain ${info.strain}` : '');
}

// preview of a modified deck: { before, after, names }
export function infoFromDeck(run, deck2, extraLines = []) {
  const before = strainInfo(run), after = strainInfo(run, deck2);
  const names = after.tithed.map((u) => { const i = deck2.find((d) => d.uid === u); return i ? CARDS[i.id].name : '?'; });
  return { before, after, names, lines: [...tithLines(before, after, names), ...extraLines] };
}
export function tithLines(before, after, names) {
  const L = [];
  if (after.strain > 0) L.push({ t: `Strain ${after.strain}: Tithe on ${names.length ? names.join(', ') : 'no Bare card'} (-25% numbers that combat).`, c: COL.bad });
  else L.push({ t: 'Within Budget: no Tithe.', c: COL.good });
  if (after.backfire > 0) L.push({ t: `Backfire ${after.backfire}: that many grafted cards jam in your opening hand.`, c: COL.bad });
  const d = after.strain - before.strain;
  if (d !== 0) L.push({ t: d > 0 ? `Strain +${d} compared to now.` : `Strain ${d} compared to now.`, c: d > 0 ? COL.bad : COL.good });
  return L;
}
export function graftPreview(run, uid, gid) {
  const p = previewGraft(run, uid, gid);
  const inst = RUN.findInst(run, uid);
  const lines = tithLines(p.before, p.after, p.tithedNames);
  if (inst.grafts.length >= MAX_GRAFTS_NORMAL) lines.unshift({ t: 'Overload: weighs +1, numbers x1.5, 25% Shatter on first play.', c: COL.lamp });
  return { before: p.before, after: p.after, names: p.tithedNames, lines };
}
export function stripDeck(run, uid, gid) {
  return run.deck.map((i) => {
    if (i.uid !== uid) return i;
    const k = i.grafts.indexOf(gid);
    return { ...i, grafts: i.grafts.filter((_, idx) => idx !== k) };
  });
}

// ---- modal pickers --------------------------------------------------------------------------------------------------
// st = { m: null | modal }. Cards: openCards(st, {title, sub, cards:[inst], reason(inst)->str|null, info(inst)->preview, onPick(inst), canCancel})
export function openCards(st, o) { st.m = { kind: 'cards', scroll: 0, scrollT: 0, t: 0, hov: -1, ...o }; }
// Grafts of one card: openGraft(st, {title, inst, info(gid)->preview, onPick(gid)})
export function openGraftChoice(st, o) { st.m = { kind: 'grafts', t: 0, hov: -1, ...o }; }

function drawInfo(app, x, y, w, h, info, hint) {
  app.panel(x, y, w, h, { fill: 'rgba(14,12,10,.96)', stroke: 'rgba(201,162,39,.5)' });
  if (!info) { app.text(hint || 'Hover a card to preview the result.', x + w / 2, y + h / 2 - 10, { size: 17, align: 'center', color: 'rgba(232,220,196,.6)', italic: true }); return; }
  const gw = 300;
  app.text('NOW', x + 16, y + 14, { size: 12, ui: true, bold: true, color: 'rgba(232,220,196,.6)' });
  drawGauge(app, x + 62, y + 12, gw, info.before);
  app.text(gaugeLabel(info.before), x + 62, y + 34, { size: 13, ui: true, color: 'rgba(232,220,196,.75)' });
  app.text('AFTER', x + 16, y + 62, { size: 12, ui: true, bold: true, color: COL.lamp });
  drawGauge(app, x + 62, y + 60, gw, info.after);
  app.text(gaugeLabel(info.after), x + 62, y + 82, { size: 13, ui: true, color: info.after.strain ? COL.bad : COL.good });
  let yy = y + 12;
  for (const ln of info.lines || []) { yy += app.text(ln.t, x + gw + 90, yy, { size: 15, ui: true, color: ln.c || COL.vellum, maxW: w - gw - 110, lineH: 19 }) + 3; }
}

// Draws the open modal. Returns true while one is open (the caller should treat the rest of the screen as blocked).
export function drawModal(app, st, run, extra = {}) {
  const m = st.m; if (!m) return false;
  const g = app.ctx, dt = app.dt;
  m.t += dt;
  const fade = clamp(m.t / 0.18, 0, 1);
  g.save(); g.globalAlpha = fade; g.fillStyle = 'rgba(6,4,3,.82)'; g.fillRect(0, 0, 1280, 720);
  app.panel(36, 30, 1208, 660, { fill: 'rgba(26,22,20,.97)', stroke: rgba(BRASS, 0.7), lw: 3 });
  app.text(m.title, 640, 44, { size: 30, bold: true, align: 'center', color: COL.lamp });
  if (m.sub) app.text(m.sub, 640, 82, { size: 16, ui: true, align: 'center', color: 'rgba(232,220,196,.75)' });
  const close = () => { st.m = null; if (m.onCancel) m.onCancel(); };
  if (app.button('Back', 1100, 42, 120, 40, { size: 18, key: 'escape' })) { sfx(app, 'uiBack'); close(); g.restore(); return true; }
  let picked = null, info = null;

  if (m.kind === 'cards') {
    const sc = 0.55, cw = CARD_W * sc, chh = CARD_H * sc, gapX = 16, gapY = 14;
    const gx = 60, gy = 112, gw = 1160, gh = 440;
    const cols = Math.max(1, Math.floor((gw + gapX) / (cw + gapX)));
    const left = gx + (gw - (cols * cw + (cols - 1) * gapX)) / 2;
    const rows = Math.ceil(m.cards.length / cols), total = rows * (chh + gapY);
    const maxS = Math.max(0, total - gh);
    if (app.inRect(gx, gy, gw, gh) && app.mouse.wheel) m.scrollT = clamp(m.scrollT + app.mouse.wheel * 0.7, 0, maxS);
    m.scrollT = clamp(m.scrollT, 0, maxS);
    m.scroll = lerp(m.scroll, m.scrollT, clamp(dt * 14, 0, 1));
    const tith = tithedUids(run);
    g.save(); app.rr(gx, gy, gw, gh, 8); g.clip();
    let hover = -1;
    const rects = m.cards.map((inst, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      return { x: left + c * (cw + gapX) + cw / 2, y: gy + 8 + r * (chh + gapY) + chh / 2 - m.scroll };
    });
    if (app.inRect(gx, gy, gw, gh)) rects.forEach((p, i) => { if (hover < 0 && app.inRect(p.x - cw / 2, p.y - chh / 2, cw, chh)) hover = i; });
    if (hover !== m.hov) { m.hov = hover; if (hover >= 0) sfx(app, 'uiHover', { vol: 0.3 }); }
    m.cards.forEach((inst, i) => {
      const p = rects[i]; if (p.y < gy - chh || p.y > gy + gh + chh || i === hover) return;
      const why = m.reason ? m.reason(inst) : null;
      drawCard(g, cardSpec(inst), p.x, p.y, { scale: sc, tithed: tith.has(inst.uid), dim: why ? 0.55 : 0 });
    });
    g.restore();
    if (hover >= 0) {
      const inst = m.cards[hover], p = rects[hover], why = m.reason ? m.reason(inst) : null, hs = 0.82;
      const hx = clamp(p.x, gx + CARD_W * hs / 2, gx + gw - CARD_W * hs / 2), hy = clamp(p.y, gy + CARD_H * hs / 2 - 20, gy + gh - CARD_H * hs / 2 + 40);
      g.save(); g.shadowColor = 'rgba(0,0,0,.8)'; g.shadowBlur = 24;
      drawCard(g, cardSpec(inst), hx, hy, { scale: hs, tithed: tith.has(inst.uid), selected: !why, dim: why ? 0.4 : 0, hover: true });
      g.restore();
      app.cursor = why ? 'not-allowed' : 'pointer';
      info = why ? { before: strainInfo(run), after: strainInfo(run), lines: [{ t: why, c: COL.bad }] } : (m.info ? m.info(inst) : null);
      if (app.clicked(p.x - cw / 2, p.y - chh / 2, cw, chh)) {
        if (why) { sfx(app, 'error'); m.toast = why; m.toastT = 1.6; } else picked = inst;
      }
    }
    if (maxS > 0) { // scrollbar
      const th = Math.max(40, gh * gh / total), ty = gy + (gh - th) * (m.scroll / maxS);
      g.fillStyle = 'rgba(232,220,196,.12)'; g.fillRect(gx + gw + 4, gy, 6, gh); g.fillStyle = rgba(BRASS, 0.8); app.rr(gx + gw + 4, ty, 6, th, 3); g.fill();
    }
    if (!m.cards.length) app.text(m.empty || 'Nothing to choose.', 640, 300, { size: 22, align: 'center', color: 'rgba(232,220,196,.6)', italic: true });
    drawInfo(app, 60, 566, 1160, 108, info, m.hint);
  } else { // grafts of one card
    const inst = m.inst, spec = cardSpec(inst), tith = tithedUids(run);
    drawCard(g, spec, 250, 360, { scale: 1.0, tithed: tith.has(inst.uid) });
    const n = inst.grafts.length, bw = 760, bh = 118;
    let hover = -1;
    inst.grafts.forEach((gid, i) => {
      const gr = GRAFTS[gid], bx = 440, by = 130 + i * (bh + 16);
      const over = app.inRect(bx, by, bw, bh); if (over) hover = i;
      app.panel(bx, by, bw, bh, { fill: over ? 'rgba(60,48,30,.95)' : 'rgba(38,32,28,.95)', stroke: over ? COL.lamp : 'rgba(232,220,196,.35)', lw: over ? 3 : 2 });
      drawGraftPatch(g, gr, bx + 14, by + 14, 250, 90, {});
      app.text(`Weight ${gr.weight}${i >= MAX_GRAFTS_NORMAL ? ' +1 Overload' : ''}`, bx + 280, by + 12, { size: 15, ui: true, bold: true, color: COL.lamp });
      app.text('Boon: ' + gr.boon, bx + 280, by + 36, { size: 15, ui: true, color: COL.good, maxW: bw - 300, lineH: 18 });
      app.text('Price: ' + gr.price, bx + 280, by + 72, { size: 15, ui: true, color: COL.bad, maxW: bw - 300, lineH: 18 });
      if (over) app.cursor = 'pointer';
      if (app.clicked(bx, by, bw, bh)) picked = gid;
    });
    if (hover !== m.hov) { m.hov = hover; if (hover >= 0) sfx(app, 'uiHover', { vol: 0.3 }); }
    info = hover >= 0 && m.info ? m.info(inst.grafts[hover]) : null;
    drawInfo(app, 60, 566, 1160, 108, info, 'Hover a graft to see the result of removing it.');
    void n;
  }
  if (m.toastT > 0) { m.toastT -= dt; app.text(m.toast, 640, 540, { size: 20, align: 'center', bold: true, color: COL.bad, shadow: true, alpha: clamp(m.toastT * 3, 0, 1) }); }
  if (extra.after) extra.after(app);
  g.restore();
  if (picked !== null) { st.m = null; m.onPick(picked); }
  return true;
}

// ---- attach / strip / move / burn flourishes -------------------------------------------------------------------------
// anim = { kind, t, dur, ticks, ...}. makeAnim(...) then updateAnim(app, a, fx, dt) / drawAnim(app, a, fx) each frame.
export function makeAnim(kind, o) {
  const dur = { attach: 1.7, strip: 1.5, move: 2.6, burn: 1.1 }[kind] || 1.5;
  return { kind, t: 0, dur, ticks: 0, stapled: false, ...o };
}
const STITCHES = 6;
const patchBox = (cx, cy, s = 1) => ({ x: cx - 100 * s, y: cy + CARD_H * s / 2 - 100 * s, w: 200 * s, h: 64 * s });

export function updateAnim(app, a, fx, dt) {
  a.t += dt;
  const k = a.t / a.dur;
  const stitchK = (kk, from, step) => clamp(Math.floor((kk - from) / step), 0, STITCHES);
  if (a.kind === 'attach' || a.kind === 'move') {
    const from = a.kind === 'attach' ? 0.3 : 0.6, span = a.kind === 'attach' ? 0.55 : 0.32;
    const n = stitchK(k, from, span / STITCHES);
    while (a.ticks < n) { a.ticks++; sfx(app, 'graftAttach', { pitch: 0.9 + a.ticks * 0.05 }); const p = a.needle ? a.needle(a.ticks) : null; if (p) fx.burst(p.x, p.y, 'spark', { n: 3, speed: 90, life: 0.25 }); }
    if (!a.stapled && k >= from + span + 0.02) {
      a.stapled = true; sfx(app, 'graftScar'); fx.hitstop(40); fx.shake(0.25); fx.flash(BRASS, 0.18, 0.2);
      if (a.cxT !== undefined) fx.burst(a.cxT, a.cyT + 80, 'spark', { n: 12 });
      if (a.overload) { sfx(app, 'overload'); fx.ring(a.cxT, a.cyT, COL.lamp, 200, 0.7); }
      else if (a.tithe) sfx(app, 'tithe');
    }
  } else if (a.kind === 'strip') {
    if (!a.pulled && k > 0.25) { a.pulled = true; sfx(app, 'rustGrind', { vol: 0.7 }); }
    if (!a.stapled && k > 0.6) { a.stapled = true; sfx(app, 'graftScar', { pitch: 0.7 }); fx.burst(a.cx, a.cy - 120, 'dust'); fx.shake(0.15); }
  } else if (a.kind === 'burn') {
    if (a.t === dt) sfx(app, 'burnApply');
    if (Math.random() < 0.8) fx.burst(a.cx + (Math.random() - 0.5) * 160, a.cy + 140 - k * 280, 'ember', { n: 2 });
  }
  return a.t >= a.dur;
}

function zig(g, bx, by, w, h, count, partial, color) {
  g.save(); g.strokeStyle = color || '#0E0E0E'; g.lineWidth = 3; g.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const sx = bx + 16 + i * ((w - 32) / (STITCHES - 1));
    g.beginPath(); g.moveTo(sx - 5, by - 6); g.lineTo(sx + 5, by + h + 6); g.stroke();
    g.beginPath(); g.moveTo(sx + 5, by - 6); g.lineTo(sx - 5, by + h + 6); g.stroke();
  }
  void partial; g.restore();
}
function needle(g, x, y, ang) {
  g.save(); g.translate(x, y); g.rotate(ang); g.strokeStyle = '#d8dde0'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(-26, 0); g.lineTo(14, 0); g.stroke();
  g.strokeStyle = '#9aa3a8'; g.beginPath(); g.arc(-27, 0, 3, 0, 6.28); g.stroke(); g.restore();
}
function patchAt(app, graft, bx, by, w, h, rot, al) {
  const g = app.ctx; g.save(); g.globalAlpha = al === undefined ? 1 : al; g.translate(bx + w / 2, by + h / 2); g.rotate(rot || 0);
  g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 14; drawGraftPatch(g, graft, -w / 2, -h / 2, w, h, {}); g.restore();
}
function dimBg(app, k) { const g = app.ctx; g.save(); g.fillStyle = 'rgba(6,4,3,' + (0.78 * k) + ')'; g.fillRect(0, 0, 1280, 720); g.restore(); }

export function drawAnim(app, a, fx) {
  const g = app.ctx, k = clamp(a.t / a.dur, 0, 1);
  dimBg(app, clamp(k * 6, 0, 1) * (k > 0.92 ? (1 - k) / 0.08 : 1));
  if (a.kind === 'attach') {
    const cx = a.cx, cy = a.cy, graft = GRAFTS[a.gid], pb = patchBox(cx, cy);
    const lift = EASE.out(clamp(k / 0.1, 0, 1));
    const done = a.stapled;
    drawCard(g, done ? a.specAfter : a.specBefore, cx, cy - 10 * lift, { scale: 1.0 + 0.04 * lift, glow: done ? 0.6 : 0 });
    const slide = EASE.back(clamp((k - 0.08) / 0.22, 0, 1));
    const py = lerp(cy - 420, pb.y - 10 * lift, slide), rot = lerp(-0.3, 0, slide);
    if (!done) {
      patchAt(app, graft, pb.x, py, pb.w, pb.h, rot);
      const n = a.ticks; zig(g, pb.x, pb.y - 10 * lift, pb.w, pb.h, n, 0, '#0E0E0E');
      if (k > 0.28 && n < STITCHES) { const sx = pb.x + 16 + n * ((pb.w - 32) / (STITCHES - 1)); const bob = Math.sin(a.t * 40) * 10; needle(g, sx - 8, pb.y - 24 + bob - 10 * lift, 0.9); }
    }
    a.needle = (i) => ({ x: pb.x + 16 + (i - 1) * ((pb.w - 32) / (STITCHES - 1)), y: pb.y });
    a.cxT = cx; a.cyT = cy;
    if (done) {
      app.text(a.overload ? 'OVERLOAD' : 'Sewn on', cx, cy - CARD_H / 2 - 52, { size: 34, bold: true, align: 'center', color: a.overload ? COL.lamp : COL.vellum, shadow: true });
      let yy = cy + CARD_H / 2 + 22;
      for (const ln of (a.lines || []).slice(0, 3)) yy += app.text(ln.t, cx, yy, { size: 16, ui: true, align: 'center', color: ln.c || COL.vellum, maxW: 700 }) + 2;
    }
  } else if (a.kind === 'strip') {
    const cx = a.cx, cy = a.cy, graft = GRAFTS[a.gid], pb = patchBox(cx, cy);
    const pull = EASE.inOut(clamp((k - 0.2) / 0.5, 0, 1));
    drawCard(g, pull >= 1 ? a.specAfter : a.specBefore, cx, cy, { scale: 1.0 });
    if (pull < 1) { // patch still on the card, then peeled off along a taut thread
      const px = pb.x + pull * 40, py = pb.y - pull * 330, al = 1 - pull * 0.2;
      g.save(); g.strokeStyle = COL[graft.school] || '#ddd'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(pb.x + 20, pb.y + pb.h / 2);
      for (let i = 1; i <= 12; i++) { const t = i / 12; g.lineTo(lerp(pb.x + 20, px + 20, t) + Math.sin(a.t * 18 + i) * 6 * pull, lerp(pb.y + pb.h / 2, py + pb.h / 2, t)); }
      g.stroke(); g.restore();
      patchAt(app, graft, px, py, pb.w, pb.h, pull * 0.5, al);
    } else {
      const f = clamp((k - 0.7) / 0.3, 0, 1);
      patchAt(app, graft, pb.x + 40 + f * 120, pb.y - 330 - f * 120, pb.w, pb.h, 0.5 + f * 1.2, 1 - f);
      app.text('Unpicked. The boon is gone.', cx, cy + CARD_H / 2 + 22, { size: 20, align: 'center', color: COL.vellum, italic: true, shadow: true });
    }
  } else if (a.kind === 'burn') {
    const cx = a.cx, cy = a.cy;
    const spec = a.specBefore;
    g.save(); g.globalAlpha = 1 - EASE.in(k); drawCard(g, spec, cx, cy - k * 30, { scale: 1.0 - k * 0.1, dim: k * 0.8 });
    g.globalCompositeOperation = 'source-atop';
    g.restore();
    const edge = cy + CARD_H / 2 - k * CARD_H * 1.1; // glowing burn line rising
    g.save(); g.globalAlpha = (1 - k) * 0.9; const gr = g.createLinearGradient(0, edge - 30, 0, edge + 30);
    gr.addColorStop(0, 'rgba(255,106,43,0)'); gr.addColorStop(0.5, 'rgba(255,170,60,.9)'); gr.addColorStop(1, 'rgba(255,106,43,0)');
    g.fillStyle = gr; g.fillRect(cx - CARD_W / 2, edge - 30, CARD_W, 60); g.restore();
    app.text('Removed from the deck.', cx, cy + CARD_H / 2 + 24, { size: 20, align: 'center', color: COL.vellum, italic: true, shadow: true, alpha: k });
  } else if (a.kind === 'move') {
    const A = a.from, B = a.to, graft = GRAFTS[a.gid], sc = 0.85;
    const pa = patchBox(A.x, A.y, sc), pbx = patchBox(B.x, B.y, sc);
    const lift = EASE.inOut(clamp((k - 0.1) / 0.3, 0, 1)), fly = EASE.inOut(clamp((k - 0.35) / 0.25, 0, 1));
    const landed = a.stapled;
    drawCard(g, lift > 0.5 ? a.fromAfter : a.fromBefore, A.x, A.y, { scale: sc });
    drawCard(g, landed ? a.toAfter : a.toBefore, B.x, B.y, { scale: sc, glow: landed ? 0.6 : 0 });
    if (!landed) {
      const x0 = pa.x, y0 = pa.y - lift * 60, x1 = pbx.x, y1 = pbx.y;
      const t = fly, px = lerp(x0, x1, t), py = lerp(y0, y1, t) - Math.sin(t * Math.PI) * 120;
      if (k < 0.62) {
        g.save(); g.strokeStyle = COL[graft.school] || '#ddd'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(pa.x + 20, pa.y + pa.h / 2);
        for (let i = 1; i <= 10; i++) { const u = i / 10; g.lineTo(lerp(pa.x + 20, px + 20, u), lerp(pa.y + pa.h / 2, py + pa.h / 2, u) - Math.sin(u * 3.14) * 24 * (lift > 0 ? 1 : 0)); }
        g.stroke(); g.restore();
      }
      patchAt(app, graft, px, py, pa.w, pa.h, (1 - Math.abs(0.5 - t) * 2) * 0.35 * (t > 0 && t < 1 ? 1 : 0));
      if (k >= 0.6) zig(g, pbx.x, pbx.y, pbx.w, pbx.h, a.ticks, 0, '#0E0E0E');
    }
    a.needle = (i) => ({ x: pbx.x + 16 + (i - 1) * ((pbx.w - 32) / (STITCHES - 1)), y: pbx.y });
    a.cxT = B.x; a.cyT = B.y;
    app.text(landed ? 'Moved' : 'Lifting the patch', 640, 70, { size: 28, bold: true, align: 'center', color: COL.vellum, shadow: true });
    if (landed) { let yy = 590; for (const ln of (a.lines || []).slice(0, 3)) yy += app.text(ln.t, 640, yy, { size: 16, ui: true, align: 'center', color: ln.c || COL.vellum, maxW: 800 }) + 2; }
  }
}

// ---- small drawing helpers -------------------------------------------------------------------------------------------
export function drawCoinLabel(app, x, y, n, o = {}) {
  const g = app.ctx; drawCoin(g, x, y + (o.size || 20) * 0.55, o.coin || 18);
  app.text(String(n), x + 14, y, { size: o.size || 20, bold: true, color: o.color || COL.gold, shadow: true });
}
export function stamp(app, cx, cy, text, color, rot) {
  const g = app.ctx; g.save(); g.translate(cx, cy); g.rotate(rot === undefined ? -0.2 : rot);
  const w = app.measure(text, 30, { bold: true }) + 28;
  app.rr(-w / 2, -24, w, 48, 6); g.fillStyle = 'rgba(10,6,4,.55)'; g.fill(); g.lineWidth = 4; g.strokeStyle = color || '#c4223c'; g.stroke();
  app.text(text, 0, -17, { size: 30, bold: true, align: 'center', color: color || '#c4223c' }); g.restore();
}
export function toastDraw(app, S, y = 650) {
  if (S.toastT > 0) { S.toastT -= app.dt; const a = clamp(S.toastT * 3, 0, 1); app.panel(640 - 230, y - 8, 460, 44, { fill: `rgba(60,10,16,${0.9 * a})`, stroke: `rgba(255,122,122,${a})` }); app.text(S.toast, 640, y, { size: 20, bold: true, align: 'center', color: COL.bad, alpha: a }); }
}

// =====================================================================================================================
// SHOP
// =====================================================================================================================
const QUIPS = {
  greet: ['Everything here fell off something.', 'Cash only. Mostly cash.', 'Mind the lantern. It bites.', 'You look structurally unsound. Browse.', 'Prices are firm. So is my grip.', 'No refunds. No receipts. No eye contact.', 'Fresh stock. Nobody asked where from.'],
  buy: ['Pleasure. Do not open it near me.', 'Sold. Warranty void on contact.', 'Good choice. I stopped asking why.', 'Another satisfied wound.', 'That one was cursed. Mildly.'],
  graft: ['Stitched. Do not read the fine print.', 'On it goes. Try not to feel it.', 'Neat work. Your card disagrees.'],
  broke: ['Coins, friend. The round kind.', 'My lantern sees your purse. It is thin.', 'Come back with more gold or fewer needs.'],
  full: ['Your pockets clink already. Drink something.'],
  remove: ['Gone. I will not ask.', 'Snip. The deck is lighter. The conscience is not.'],
  strip: ['Thread out, boon gone. Neat.', 'Unpicked. It will remember, quietly.'],
  idle: ['Take your time. I have none left.', 'Touch it and you own it.', 'Business is brisk. Or I am.'],
};
const pickQ = (k, seed) => { const a = QUIPS[k]; return a[(seed === undefined ? Math.floor(Math.random() * a.length) : seed) % a.length]; };
const hashStr = (s) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
const WHY = { gold: 'Not enough gold.', slots: 'Potion slots are full.', cantgraft: 'No card can take that graft.', sold: 'Already sold.', noshop: 'The stall is closed.' };

let S = null;
const CARD_X = (i) => 347 + i * 198, CARD_Y = 190;
const GRAFT_X = (i) => 270 + i * 220, GRAFT_Y = 362;
const POT_X = (i) => 270 + i * 220, POT_Y = 492;
const REL_X = 940, REL_Y = (i) => 362 + i * 112;

function say(kind, seed) { S.quip = pickQ(kind, seed); S.quipT = 0; S.react = 1; }
function hv(app, key, on) { const v = S.h[key] || 0; const n = clamp(v + (on ? 1 : -1) * app.dt * 9, 0, 1); S.h[key] = n; return EASE.out(n); }
function fail(app, why, key) {
  sfx(app, 'error'); S.fx.shake(0.35); S.shakeKey = key; S.shakeT = 0.4;
  S.toast = WHY[why] || 'Cannot do that.'; S.toastT = 1.8;
  if (why === 'gold') say('broke'); else if (why === 'slots') say('full');
}
function shakeX(key) { return S.shakeKey === key && S.shakeT > 0 ? Math.sin(S.shakeT * 70) * 9 * (S.shakeT / 0.4) : 0; }
function bought(app, spent, at, quip) {
  sfx(app, 'shopBuy'); sfx(app, 'coin');
  S.fx.burst(at.x, at.y, 'coin'); S.fx.float('-' + spent, 1190, 60, { color: COL.bad, size: 26 });
  S.fx.burst(1190, 40, 'coin', { n: 3, speed: 120 });
  say(quip);
}

function buyDirect(app, kind, index, at, price) {
  const run = app.shared.run;
  const r = RUN.shopBuy(run, kind, index);
  if (!r.ok) { fail(app, r.why, kind + index); return; }
  bought(app, price, at, 'buy');
}

function startGraftBuy(app, index) {
  const run = app.shared.run, it = run.pending.grafts[index];
  if (it.sold) return;
  if (run.gold < it.price) return fail(app, 'gold', 'graft' + index);
  const ok = run.deck.filter((i) => canGraft(i, it.id));
  if (!ok.length) return fail(app, 'cantgraft', 'graft' + index);
  const gr = GRAFTS[it.id];
  openCards(S.modal, {
    title: `Sew on ${gr.name}`, sub: `Weight ${gr.weight}. Boon: ${gr.boon}  Price: ${gr.price}`,
    cards: ok, info: (inst) => graftPreview(run, inst.uid, it.id),
    onPick: (inst) => {
      const before = cardSpec(inst), had = inst.grafts.length, tith = RUN.strainInfo(run, run.deck).tithed;
      const lines = graftPreview(run, inst.uid, it.id).lines, spent = it.price;
      const r = RUN.shopBuy(run, 'graft', index, inst.uid);
      if (!r.ok) return fail(app, r.why, 'graft' + index);
      void tith;
      S.anim = makeAnim('attach', { cx: 640, cy: 330, gid: it.id, specBefore: before, specAfter: cardSpec(inst), overload: had >= MAX_GRAFTS_NORMAL, tithe: RUN.strainInfo(run, run.deck).strain > 0, lines });
      bought(app, spent, { x: GRAFT_X(index) + 100, y: GRAFT_Y + 32 }, 'graft');
    },
  });
}

function startRemove(app) {
  const run = app.shared.run, price = RUN.servicePrice(run, 'remove');
  if (run.gold < price) return fail(app, 'gold', 'remove');
  openCards(S.modal, {
    title: 'Remove a card', sub: `Costs ${price} gold. Each removal this run costs more.`, cards: run.deck.slice(),
    info: (inst) => infoFromDeck(run, run.deck.filter((i) => i.uid !== inst.uid), [{ t: `${CARDS[inst.id].name} leaves your deck for good.`, c: COL.vellum }]),
    onPick: (inst) => {
      const spec = cardSpec(inst);
      const r = RUN.shopBuy(run, 'remove', 0, inst.uid);
      if (!r.ok) return fail(app, r.why, 'remove');
      S.anim = makeAnim('burn', { cx: 640, cy: 330, specBefore: spec });
      bought(app, price, { x: 420, y: 612 }, 'remove');
    },
  });
}

function startStrip(app) {
  const run = app.shared.run, price = RUN.servicePrice(run, 'strip');
  if (run.gold < price) return fail(app, 'gold', 'strip');
  const cards = run.deck.filter((i) => i.grafts.length);
  openCards(S.modal, {
    title: 'Strip a graft', sub: `Costs ${price} gold. The card stays. The boon is lost.`, cards,
    info: null, hint: 'Pick the card, then the graft to unpick.',
    onPick: (inst) => openGraftChoice(S.modal, {
      title: `Strip which graft from ${CARDS[inst.id].name}?`, inst,
      info: (gid) => infoFromDeck(run, stripDeck(run, inst.uid, gid), [{ t: `Loses: ${GRAFTS[gid].boon} Also frees: ${GRAFTS[gid].price}`, c: COL.vellum }]),
      onPick: (gid) => {
        const before = cardSpec(inst);
        const r = RUN.shopBuy(run, 'strip', 0, { uid: inst.uid, gid });
        if (!r.ok) return fail(app, r.why, 'strip');
        S.anim = makeAnim('strip', { cx: 640, cy: 330, gid, specBefore: before, specAfter: cardSpec(inst) });
        bought(app, price, { x: 740, y: 612 }, 'strip');
      },
    }),
  });
}

// ---- keeper -----------------------------------------------------------------------------------------------------
function drawKeeper(app, t) {
  const g = app.ctx, x = 135, foot = 560;
  const react = S.react, bob = Math.sin(t * 1.6) * 3 + react * 8 * Math.sin(react * 6);
  // shelf with jars behind
  g.save(); g.fillStyle = 'rgba(10,8,6,.7)'; g.fillRect(14, 300, 240, 8);
  [[40, 24], [78, 34], [120, 20], [158, 30], [206, 26]].forEach(([jx, jh], i) => { g.fillStyle = i % 2 ? 'rgba(60,90,70,.55)' : 'rgba(90,60,40,.6)'; g.fillRect(jx, 300 - jh, 22, jh); g.fillRect(jx + 4, 300 - jh - 5, 14, 5); });
  g.restore();
  // lantern glow
  const lx = x + 92 + Math.sin(t * 1.3) * 5, ly = foot - 180 + bob * 0.5 + Math.sin(t * 1.3) * 3;
  const flick = 0.85 + 0.15 * Math.sin(t * 9) + 0.1 * Math.sin(t * 23) + react * 0.4;
  g.save();
  const gl = g.createRadialGradient(lx, ly, 4, lx, ly, 230);
  gl.addColorStop(0, `rgba(255,200,100,${0.55 * flick})`); gl.addColorStop(1, 'rgba(255,170,60,0)');
  g.fillStyle = gl; g.fillRect(0, 150, 420, 520);
  // cloak
  g.translate(x, foot + bob); g.fillStyle = '#0b0908'; g.strokeStyle = 'rgba(255,190,100,.18)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(-86, 0); g.bezierCurveTo(-90, -120, -62, -190, -34, -236); g.quadraticCurveTo(0, -278, 34, -236); g.bezierCurveTo(62, -190, 90, -120, 86, 0); g.closePath(); g.fill(); g.stroke();
  // hood hollow and eyes
  g.fillStyle = '#000'; g.beginPath(); g.ellipse(0, -216, 27, 34, 0, 0, 6.283); g.fill();
  const blink = (t % 4.2) < 0.12 ? 0.1 : 1;
  g.fillStyle = `rgba(242,193,78,${0.9 * flick})`; g.shadowColor = COL.lamp; g.shadowBlur = 10;
  g.beginPath(); g.ellipse(-9, -220, 4, 4 * blink + 0.6, 0, 0, 6.283); g.ellipse(9, -220, 4, 4 * blink + 0.6, 0, 0, 6.283); g.fill(); g.shadowBlur = 0;
  // arm holding the lantern
  g.strokeStyle = '#0b0908'; g.lineWidth = 18; g.lineCap = 'round'; g.beginPath(); g.moveTo(52, -150); g.lineTo(lx - x - 6, ly - foot - bob - 24); g.stroke();
  g.restore();
  // lantern
  g.save(); g.translate(lx, ly); g.strokeStyle = '#2b2118'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -24); g.lineTo(0, -8); g.stroke();
  g.fillStyle = '#3a2c1c'; g.fillRect(-12, -8, 24, 4); g.fillRect(-12, 18, 24, 4);
  g.fillStyle = `rgba(255,214,120,${0.95 * Math.min(1, flick)})`; g.shadowColor = '#ffb347'; g.shadowBlur = 24; g.fillRect(-9, -4, 18, 22); g.shadowBlur = 0;
  g.strokeStyle = '#2b2118'; g.strokeRect(-9, -4, 18, 22); g.restore();
  // counter
  g.save(); const cg = g.createLinearGradient(0, 520, 0, 600); cg.addColorStop(0, '#4a3322'); cg.addColorStop(1, '#241810'); g.fillStyle = cg; g.fillRect(8, 520, 252, 70);
  g.fillStyle = 'rgba(255,190,100,.25)'; g.fillRect(8, 520, 252, 3); g.restore();
  // junk on the counter
  g.save(); g.fillStyle = '#6b5a3a'; g.fillRect(30, 506, 26, 14); g.fillStyle = '#7a2a2a'; g.fillRect(64, 500, 14, 20); g.fillStyle = '#9aa3a8'; g.fillRect(200, 510, 36, 10); g.restore();
}

function drawBubble(app) {
  const g = app.ctx, x = 14, y = 62, w = 244, h = 112;
  app.panel(x, y, w, h, { fill: 'rgba(14,12,10,.88)', stroke: 'rgba(242,193,78,.55)' });
  g.save(); g.fillStyle = 'rgba(14,12,10,.88)'; g.beginPath(); g.moveTo(x + 90, y + h); g.lineTo(x + 112, y + h + 22); g.lineTo(x + 130, y + h); g.fill(); g.restore();
  const n = Math.floor(S.quipT * 50), str = S.quip.slice(0, n);
  const full = app.wrap(S.quip, w - 28, 17, { italic: true });
  const shown = app.wrap(str, w - 28, 17, { italic: true });
  void full;
  shown.forEach((ln, i) => app.text(ln, x + 14, y + 12 + i * 22, { size: 17, italic: true, color: COL.vellum }));
}

export default {
  enter(app, params) {
    const run = app.shared.run;
    S = { fx: new Fx(), modal: { m: null }, h: {}, anim: null, toast: '', toastT: 0, shakeKey: null, shakeT: 0, react: 0, gold: run.gold, quip: '', quipT: 0, goldPop: 0, t: 0 };
    S.quip = pickQ('greet', hashStr(String(run.seed) + ':' + run.act + ':' + run.row + ':' + (run.node || '')));
    void params;
  },
  leave() { S = null; },
  update(app, dt) {
    if (!S) return;
    S.t += dt; S.quipT += dt; S.react = Math.max(0, S.react - dt * 1.4);
    S.shakeT = Math.max(0, S.shakeT - dt);
    const fdt = S.fx.update(dt);
    const run = app.shared.run;
    if (Math.abs(S.gold - run.gold) > 0.5) { S.gold = lerp(S.gold, run.gold, clamp(dt * 8, 0, 1)); } else S.gold = run.gold;
    if (S.anim) {
      if (updateAnim(app, S.anim, S.fx, fdt || 0) || (app.mouse.released && S.anim.t > 0.4)) S.anim = null;
    }
  },
  draw(app) {
    if (!S) return;
    const g = app.ctx, run = app.shared.run, flow = app.shared.flow, shop = run.pending;
    if (!shop || shop.kind !== 'shop') return;
    const so = S.fx.shakeOffset();
    const locked = !!(S.modal.m || S.anim);
    g.save(); g.translate(so.x, so.y);
    drawBackground(g, 'shop', S.t);
    const vg = g.createRadialGradient(640, 360, 200, 640, 360, 800); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)'); g.fillStyle = vg; g.fillRect(0, 0, 1280, 720);
    drawKeeper(app, S.t);
    drawBubble(app);
    app.blocked = locked || app.blocked;

    // ---- header ----
    const info = strainInfo(run);
    app.text('The Black Market', 270, 10, { size: 30, bold: true, color: COL.lamp, shadow: true });
    app.text('BUDGET', 600, 8, { size: 12, ui: true, bold: true, color: 'rgba(232,220,196,.7)' });
    drawGauge(app, 600, 26, 260, info);
    app.text(gaugeLabel(info), 600, 48, { size: 12, ui: true, color: info.strain ? COL.bad : 'rgba(232,220,196,.7)' });
    if (app.inRect(600, 4, 270, 60)) app.tooltip('Budget', `Total graft weight ${info.weight} against a Budget of ${info.budget}. Over it, each Strain point Tithes a Bare card (-25% numbers).` + (info.tithed.length ? `\nTithed now: ${info.tithed.map((u) => cardName(run, u)).join(', ')}.` : ''));
    if (app.button(`Deck (${run.deck.length})`, 930, 10, 130, 44, { size: 18 })) flow.openDeck();
    app.panel(1074, 10, 190, 44, { fill: 'rgba(14,12,10,.9)', stroke: rgba(BRASS, 0.7) });
    drawCoin(g, 1096, 32, 26 + S.goldPop * 0);
    app.text(String(Math.round(S.gold)), 1118, 16, { size: 26, bold: true, color: COL.gold, shadow: true });
    if (app.inRect(1074, 10, 190, 44)) app.tooltip('Gold', 'Spend it before the next fight does.');

    // ---- section labels ----
    const lab = (s, x, y) => app.text(s, x, y, { size: 12, ui: true, bold: true, color: 'rgba(232,220,196,.55)' });
    lab('CARDS FOR SALE', 270, 56); lab('GRAFT PATCHES', 270, 342); lab('POTIONS  ' + run.potions.length + '/' + RUN.potionSlots(run), 270, 474); lab('RELICS', REL_X, 342); lab('SERVICES', 270, 596);

    const priceTag = (cx, cy, price, sold) => {
      if (sold) return;
      const can = run.gold >= price, w = 78;
      app.panel(cx - w / 2, cy - 14, w, 28, { fill: 'rgba(10,8,6,.9)', stroke: can ? rgba(BRASS, 0.8) : 'rgba(179,38,58,.9)', r: 14 });
      drawCoin(g, cx - 20, cy, 18); app.text(String(price), cx - 6, cy - 11, { size: 19, bold: true, color: can ? COL.gold : COL.bad });
    };

    // ---- cards ----
    let hovered = null;
    shop.cards.forEach((it, i) => {
      const spec = cardSpec({ uid: -1 - i, id: it.id, grafts: [], up: 0 });
      const cx = CARD_X(i) + shakeX('card' + i), cy = CARD_Y, sc0 = 0.7;
      const over = !it.sold && app.inRect(CARD_X(i) - 77, cy - 108, 154, 217);
      const k = hv(app, 'c' + i, over);
      if (over) { app.cursor = 'pointer'; hovered = { i, spec, it }; }
      g.save(); if (k > 0.02) { g.shadowColor = 'rgba(242,193,78,.5)'; g.shadowBlur = 20 * k; }
      drawCard(g, spec, cx, cy - 8 * k, { scale: sc0 + 0.06 * k, dim: it.sold ? 0.6 : 0, glow: k * 0.5 });
      g.restore();
      if (it.sold) stamp(app, cx, cy, 'SOLD'); else priceTag(CARD_X(i), cy + 126, it.price, false);
      if (!it.sold && app.clicked(CARD_X(i) - 77, cy - 108, 154, 217)) buyDirect(app, 'card', i, { x: CARD_X(i), y: cy }, it.price);
    });
    if (hovered) app.tooltip(hovered.spec.name, `${typeLabel(hovered.spec)}, cost ${hovered.spec.cost}\n${cardLines(hovered.spec).join('\n')}\nBuying adds it to your deck for ${hovered.it.price} gold.`, { color: COL[hovered.spec.type] === undefined ? undefined : undefined });

    // ---- grafts ----
    shop.grafts.forEach((it, i) => {
      const gr = GRAFTS[it.id], x = GRAFT_X(i) + shakeX('graft' + i), y = GRAFT_Y, w = 205, h = 64;
      const over = !it.sold && app.inRect(GRAFT_X(i), y, w, 100), k = hv(app, 'g' + i, over);
      if (over) { app.cursor = 'pointer'; app.tooltip(gr.name, [...graftLines(gr), `Sews onto one of your cards. ${it.price} gold.`].join('\n'), { color: COL[gr.school] }); }
      g.save(); if (it.sold) g.globalAlpha = 0.45; g.translate(0, -3 * k);
      drawGraftPatch(g, gr, x, y, w, h, { hover: k });
      g.restore();
      if (it.sold) stamp(app, x + w / 2, y + h / 2, 'SOLD'); else priceTag(GRAFT_X(i) + w / 2, y + h + 26, it.price, false);
      if (!it.sold && app.clicked(GRAFT_X(i), y, w, 100)) startGraftBuy(app, i);
    });

    // ---- potions ----
    shop.potions.forEach((it, i) => {
      const p = POTIONS[it.id], x = POT_X(i) + shakeX('potion' + i), y = POT_Y, w = 205, h = 84;
      const over = !it.sold && app.inRect(POT_X(i), y, w, h), k = hv(app, 'p' + i, over);
      app.panel(x, y - 2 * k, w, h, { fill: over ? 'rgba(52,42,32,.95)' : 'rgba(26,22,20,.88)', stroke: over ? COL.lamp : 'rgba(232,220,196,.3)' });
      g.save(); if (it.sold) g.globalAlpha = 0.4;
      drawPotion(g, it.id, x + 30, y + h / 2 - 2 * k, 40);
      app.text(p.name, x + 56, y + 8 - 2 * k, { size: 15, bold: true, color: COL.vellum, maxW: w - 62 });
      app.text(p.text, x + 56, y + 28 - 2 * k, { size: 12, ui: true, color: 'rgba(232,220,196,.75)', maxW: w - 64, lineH: 14 });
      g.restore();
      if (it.sold) stamp(app, x + w / 2, y + h / 2, 'SOLD'); else priceTag(x + w - 46, y + h - 18, it.price, false);
      if (over) { app.cursor = 'pointer'; app.tooltip(p.name, `${p.rarity}\n${p.text}\nPotion slots ${run.potions.length}/${RUN.potionSlots(run)}. ${it.price} gold.`); }
      if (!it.sold && app.clicked(POT_X(i), y, w, h)) buyDirect(app, 'potion', i, { x: x + 30, y: y + 38 }, it.price);
    });

    // ---- relics ----
    shop.relics.forEach((it, i) => {
      const r = RELICS[it.id], x = REL_X + shakeX('relic' + i), y = REL_Y(i), w = 310, h = 92;
      const over = !it.sold && app.inRect(REL_X, y, w, h), k = hv(app, 'r' + i, over);
      app.panel(x, y - 2 * k, w, h, { fill: over ? 'rgba(52,42,32,.95)' : 'rgba(26,22,20,.88)', stroke: over ? COL.lamp : rgba(BRASS, 0.5), lw: 2 });
      g.save(); if (it.sold) g.globalAlpha = 0.4;
      drawRelic(g, it.id, x + 40, y + h / 2 - 2 * k, 56);
      app.text(r.name, x + 76, y + 8 - 2 * k, { size: 18, bold: true, color: COL.lamp, maxW: w - 86 });
      app.text(r.text, x + 76, y + 31 - 2 * k, { size: 13, ui: true, color: 'rgba(232,220,196,.85)', maxW: w - 90, lineH: 15 });
      g.restore();
      if (it.sold) stamp(app, x + w / 2, y + h / 2, 'SOLD'); else priceTag(x + w - 52, y + h - 18, it.price, false);
      if (over) { app.cursor = 'pointer'; app.tooltip(r.name, `${r.rarity} relic\n${r.text}\n${it.price} gold.`, { color: COL.lamp }); }
      if (!it.sold && app.clicked(REL_X, y, w, h)) buyDirect(app, 'relic', i, { x: x + 40, y: y + 46 }, it.price);
    });

    // ---- services ----
    const rp = RUN.servicePrice(run, 'remove'), sp = RUN.servicePrice(run, 'strip');
    const grafted = run.deck.some((c) => c.grafts.length);
    if (app.button('Remove a card', 270, 614, 300, 66, { size: 22, sub: `${rp} gold`, subColor: run.gold >= rp ? COL.gold : COL.bad })) startRemove(app);
    if (app.inRect(270, 614, 300, 66)) app.tooltip('Remove a card', `Delete one card from the deck for ${rp} gold. The price rises with every removal this run (${run.shopUses.remove} so far).`);
    const stripDis = !grafted;
    if (app.button('Strip a graft', 590, 614, 300, 66, { size: 22, disabled: stripDis, sub: sp === 0 ? 'Free' : `${sp} gold`, subColor: run.gold >= sp ? COL.gold : COL.bad })) startStrip(app);
    if (app.inRect(590, 614, 300, 66)) app.tooltip('Strip a graft', stripDis ? 'None of your cards carry a graft.' : `Pick a card, then one of its grafts. The graft and its boon are lost, its price goes with it. ${sp === 0 ? 'Free this once.' : sp + ' gold.'}`);
    const stripTitle = null; void stripTitle;
    if (app.button('LEAVE', 940, 600, 310, 90, { size: 38, fill: '#4a2a1c', stroke: COL.lamp })) { RUN.advance(run); flow.route(); }
    if (app.inRect(940, 600, 310, 90)) app.tooltip('Leave the market', 'Back to the map. Unsold stock stays here.');

    toastDraw(app, S, 560);
    S.fx.draw(g);
    g.restore();
    S.fx.drawFlash(g, 1280, 720);

    // ---- overlays ----
    app.blocked = false;
    if (S.anim) { drawAnim(app, S.anim, S.fx); S.fx.draw(g); if (S.anim.t > 0.4) app.text('click to skip', 640, 700, { size: 13, ui: true, align: 'center', color: 'rgba(232,220,196,.5)' }); }
    else if (S.modal.m) { drawModal(app, S.modal, run); }
  },
};
