// ARCHIVE: modal screen (flow.openArchive(), from the title). The whole unlock progression in one place: how many open, what comes next and what it costs,
// and every gateable item as an unlocked tile or a locked silhouette (hover or tap for the plain hint). Model: engine/unlock.js; drawing: ui/archive_kit.js.
import { tscale } from './graft_parts.js';
import { COL, W, H, rgba } from './core.js';
import { unlockState, lockedHint, isFresh } from '../engine/unlock.js';
import { cardSpec } from '../engine/cards.js';
import { CARDS, GRAFTS, RELICS, POTIONS, EVENTS, HEROES } from '../data/index.js';
import { glossTip, cardGlossTip } from './tooltips.js';
import { scrollArea, inView } from './deckview.js';
import { KINDS, KIND_LABEL, KIND_ONE, GOLD, itemViews, categoryCounts, drawMini, drawSilhouette, shortHint, padlock } from './archive_kit.js';
import { lnw } from '../art/linework.js';

export const EXPLAIN = 'Each run earns Archive points. Better runs earn more, up to a cap.';
const CARD_FILTERS = [['all', 'All'], ['marrow', 'Marrow'], ['wick', 'Wick'], ['odile', 'Odile'], ['any', 'Neutral']];
const DIM = 'rgba(232,220,196,.6)';

function bar(app, x, y, w, h, f, col) {
  const g = app.ctx;
  app.rr(x, y, w, h, h / 2); g.fillStyle = 'rgba(8,6,5,.85)'; g.fill(); g.lineWidth = lnw(1.2); g.strokeStyle = 'rgba(232,220,196,.3)'; g.stroke();
  const fw = Math.max(0, Math.min(1, f)) * (w - 2);
  if (fw > 1) { app.rr(x + 1, y + 1, fw, h - 2, (h - 2) / 2); g.fillStyle = col || GOLD; g.fill(); }
}

export default {
  enter(app) {
    this.tab = 0; this.hero = 'all'; this.sts = {}; this.anim = (app.shared.meta.settings && app.shared.meta.settings.reducedMotion) ? 1 : 0; this.pending = null;
  },
  setTab(i) { this.tab = ((i % KINDS.length) + KINDS.length) % KINDS.length; this.hero = 'all'; },
  state(k) { return this.sts[k] || (this.sts[k] = { scroll: 0, target: 0, focus: -1 }); },
  key(app, e) {
    if (app.top() !== this) return false;
    if (e.key === 'Escape') { app.pop(); return true; }
    if (e.key === 'Tab') { this.setTab(this.tab + (e.shiftKey ? -1 : 1)); return true; }
    return false;
  },
  draw(app) {
    const ts = app.textScale; app.textScale = Math.min(tscale(app), 1.25);
    try { this.drawArchive(app); } finally { app.textScale = ts; }
  },
  drawArchive(app) {
    const g = app.ctx, meta = app.shared.meta, st = unlockState(meta);
    this.pending = null;
    if (this.anim < 1) this.anim = Math.min(1, this.anim + app.dt / 0.16);
    const k = 1 - Math.pow(1 - this.anim, 3);
    g.save(); g.fillStyle = `rgba(6,4,3,${0.84 * k})`; g.fillRect(0, 0, W, H); g.restore();
    g.save(); g.globalAlpha = k; g.translate(0, (1 - k) * 14);
    app.reg('archive-panel', 14, 10, W - 28, H - 20, { overlay: true });
    app.panel(14, 10, W - 28, H - 20, { r: 14, fill: '#1c1714', stroke: 'rgba(232,220,196,.5)', lw: 3 });
    app.text('Archive', 36, 18, { size: 28, bold: true, color: GOLD });
    app.text(EXPLAIN, 36, 58, { size: 15, ui: true, italic: true, color: 'rgba(232,220,196,.8)', fit: { w: 1030, lines: 1 } });
    app.reg('archive-x', 1080, 16, 36, 36, { group: 'x' });
    if (app.button('X', 1080, 16, 36, 36, { size: 20, ui: true, r: 18 })) this.pending = () => { if (app.top() === this) app.pop(); };
    this.drawSummary(app, st, 28, 92, 330, 270);
    this.drawTotals(app, st, 28, 374, 330, 326);
    this.drawQueue(app, st, 374, 92, 878, 200);
    this.drawGrid(app, meta, 374, 304, 878, 396);
    g.restore();
    if (this.pending) this.pending();
  },
  drawSummary(app, st, x, y, w, h) {
    app.reg('archive-summary', x, y, w, h, { group: 'summary' });
    app.panel(x, y, w, h, { r: 12, fill: 'rgba(16,12,11,.88)' });
    const meta = app.shared.meta, runs = (meta.stats ? (meta.stats.wins || 0) + (meta.stats.deaths || 0) : 0), iw = w - 28;
    let yy = y + 12;
    yy += app.text('PROGRESS', x + 14, yy, { size: 12, ui: true, bold: true, color: COL.lamp }) + 4;
    yy += app.text(st.done ? 'Archive complete' : `Archive ${st.percent} percent`, x + 14, yy, { size: 28, bold: true, color: st.done ? '#8fe0a0' : '#fbe9b0', fit: { w: iw, lines: 1 } }) + 6;
    bar(app, x + 14, yy, iw, 14, st.total ? st.unlockedCount / st.total : 1, st.done ? '#8fe0a0' : GOLD); yy += 22;
    yy += app.text(`${st.unlockedCount} of ${st.total} locked items opened`, x + 14, yy, { size: 14, ui: true, color: '#e0d4b8', fit: { w: iw, lines: 1 } }) + 8;
    yy += app.text(`Runs finished: ${runs}`, x + 14, yy, { size: 14, ui: true, color: '#cdbf9d', fit: { w: iw, lines: 1 } }) + 10;
    if (st.done) { app.text('Everything is unlocked. Nothing left to earn here.', x + 14, yy, { size: 14, ui: true, italic: true, color: '#8fe0a0', fit: { w: iw, h: y + h - yy - 8, lines: 3 } }); return; }
    yy += app.text('NEXT UNLOCK', x + 14, yy, { size: 12, ui: true, bold: true, color: COL.lamp }) + 4;
    bar(app, x + 14, yy, iw, 12, st.nextCost ? st.points / st.nextCost : 0); yy += 18;
    app.text(`${st.points} of ${st.nextCost} points. A run pays 2 to ${st.upCap}.`, x + 14, yy, { size: 14, ui: true, color: '#e0d4b8', fit: { w: iw, h: y + h - yy - 8, lines: 2 } });
  },
  drawTotals(app, st, x, y, w, h) {
    app.reg('archive-totals', x, y, w, h, { group: 'totals' });
    app.panel(x, y, w, h, { r: 12, fill: 'rgba(16,12,11,.88)' });
    const meta = app.shared.meta, cc = categoryCounts(meta), iw = w - 28;
    app.text('OPEN SO FAR', x + 14, y + 10, { size: 12, ui: true, bold: true, color: COL.lamp });
    let yy = y + 36;
    for (const kd of KINDS) {
      const c = cc[kd];
      app.text(`${KIND_LABEL[kd]} ${c.got} of ${c.total} unlocked`, x + 14, yy, { size: 14, ui: true, color: '#e0d4b8', fit: { w: iw, lines: 1 } });
      bar(app, x + 14, yy + 27, iw, 5, c.total ? c.got / c.total : 1, c.got >= c.total ? '#8fe0a0' : '#b79442');
      yy += 38;
    }
    yy += 4;
    for (const hr of st.heroes) {
      const room = y + h - yy - 6;
      app.text(hr.unlocked ? `${hr.name}: unlocked` : `${hr.name}: ${hr.hint}`, x + 14, yy, { size: 13, ui: true, italic: !hr.unlocked, color: hr.unlocked ? '#8fe0a0' : '#c9b98f', fit: { w: iw, h: Math.min(44, room / Math.max(1, st.heroes.length - st.heroes.indexOf(hr))), lines: 3, soft: true } });
      yy += 46;
    }
  },
  drawQueue(app, st, x, y, w, h) {
    app.reg('archive-queue', x, y, w, h, { group: 'queue' });
    app.panel(x, y, w, h, { r: 12, fill: 'rgba(16,12,11,.88)' });
    app.text('UP NEXT', x + 14, y + 10, { size: 12, ui: true, bold: true, color: COL.lamp });
    app.text('Names stay hidden until they open.', x + w - 14, y + 10, { size: 12, ui: true, italic: true, align: 'right', color: DIM, fit: { w: w - 140, lines: 1 } });
    if (!st.queue.length) { app.text('The queue is empty. Everything is unlocked.', x + w / 2, y + h / 2 - 10, { size: 18, italic: true, align: 'center', color: '#8fe0a0', fit: { w: w - 40, lines: 1 } }); return; }
    const top = y + 36, pitch = (h - 44) / 5;
    st.queue.forEach((s, i) => {
      const ry = top + i * pitch, first = i === 0, it = s.items[0];
      if (first) { app.rr(x + 8, ry, w - 16, pitch - 3, 8); app.ctx.fillStyle = 'rgba(242,193,78,.10)'; app.ctx.fill(); app.ctx.lineWidth = lnw(1.5); app.ctx.strokeStyle = rgba(GOLD, 0.5); app.ctx.stroke(); }
      drawSilhouette(app, s.kind, x + 38, ry + (pitch - 3) / 2, Math.min(28, pitch - 8));
      const n = s.items.length, label = `${shortHint(it.hint)} ${n > 1 ? `${n} ${KIND_LABEL[s.kind].toLowerCase()} open together.` : ''}`;
      app.text(first ? 'NEXT' : String(i + 1), x + 66, ry + 6, { size: 11, ui: true, bold: true, color: first ? GOLD : DIM, fit: { w: 44, lines: 1 } });
      app.text(label, x + 116, ry + 6, { size: 14, ui: true, color: first ? '#fbe9b0' : '#d9cba8', fit: { w: w - 116 - 140, h: pitch - 8, lines: 2, soft: true } });
      app.text(`${s.cost} points`, x + w - 18, ry + 6, { size: 15, ui: true, bold: true, align: 'right', color: first ? GOLD : '#cdbf9d', fit: { w: 112, lines: 1 } });
      if (app.inRect(x + 8, ry, w - 16, pitch - 3)) app.tooltip(first ? 'Next unlock' : `Unlock ${i + 1}`, `${n} ${n > 1 ? 'items' : 'item'} (${KIND_LABEL[s.kind].toLowerCase()}). Costs ${s.cost} points; your unspent points carry over.`, { color: GOLD });
    });
  },
  tileTip(app, v, anchor) {
    if (!v.unlocked) { app.tooltip(`Locked ${KIND_ONE[v.kind]}`, lockedHint(v.itemId), { color: '#9b8f7a', anchor }); return; }
    if (v.kind === 'card') { let sp = null; try { sp = cardSpec({ uid: 0, id: v.itemId, grafts: [], up: 0 }); } catch { sp = null; } if (sp) cardGlossTip(app, sp, anchor, { title: v.name }); }
    else if (v.kind === 'graft') { const d = GRAFTS[v.itemId]; glossTip(app, d.name, [d.boon, d.price, String(d.tier || '').toUpperCase(), 'W' + d.weight], anchor, { school: d.school }); }
    else if (v.kind === 'relic') glossTip(app, RELICS[v.itemId].name, [RELICS[v.itemId].text], anchor, {});
    else if (v.kind === 'potion') glossTip(app, POTIONS[v.itemId].name, [POTIONS[v.itemId].text], anchor, {});
    else app.tooltip(v.name, String((EVENTS[v.itemId] && EVENTS[v.itemId].text) || '').slice(0, 160), { anchor });
  },
  drawGrid(app, meta, x, y, w, h) {
    const g = app.ctx, cc = categoryCounts(meta);
    app.reg('archive-grid', x, y, w, h, { group: 'grid' });
    app.panel(x, y, w, h, { r: 12, fill: 'rgba(16,12,11,.88)' });
    const tw = Math.floor((w - 24 - 4 * 6) / 5);
    KINDS.forEach((kd, i) => {
      const on = this.tab === i, c = cc[kd];
      app.reg('archive-tab' + i, x + 12 + i * (tw + 6), y + 10, tw, 32, { group: 'tab' + i });
      if (app.button(`${KIND_LABEL[kd]} ${c.got}/${c.total}`, x + 12 + i * (tw + 6), y + 10, tw, 32, { size: 15, ui: true, fit: true, fill: on ? '#5a4720' : COL.slab2, stroke: on ? COL.lamp : 'rgba(232,220,196,.4)', color: on ? COL.lamp : COL.vellum, r: 7 })) this.setTab(i);
    });
    const kind = KINDS[this.tab];
    let gy = y + 50;
    if (kind === 'card') {
      let fx = x + 12; const cw = Math.floor((w - 24 - 4 * 5) / 5);
      CARD_FILTERS.forEach(([id, label]) => {
        const on = this.hero === id;
        app.reg('archive-f' + id, fx, gy, cw, 26, { group: 'f' + id });
        if (app.button(label, fx, gy, cw, 26, { size: 13, ui: true, fit: true, r: 6, fill: on ? '#5a4720' : COL.slab2, stroke: on ? COL.lamp : 'rgba(232,220,196,.4)', color: on ? COL.lamp : COL.vellum })) { this.hero = id; this.state('card').target = 0; }
        fx += cw + 5;
      });
      gy += 34;
    }
    let list = itemViews(meta, kind);
    if (kind === 'card' && this.hero !== 'all') list = list.filter((v) => (this.hero === 'any' ? !v.hero : v.hero === this.hero));
    const aw = w - 16, ah = y + h - gy - 8, cellW = 50, cellH = 58, cols = Math.max(1, Math.floor((aw - 24) / cellW)), rows = Math.ceil(list.length / cols);
    const stt = this.state(kind + this.hero);
    app.reg('scroll-archive', x + 8, gy, aw, ah, { group: 'gridbox' });
    const ox = x + 8 + (aw - cols * cellW) / 2;
    scrollArea(app, stt, x + 8, gy, aw, ah, rows * cellH + 8, (top) => {
      list.forEach((v, i) => {
        const cx = ox + (i % cols) * cellW, cy = top + 4 + Math.floor(i / cols) * cellH;
        if (cy + cellH < gy || cy > gy + ah) return;
        const hot = inView(app, stt, cx + 2, cy, cellW - 4, cellH - 4);
        if (hot) { app.cursor = 'help'; this.tileTip(app, v, { x: cx, y: cy, w: cellW, h: cellH }); }
        if (hot) { app.rr(cx + 1, cy, cellW - 2, cellH - 3, 7); g.fillStyle = 'rgba(232,220,196,.08)'; g.fill(); }
        if (v.unlocked) drawMini(app, v, cx + cellW / 2, cy + (cellH - 3) / 2, 38, { hot }); else drawSilhouette(app, v.kind, cx + cellW / 2, cy + (cellH - 3) / 2, 38, { hot });
        if (v.unlocked && !v.start && isFresh(meta, v.itemId)) { g.fillStyle = GOLD; g.beginPath(); g.arc(cx + cellW - 9, cy + 7, 4, 0, 6.283); g.fill(); }
      });
    });
  },
};
