// DECK VIEW: modal overlay (app.push('deckview', opts)). Shows the run deck with the Budget / Strain / Tithe picture.
//   opts: { mode: 'view'|'pick', filter(inst)->bool, title, onPick(inst | inst[]), onCancel(), multi: true|N }
// Pick mode: the clicked inst goes to opts.onPick AFTER the view has closed (so the caller can flow.route() cleanly).
// Also exports reusable helpers: scrollArea, cardGrid, gaugeCells, resonanceStrip, pill.
import { COL, W, H, FONT, clamp, rgba, EASE } from './core.js';
import { drawCard, drawSchoolGlyph, CARD_W, CARD_H } from '../art/cards.js';
import { CARDS, GRAFTS, SCHOOLS } from '../data/index.js';
import { cardSpec, strainInfo, isBare, instWeight, MAX_GRAFTS_NORMAL } from '../engine/cards.js';
import { resonanceOf } from '../engine/resonance.js';

const reduceMotion = (app) => !!(app.shared.meta && app.shared.meta.settings && app.shared.meta.settings.reduceMotion);
const plural = (n, w) => (n === 1 ? w : w + 's');

// ---------------------------------------------------------------- small widgets
export function pill(app, text, cx, cy, color, o = {}) {
  const ctx = app.ctx, size = o.size || 11;
  const w = app.measure(text, size, { ui: true, bold: true }) + 12;
  ctx.save();
  app.rr(cx - w / 2, cy - 8, w, 16, 8);
  ctx.fillStyle = o.fill || 'rgba(10,8,7,.9)'; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = color; ctx.stroke();
  ctx.restore();
  app.text(text, cx, cy - size * 0.62, { size, bold: true, ui: true, align: 'center', color: o.color || color });
  return w;
}

// Cut text to at most `n` lines (adds an ellipsis). Returns the string.
export function clampText(app, str, maxW, size, n, o = {}) {
  const lines = app.wrap(str, maxW, size, o);
  if (lines.length <= n) return str;
  let last = lines[n - 1];
  while (last.length > 1 && app.measure(last + '...', size, o) > maxW) last = last.slice(0, -1);
  return lines.slice(0, n - 1).concat(last.trimEnd() + '...').join('\n');
}

// ---------------------------------------------------------------- scroll area
// st: caller-owned { scroll, target }. draw(top) receives the y of the content origin (view top minus scroll).
export function scrollArea(app, st, x, y, w, h, contentH, draw) {
  const ctx = app.ctx;
  if (st.scroll === undefined) { st.scroll = 0; st.target = 0; }
  const max = Math.max(0, contentH - h);
  st.max = max; st.view = { x, y, w, h };
  const sbX = x + w - 10;
  const thumbH = max > 0 ? Math.max(36, (h * h) / contentH) : 0;
  const thumbOf = () => (max > 0 ? y + (st.scroll / max) * (h - thumbH) : y);
  if (max > 0) {
    if (app.inRect(x, y, w, h) && app.mouse.wheel) st.target += app.mouse.wheel * 0.7;
    if (app.mouse.pressed && app.inRect(sbX - 6, y, 22, h)) {
      const ty = thumbOf();
      if (app.mouse.y >= ty && app.mouse.y <= ty + thumbH) st.drag = { dy: app.mouse.y - ty };
      else { st.drag = { dy: thumbH / 2 }; }
    }
    if (st.drag) {
      if (app.mouse.down) { const ty = clamp(app.mouse.y - st.drag.dy, y, y + h - thumbH); st.target = st.scroll = ((ty - y) / (h - thumbH)) * max; app.cursor = 'grabbing'; }
      else st.drag = null;
    }
  }
  st.target = clamp(st.target, 0, max);
  if (reduceMotion(app) || st.drag) st.scroll = st.target;
  else st.scroll += (st.target - st.scroll) * Math.min(1, app.dt * 16);
  if (Math.abs(st.target - st.scroll) < 0.4) st.scroll = st.target;
  st.scroll = clamp(st.scroll, 0, max);

  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  draw(y - st.scroll);
  ctx.restore();

  if (max > 0) {
    ctx.save();
    app.rr(sbX, y, 8, h, 4); ctx.fillStyle = 'rgba(232,220,196,.10)'; ctx.fill();
    const hot = st.drag || app.inRect(sbX - 4, thumbOf(), 16, thumbH);
    app.rr(sbX, thumbOf(), 8, thumbH, 4); ctx.fillStyle = hot ? COL.lamp : 'rgba(232,220,196,.5)'; ctx.fill();
    ctx.restore();
    if (hot) app.cursor = 'pointer';
  }
}
export function inView(app, st, x, y, w, h) { const v = st.view; return !!v && app.inRect(v.x, v.y, v.w, v.h) && app.inRect(x, y, w, h); }
export function clickedIn(app, st, x, y, w, h) { const v = st.view; return !!v && app.inRect(v.x, v.y, v.w, v.h) && app.clicked(x, y, w, h); }

// ---------------------------------------------------------------- card grid
// items: [{ spec, tithed, jam, onClick(item, i), label, dim, disabled, selected, badges: [{text,color}] }]
// st: caller-owned state { scroll, target, focus, kb }. Returns { hover, cols, rowH }.
export function cardGrid(app, items, x, y, w, h, o = {}) {
  const ctx = app.ctx, st = o.state || (o.state = {});
  const sc = o.scale || 0.62, cw = CARD_W * sc, ch = CARD_H * sc, gap = o.gap === undefined ? 12 : o.gap;
  const hasLabel = items.some((it) => it.label);
  const rowH = ch + gap + (hasLabel ? 20 : 0);
  const sbw = 16;
  const cols = Math.max(1, Math.floor((w - sbw - gap) / (cw + gap)));
  const gridW = cols * cw + (cols - 1) * gap, ox = x + Math.max(gap, (w - sbw - gridW) / 2);
  const rows = Math.ceil(items.length / cols);
  const contentH = items.length ? rows * rowH + gap : 0;
  st.cols = cols; st.rowH = rowH;
  if (st.focus === undefined) st.focus = -1;
  if (st.focus >= items.length) st.focus = items.length - 1;
  if (st.reveal && st.focus >= 0) {
    const rel = gap + Math.floor(st.focus / cols) * rowH;
    if (rel < (st.target || 0)) st.target = rel - gap;
    else if (rel + rowH > (st.target || 0) + h) st.target = rel + rowH - h + gap;
    st.reveal = false;
  }
  let hover = -1;
  if (!items.length) {
    app.text(o.empty || 'Nothing here.', x + w / 2, y + h / 2 - 12, { size: 20, align: 'center', color: 'rgba(232,220,196,.55)', italic: true });
    st.view = { x, y, w, h }; st.max = 0; st.scroll = st.target = 0;
    return { hover, cols, rowH };
  }
  const pend = [];
  scrollArea(app, st, x, y, w, h, contentH, (top) => {
    const r0 = Math.max(0, Math.floor((y - top - gap) / rowH)), r1 = Math.min(rows - 1, Math.ceil((y + h - top) / rowH));
    for (let r = r0; r <= r1; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c; if (i >= items.length) break;
        const it = items[i];
        const left = ox + c * (cw + gap), cardTop = top + gap + r * rowH;
        const over = inView(app, st, left, cardTop, cw, ch);
        if (over) { hover = i; st.kb = false; }
      }
    }
    if (hover < 0 && st.kb && st.focus >= 0) hover = st.focus;
    for (let r = r0; r <= r1; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c; if (i >= items.length) break;
        const it = items[i];
        const left = ox + c * (cw + gap), cardTop = top + gap + r * rowH;
        const hot = hover === i && !it.disabled;
        const cx = left + cw / 2, cy = cardTop + ch / 2 - (hot ? 4 : 0);
        if (it.spec) {
          drawCard(ctx, it.spec, cx, cy, { scale: sc * (hot ? 1.04 : 1), tithed: !!it.tithed, jam: !!it.jam, glow: hot ? 0.6 : 0, selected: !!it.selected, dim: it.dim ? 0.55 : 0, hover: hot });
        }
        if (it.selected) { ctx.save(); app.rr(left - 3, cardTop - 3, cw + 6, ch + 6, 8); ctx.lineWidth = 3; ctx.strokeStyle = COL.lamp; ctx.stroke(); ctx.restore(); }
        if (st.kb && st.focus === i) { ctx.save(); app.rr(left - 4, cardTop - 4, cw + 8, ch + 8, 9); ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.strokeStyle = COL.vellum; ctx.stroke(); ctx.restore(); }
        if (it.badges && it.badges.length) {
          // pills along the bottom edge of the card
          const ws = it.badges.map((b) => app.measure(b.text, 11, { ui: true, bold: true }) + 12);
          const tot = ws.reduce((a, b) => a + b, 0) + (ws.length - 1) * 3;
          let px = cx - tot / 2;
          it.badges.forEach((b, k) => { pill(app, b.text, px + ws[k] / 2, cardTop + ch - 12, b.color); px += ws[k] + 3; });
        }
        if (it.label) app.text(it.label, cx, cardTop + ch + 3, { size: 14, ui: true, bold: true, align: 'center', color: it.labelColor || COL.vellum });
        if (over && !it.disabled) app.cursor = 'pointer';
        if (!it.disabled && it.onClick && ((over && app.clicked(left, cardTop, cw, ch)) || (st.kb && st.focus === i && st.activate))) pend.push([it, i]);
      }
    }
  });
  st.activate = false;
  for (const [it, i] of pend) { it.onClick(it, i); break; }
  return { hover, cols, rowH };
}
// Keyboard navigation for a cardGrid state. Returns true when the key was used.
export function gridKey(st, e, count) {
  if (!count) return false;
  const cols = st.cols || 1, k = e.key;
  const mv = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[k];
  if (mv !== undefined) {
    st.kb = true; st.reveal = true;
    st.focus = st.focus < 0 ? 0 : clamp(st.focus + mv, 0, count - 1);
    return true;
  }
  if (k === 'Enter' || k === ' ') { if (st.focus >= 0) { st.kb = true; st.activate = true; return true; } }
  if (k === 'PageDown') { st.target = (st.target || 0) + (st.view ? st.view.h * 0.8 : 300); return true; }
  if (k === 'PageUp') { st.target = (st.target || 0) - (st.view ? st.view.h * 0.8 : 300); return true; }
  if (k === 'Home') { st.target = 0; if (st.kb) { st.focus = 0; } return true; }
  if (k === 'End') { st.target = 1e6; if (st.kb) { st.focus = count - 1; } return true; }
  return false;
}

// ---------------------------------------------------------------- Budget gauge (cells + brackets)
// One cell per weight point. Cells inside the Budget are parchment, cells over it are red (Strain).
export function gaugeCells(app, x, y, info, o = {}) {
  const ctx = app.ctx, total = Math.max(info.budget, info.weight, 1), gap = 3;
  const cell = Math.min(o.cell || 24, ((o.maxW || 340) - 8 - total * gap) / total);
  const cx = (i) => x + i * (cell + gap) + (i >= info.budget ? 8 : 0);
  for (let i = 0; i < total; i++) {
    const left = cx(i), full = i < info.weight, over = i >= info.budget;
    if (over && !full) continue;
    ctx.save();
    app.rr(left, y, cell, cell, 4);
    ctx.fillStyle = !full ? 'rgba(232,220,196,.07)' : over ? COL.scar : COL.vellum; ctx.fill();
    ctx.lineWidth = 1.6; ctx.strokeStyle = !full ? 'rgba(232,220,196,.4)' : over ? '#ff7a7a' : COL.vellum2; ctx.stroke();
    if (full) { // stitch mark
      ctx.strokeStyle = over ? 'rgba(255,200,200,.85)' : 'rgba(43,30,26,.7)'; ctx.lineWidth = 1.8; ctx.beginPath();
      ctx.moveTo(left + cell * 0.28, y + cell * 0.28); ctx.lineTo(left + cell * 0.72, y + cell * 0.72);
      ctx.moveTo(left + cell * 0.72, y + cell * 0.28); ctx.lineTo(left + cell * 0.28, y + cell * 0.72); ctx.stroke();
    }
    ctx.restore();
  }
  // brackets
  const by = y + cell + 5;
  const bEnd = cx(info.budget - 1) + cell, bStart = x;
  ctx.save(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(232,220,196,.6)';
  ctx.beginPath(); ctx.moveTo(bStart, by - 2); ctx.lineTo(bStart, by); ctx.lineTo(bEnd, by); ctx.lineTo(bEnd, by - 2); ctx.stroke();
  ctx.restore();
  app.text(`Budget ${info.budget}`, (bStart + bEnd) / 2, by + 3, { size: 13, ui: true, bold: true, align: 'center', color: COL.vellum });
  if (info.strain > 0) {
    const sStart = cx(info.budget), sEnd = cx(info.weight - 1) + cell;
    ctx.save(); ctx.lineWidth = 2; ctx.strokeStyle = COL.bad;
    ctx.beginPath(); ctx.moveTo(sStart, by - 2); ctx.lineTo(sStart, by); ctx.lineTo(sEnd, by); ctx.lineTo(sEnd, by - 2); ctx.stroke();
    ctx.restore();
    app.text(`Strain ${info.strain}`, sStart, by + 3, { size: 13, ui: true, bold: true, color: COL.bad });
  }
  return { w: cx(total - 1) + cell - x, h: cell + 24 };
}

// ---------------------------------------------------------------- school resonance strip
export function resonanceStrip(app, run, x, y, w, h) {
  const ctx = app.ctx, res = resonanceOf(run);
  app.panel(x, y, w, h, { r: 8, fill: 'rgba(14,12,10,.7)', stroke: 'rgba(232,220,196,.22)', lw: 1.5 });
  const ids = SCHOOLS ? Object.keys(SCHOOLS) : [];
  const colW = (w - 12) / ids.length;
  ids.forEach((id, k) => {
    const s = SCHOOLS[id], n = res.counts[id] || 0, tier = res.tiers[id] || 0;
    const left = x + 10 + k * colW, inner = colW - 14, col = s.color || COL[id] || COL.vellum;
    const lit = n > 0;
    ctx.save(); ctx.globalAlpha = lit ? 1 : 0.5;
    drawSchoolGlyph(ctx, id, left + 8, y + 15, 7, col);
    app.text(s.name, left + 20, y + 5, { size: 15, bold: true, color: lit ? COL.vellum : 'rgba(232,220,196,.6)' });
    app.text(`${n}`, left + inner, y + 4, { size: 17, bold: true, align: 'right', color: tier ? col : COL.vellum, ui: true });
    // track with ticks at 3 and 6
    const ty = y + 27, tw = inner;
    app.rr(left, ty, tw, 7, 3.5); ctx.fillStyle = 'rgba(232,220,196,.14)'; ctx.fill();
    if (n > 0) { app.rr(left, ty, Math.max(7, tw * Math.min(n, 6) / 6), 7, 3.5); ctx.fillStyle = col; ctx.fill(); }
    for (const t of [3, 6]) {
      const tx = left + (tw * t) / 6 - (t === 6 ? 1 : 0);
      ctx.fillStyle = n >= t ? COL.lamp : 'rgba(232,220,196,.7)'; ctx.fillRect(tx - 1, ty - 3, 2, 13);
    }
    ctx.restore();
    const txt = tier ? (s.resonance[tier] || '') : `At 3: ${s.resonance[3] || ''}`;
    app.text(clampText(app, txt, inner, 12, 3, { ui: true }), left, y + 40, { size: 12, ui: true, maxW: inner, lineH: 13, color: tier ? COL.vellum : 'rgba(232,220,196,.5)' });
    if (app.inRect(left - 4, y, colW, h)) app.tooltip(`${s.name}: ${n} ${plural(n, 'graft')}`, `3 grafts: ${s.resonance[3]}\n6 grafts: ${s.resonance[6]}\n${s.blurb || ''}`, { color: col });
  });
}

// ---------------------------------------------------------------- the screen
const TYPE_TABS = [['all', 'All'], ['attack', 'Attack'], ['skill', 'Skill'], ['power', 'Power'], ['junk', 'Junk']];
const SORTS = [['order', 'Order'], ['name', 'Name'], ['cost', 'Cost'], ['weight', 'Weight']];
const costKey = (c) => (c === 'X' ? 9 : c);

function chip(app, label, x, y, w, active, o = {}) {
  return app.button(label, x, y, w, 28, { size: 14, ui: true, fill: active ? '#5a4720' : COL.slab2, stroke: active ? COL.lamp : 'rgba(232,220,196,.4)', color: active ? COL.lamp : COL.vellum, r: 6, ...o });
}

export default {
  enter(app, params) {
    this.o = params || {};
    this.pick = this.o.mode === 'pick';
    this.st = { scroll: 0, target: 0, focus: -1 };
    this.type = 'all'; this.grafted = false; this.bare = false; this.sort = 'order';
    this.sel = new Set(); this.pending = null; this.anim = reduceMotion(app) ? 1 : 0;
    this.hoverIdx = -1;
  },
  leave() { this.pending = null; },
  close(app, cancelled) {
    if (app.top() !== this) return;
    app.pop();
    if (cancelled && this.o.onCancel) this.o.onCancel();
  },
  limit() { return this.o.multi ? (this.o.multi === true ? 99 : this.o.multi) : 1; },
  key(app, e) {
    if (app.top() !== this) return false;
    if (e.key === 'Escape') { this.close(app, true); return true; }
    return gridKey(this.st, e, this.count || 0);
  },
  list(run) {
    const eligible = (i) => !this.pick || !this.o.filter || this.o.filter(i);
    let arr = run.deck.map((inst, order) => ({ inst, order, spec: cardSpec(inst), base: CARDS[inst.id] }));
    if (this.type !== 'all') arr = arr.filter((c) => c.base.type === this.type);
    if (this.grafted) arr = arr.filter((c) => c.inst.grafts.length > 0);
    if (this.bare) arr = arr.filter((c) => isBare(c.inst));
    const by = {
      order: (a, b) => a.order - b.order,
      name: (a, b) => a.spec.name.localeCompare(b.spec.name) || a.order - b.order,
      cost: (a, b) => costKey(a.spec.cost) - costKey(b.spec.cost) || a.spec.name.localeCompare(b.spec.name),
      weight: (a, b) => instWeight(b.inst) - instWeight(a.inst) || a.spec.name.localeCompare(b.spec.name),
    }[this.sort];
    arr.sort(by);
    arr.forEach((c) => { c.ok = eligible(c.inst); });
    return arr;
  },
  draw(app) {
    const ctx = app.ctx, run = app.shared.run;
    this.pending = null;
    if (this.anim < 1) this.anim = Math.min(1, this.anim + app.dt / 0.16);
    const k = EASE.out(this.anim);
    // backdrop
    ctx.save(); ctx.fillStyle = `rgba(6,4,3,${0.8 * k})`; ctx.fillRect(0, 0, W, H); ctx.restore();
    ctx.save(); ctx.globalAlpha = k; ctx.translate(0, (1 - k) * 14);
    const PX = 14, PY = 10, PW = W - 28, PH = H - 20;
    app.panel(PX, PY, PW, PH, { r: 14, fill: '#1c1714', stroke: 'rgba(232,220,196,.5)', lw: 3 });
    if (app.mouse.pressed && !app.inRect(PX, PY, PW, PH) && !this.pick && !app.blocked) this.pending = () => this.close(app, false);
    if (!run) { app.text('No run in progress.', W / 2, 340, { size: 24, align: 'center' }); ctx.restore(); return; }

    const info = strainInfo(run);
    const tithedSet = new Set(info.tithed);
    const all = this.list(run);
    this.count = all.length;

    // ---- header: title
    const title = this.o.title || (this.pick ? 'Choose a card' : 'Your Deck');
    app.text(title, 36, 20, { size: 28, bold: true, color: COL.lamp });
    const sub = this.pick ? 'Click a card. Esc to cancel.' : `${run.deck.length} cards`;
    app.text(sub, 38, 56, { size: 15, ui: true, color: 'rgba(232,220,196,.7)' });
    // gauge
    const gx = 270, gy = 24;
    const gb = gaugeCells(app, gx, gy, info, { maxW: 330 });
    app.text(`Weight ${info.weight} of Budget ${info.budget}`, gx, gy + gb.h + 8, { size: 14, ui: true, color: 'rgba(232,220,196,.75)' });
    if (app.inRect(gx, gy, gb.w, gb.h + 8)) app.tooltip('Budget', 'Each graft has a Weight of 1 to 3. Your deck carries as much Weight as its Budget for free. Every point over is Strain.');
    // strain block
    const sx = 640, sw = 520;
    if (info.strain > 0) {
      app.text(`Strain ${info.strain}`, sx, 12, { size: 24, bold: true, color: COL.bad });
      let yy = 42;
      yy += app.text('Strain falls on your plain cards: they fight at 75 percent.', sx, yy, { size: 15, ui: true, maxW: sw, lineH: 17 });
      const names = info.tithed.map((u) => { const inst = run.deck.find((d) => d.uid === u); return CARDS[inst.id].name; });
      const shown = names.slice(0, 6).join(', ') + (names.length > 6 ? ` and ${names.length - 6} more` : '');
      if (names.length) {
        app.text('Tithed this combat:', sx, yy, { size: 15, ui: true, color: COL.vellum });
        yy += app.text(shown + '.', sx + app.measure('Tithed this combat: ', 15, { ui: true }), yy, { size: 15, ui: true, bold: true, color: COL.bad, maxW: sw - 140, lineH: 17 });
      } else { yy += app.text('No plain card is left to tithe.', sx, yy, { size: 15, ui: true, color: COL.bad, lineH: 17 }); }
      if (info.overflow > 0) app.text(`Backfire: ${info.backfire} grafted ${plural(info.backfire, 'card')} jam${info.backfire === 1 ? 's' : ''} each turn.`, sx, yy + 1, { size: 15, ui: true, bold: true, color: '#ffb35a', maxW: sw });
    } else {
      app.text('No Strain', sx, 12, { size: 24, bold: true, color: COL.good });
      const left = info.budget - info.weight;
      app.text(left > 0 ? `${left} Weight to spare before your plain cards start paying.` : 'Budget is full. One more Weight and a plain card is Tithed.', sx, 42, { size: 15, ui: true, maxW: sw, lineH: 17 });
      app.text('Every card fights at full strength.', sx, 77, { size: 15, ui: true, color: 'rgba(232,220,196,.6)' });
    }
    if (this.pending === null && app.button('X', W - 62, 20, 36, 36, { size: 20, ui: true, key: undefined, r: 18 })) this.pending = () => this.close(app, true);

    // ---- tabs row
    let tx = 36; const ty = 110;
    for (const [id, label] of TYPE_TABS) {
      const n = id === 'all' ? run.deck.length : run.deck.filter((d) => CARDS[d.id].type === id).length;
      if (id === 'junk' && n === 0 && this.type !== 'junk') continue;
      const lw = Math.max(56, app.measure(label, 14, { ui: true, bold: true }) + 28);
      if (chip(app, label, tx, ty, lw, this.type === id)) { this.type = id; this.st.target = 0; this.st.focus = -1; }
      tx += lw + 6;
    }
    tx += 12;
    if (chip(app, 'Grafted only', tx, ty, 108, this.grafted)) { this.grafted = !this.grafted; this.st.target = 0; }
    tx += 114;
    if (chip(app, 'Bare only', tx, ty, 90, this.bare)) { this.bare = !this.bare; this.st.target = 0; }
    tx += 108;
    app.text('Sort', tx, ty + 6, { size: 14, ui: true, color: 'rgba(232,220,196,.6)' }); tx += 38;
    for (const [id, label] of SORTS) {
      const lw = Math.max(54, app.measure(label, 14, { ui: true, bold: true }) + 24);
      if (chip(app, label, tx, ty, lw, this.sort === id)) { this.sort = id; this.st.target = 0; }
      tx += lw + 5;
    }
    app.text(`${all.length} of ${run.deck.length}`, W - 40, ty + 6, { size: 14, ui: true, align: 'right', color: 'rgba(232,220,196,.6)' });

    // ---- main: grid
    const MY = 148, MH = 466;
    const items = all.map((c) => {
      const w = instWeight(c.inst), tithed = tithedSet.has(c.inst.uid);
      const badges = [];
      if (tithed) badges.push({ text: 'TITHED', color: COL.bad });
      if (c.spec.overload) badges.push({ text: 'OVERLOAD', color: COL.gold });
      else if (w > 0) badges.push({ text: `WEIGHT ${w}`, color: COL.vellum });
      return {
        spec: c.spec, tithed, inst: c.inst, badges, weight: w,
        dim: this.pick && !c.ok, disabled: this.pick && !c.ok, selected: this.sel.has(c.inst.uid),
        onClick: () => this.choose(app, c.inst),
      };
    });
    const emptyMsg = this.pick ? 'No card can take this.' : this.grafted ? 'No grafted cards yet. Graft one after a fight.' : this.bare ? 'Every card here has a graft.' : 'Nothing matches.';
    const g = cardGrid(app, items, 30, MY, 690, MH, { state: this.st, scale: 0.56, gap: 10, empty: emptyMsg });
    if (this.pick && g.hover >= 0 && items[g.hover].disabled) app.tooltip('Cannot choose', 'This card does not qualify.');
    this.hoverIdx = g.hover;
    const hv = g.hover >= 0 ? items[g.hover] : null;

    // ---- preview + details
    this.drawPreview(app, run, hv, info, 734, MY, 244, MH);
    this.drawSide(app, run, hv, info, 988, MY, 262, MH);

    // ---- resonance
    resonanceStrip(app, run, 28, 620, W - 56, 76);
    ctx.restore();
    if (this.pending) this.pending();
  },
  choose(app, inst) {
    if (!this.pick) return;
    if (this.o.multi) {
      if (this.sel.has(inst.uid)) this.sel.delete(inst.uid);
      else if (this.sel.size < this.limit()) this.sel.add(inst.uid);
      return;
    }
    this.pending = () => { if (app.top() !== this) return; app.pop(); if (this.o.onPick) this.o.onPick(inst); };
  },
  drawPreview(app, run, hv, info, x, y, w, h) {
    const ctx = app.ctx;
    app.panel(x, y, w, h, { r: 10, fill: 'rgba(10,8,7,.55)', stroke: 'rgba(232,220,196,.2)', lw: 1.5 });
    if (!hv) {
      ctx.save(); ctx.globalAlpha = 0.35; drawCard(ctx, cardSpec({ uid: 0, id: run.deck[0] ? run.deck[0].id : 'm_cut', grafts: [], up: 0 }), x + w / 2, y + 190, { scale: 1.0, dim: 0.7 }); ctx.restore();
      app.text('Hover a card', x + w / 2, y + 180, { size: 22, italic: true, align: 'center', color: COL.vellum, shadow: true });
      app.text('to see its grafts', x + w / 2, y + 208, { size: 16, ui: true, align: 'center', color: 'rgba(232,220,196,.7)', shadow: true });
      return;
    }
    drawCard(ctx, hv.spec, x + w / 2, y + 16 + (CARD_H * 1.1) / 2, { scale: 1.1, tithed: hv.tithed, glow: 0.35, hover: true, preview: true });
    const py = y + 16 + CARD_H * 1.1 + 22;
    const tags = [];
    if (hv.tithed) tags.push(['TITHED', COL.bad]);
    if (hv.spec.overload) tags.push(['OVERLOAD', COL.gold]);
    if (isBare(hv.inst)) tags.push(['PLAIN', COL.vellum]);
    else if (hv.inst.grafts.length) tags.push([`${hv.inst.grafts.length} ${plural(hv.inst.grafts.length, 'GRAFT')}`, COL.vellum]);
    const ws = tags.map((t) => app.measure(t[0], 11, { ui: true, bold: true }) + 12);
    let px = x + w / 2 - (ws.reduce((a, b) => a + b, 0) + (ws.length - 1) * 4) / 2;
    tags.forEach((t, i) => { pill(app, t[0], px + ws[i] / 2, py, t[1], { size: 12 }); px += ws[i] + 4; });
  },
  drawSide(app, run, hv, info, x, y, w, h) {
    const ctx = app.ctx, pad = 12;
    app.panel(x, y, w, h, { r: 10, fill: 'rgba(10,8,7,.55)', stroke: 'rgba(232,220,196,.2)', lw: 1.5 });
    let yy = y + pad;
    if (!hv) {
      if (this.pick) {
        const ok = this.list(run).filter((c) => c.ok).length;
        yy += app.text(this.o.title ? this.o.title : 'Choose a card', x + pad, yy, { size: 19, bold: true, color: COL.lamp, maxW: w - 2 * pad });
        yy += 4;
        yy += app.text(`${ok} ${plural(ok, 'card')} can be chosen.${this.o.multi ? ` Pick up to ${this.limit()}.` : ''}`, x + pad, yy, { size: 14, ui: true, maxW: w - 2 * pad, color: COL.vellum }) + 10;
      }
      yy += app.text('How the Budget works', x + pad, yy, { size: 18, bold: true, color: COL.lamp }) + 4;
      const rows = [
        ['Weight', COL.vellum, 'Every graft weighs 1 to 3.'],
        ['Budget', COL.vellum, `Your deck carries ${info.budget} Weight for free.`],
        ['Strain', COL.bad, 'Weight over Budget. Each point Tithes one plain card.'],
        ['Tithe', COL.bad, 'A Tithed card fights at 75 percent for the combat.'],
        ['Backfire', '#ffb35a', 'Strain with no plain card left jams grafted cards.'],
        ['Overload', COL.gold, 'A 3rd graft: numbers x1.5, +1 Weight, 25 percent Shatter.'],
      ];
      for (const [t, c, d] of rows) {
        app.text(t, x + pad, yy, { size: 14, ui: true, bold: true, color: c });
        yy += app.text(d, x + pad + 62, yy, { size: 13, ui: true, maxW: w - 2 * pad - 62, lineH: 15, color: 'rgba(232,220,196,.85)' }) + 6;
      }
    } else {
      const inst = hv.inst, spec = hv.spec;
      yy += app.text(spec.name, x + pad, yy, { size: 20, bold: true, color: COL.lamp, maxW: w - 2 * pad, lineH: 23 }) + 2;
      if (!inst.grafts.length) {
        const txt = isBare(inst) ? 'No grafts. A plain card: it weighs nothing, and it is what the Tithe lands on.' : 'No grafts. Junk takes none and weighs nothing.';
        yy += app.text(txt, x + pad, yy, { size: 14, ui: true, maxW: w - 2 * pad, color: COL.vellum }) + 6;
      } else {
        const total = instWeight(inst);
        yy += app.text(`Adds ${total} Weight to the deck`, x + pad, yy, { size: 15, ui: true, bold: true, color: COL.vellum }) + 6;
        inst.grafts.forEach((gid, i) => {
          const gr = GRAFTS[gid]; if (!gr) return;
          const col = COL[gr.school] || COL.vellum, wt = (gr.weight || 1) + (i >= MAX_GRAFTS_NORMAL ? 1 : 0);
          ctx.save(); app.rr(x + 6, yy - 2, w - 12, 20, 5); ctx.fillStyle = rgba(col.startsWith('#') ? col : '#888888', 0.18); ctx.fill(); ctx.restore();
          drawSchoolGlyph(ctx, gr.school, x + pad + 6, yy + 8, 6, col);
          app.text(gr.name, x + pad + 18, yy, { size: 15, bold: true, color: COL.vellum, maxW: w - 100 });
          app.text(i >= MAX_GRAFTS_NORMAL ? `W${gr.weight || 1}+1` : `W${wt}`, x + w - pad, yy + 1, { size: 14, ui: true, bold: true, align: 'right', color: i >= MAX_GRAFTS_NORMAL ? COL.gold : COL.vellum });
          yy += 24;
          app.text('Boon', x + pad, yy, { size: 12, ui: true, bold: true, color: COL.good });
          yy += Math.max(15, app.text(gr.boon || '', x + pad + 38, yy, { size: 13, ui: true, maxW: w - 2 * pad - 38, lineH: 15, color: COL.vellum }));
          yy += 2;
          app.text('Price', x + pad, yy, { size: 12, ui: true, bold: true, color: COL.bad });
          yy += Math.max(15, app.text(gr.price || '', x + pad + 38, yy, { size: 13, ui: true, maxW: w - 2 * pad - 38, lineH: 15, color: '#ffb0b0' }));
          yy += 10;
        });
      }
      if (hv.tithed) yy += app.text('Tithed: this card fights at 75 percent this combat.', x + pad, yy, { size: 13, ui: true, bold: true, color: COL.bad, maxW: w - 2 * pad, lineH: 15 }) + 4;
      if (spec.overload) yy += app.text('Overload: numbers x1.5. 25 percent chance to Shatter on its first play each combat.', x + pad, yy, { size: 13, ui: true, bold: true, color: COL.gold, maxW: w - 2 * pad, lineH: 15 }) + 4;
      else if (inst.grafts.length === MAX_GRAFTS_NORMAL) yy += app.text('Full. A 3rd graft would Overload it.', x + pad, yy, { size: 13, ui: true, color: 'rgba(232,220,196,.6)', maxW: w - 2 * pad, lineH: 15 });
    }
    if (this.pick && this.o.multi) {
      const n = this.sel.size;
      if (app.button(`Confirm (${n})`, x + pad, y + h - 52, w - 2 * pad, 40, { size: 18, ui: true, disabled: n === 0, fill: '#5a4720', stroke: COL.lamp, color: COL.lamp })) {
        const picked = run.deck.filter((d) => this.sel.has(d.uid));
        this.pending = () => { if (app.top() !== this) return; app.pop(); if (this.o.onPick) this.o.onPick(picked); };
      }
    }
  },
};
