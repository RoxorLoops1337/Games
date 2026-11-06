// Combat screen drawing helpers: bars, status rows, intent bubbles, card keyword panel.
import { COL, EASE, W, clamp, rgba } from './core.js';
import { STATUSES, GRAFTS, SCHOOLS, CARDS, RELICS } from '../data/index.js';
import { statusText } from '../engine/text.js';
import { drawStatus, drawIntent, drawShield, drawRelic } from '../art/icons.js';
import * as L from './combat_layout.js';
import { queueTip, statusSection, keywordSection, explainIntent } from './tooltips.js';
import { opText } from '../engine/text.js';

export const STATUS_COL = { burn: COL.ember, bleed: '#d12a44', poison: '#8fd14f', vulnerable: '#e0a050', weak: '#9aa8b0', strength: '#ff9a6a', dexterity: '#7fd1e0' };
export const stCol = (id) => STATUS_COL[id] || (STATUSES[id] && STATUSES[id].good ? COL.good : COL.bad);
export const stName = (id) => (STATUSES[id] ? STATUSES[id].name : id);
export const stGood = (id) => !(STATUSES[id] && STATUSES[id].good === false);

// cached 6px diagonal ink hatch tile for the bars (one pattern per context; null when no canvas exists, e.g. headless)
const BAR_HATCH = new WeakMap(); let BAR_TILE = null;
function barHatch(ctx) {
  if (BAR_HATCH.has(ctx)) return BAR_HATCH.get(ctx);
  let pat = null;
  try {
    if (!BAR_TILE && typeof document !== 'undefined' && document.createElement) {
      const c = document.createElement('canvas'); c.width = c.height = 6; const g = c.getContext('2d');
      if (g) { g.strokeStyle = 'rgba(20,8,6,.9)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-1, 6); g.lineTo(6, -1); g.moveTo(2, 8); g.lineTo(8, 2); g.moveTo(-2, 2); g.lineTo(2, -2); g.stroke(); BAR_TILE = c; }
    }
    if (BAR_TILE) pat = ctx.createPattern(BAR_TILE, 'repeat');
  } catch (e) { pat = null; }
  BAR_HATCH.set(ctx, pat); return pat;
}
export function drawBar(app, x, y, w, h, shown, trail, max, color, label) {
  const ctx = app.ctx;
  const pct = max > 0 ? clamp(shown / max, 0, 1) : 0, tp = max > 0 ? clamp(trail / max, 0, 1) : 0;
  ctx.save();
  app.rr(x, y, w, h, h / 2); ctx.fillStyle = 'rgba(10,8,8,.85)'; ctx.fill();
  ctx.save(); app.rr(x, y, w, h, h / 2); ctx.clip();
  if (tp > pct) { ctx.fillStyle = '#f3e9d2'; ctx.fillRect(x, y, w * tp, h); }
  const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, color); g.addColorStop(1, '#00000055');
  ctx.fillStyle = color; ctx.fillRect(x, y, w * pct, h);
  ctx.fillStyle = g; ctx.fillRect(x, y, w * pct, h);
  // engraved shading: ink hatch on the lower (shadow) half, a 1px lit line on top, a meniscus tick at the liquid edge (no web gloss)
  const hp = barHatch(ctx); const fw = w * pct;
  if (hp && fw > 2) { ctx.fillStyle = hp; ctx.globalAlpha = 0.5; ctx.fillRect(x, y + h * 0.5, fw, h * 0.5); ctx.globalAlpha = 1; }
  ctx.fillStyle = 'rgba(255,241,200,.34)'; ctx.fillRect(x, y + 1, fw, 1);
  if (fw > 3 && pct < 1) { ctx.fillStyle = 'rgba(255,241,200,.7)'; ctx.fillRect(x + fw - 1.5, y + 1, 1.5, h - 2); }
  ctx.restore();
  app.rr(x, y, w, h, h / 2); ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(214,190,140,.6)'; ctx.stroke();
  app.rr(x + 1.5, y + 1.5, w - 3, h - 3, Math.max(1, h / 2 - 1.5)); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.stroke();
  ctx.restore();
  if (label) app.text(label, x + w / 2, y + h / 2 - 8, { size: 14, align: 'center', ui: true, bold: true, color: '#fff', stroke: '#0e0e0e', strokeW: 3, fixed: true });
}

// ---- text helpers ----
export const shortMove = (n) => { const t = String(n || '').replace(/\s*\([^)]*\)\s*$/, '').trim(); return t || String(n || ''); };
// Shrinks a string to fit maxW (down to minSize), then ellipsizes. Returns { str, size, w }.
export function fitText(app, str, maxW, size, minSize = 14, o = {}) {
  str = String(str);
  let sz = size;
  while (sz > minSize && app.measure(str, Math.round(sz * (app.textScale || 1)), o) > maxW) sz--;
  let w = app.measure(str, Math.round(sz * (app.textScale || 1)), o);
  while (str.length > 1 && w > maxW) { str = str.slice(0, -2) + '…'; w = app.measure(str, Math.round(sz * (app.textScale || 1)), o); if (str.length <= 2) break; }
  return { str, size: sz, w };
}

// ---- HUD popovers (relic '+N', status '+N'): one open at a time, drawn last by drawPopovers ----
export const hudState = { open: null, chip: null };
const cb = (app) => !!(app.shared && app.shared.meta && app.shared.meta.settings && app.shared.meta.settings.colorblind);

function cornerShape(ctx, good, x, y) {
  ctx.save(); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#0e0e0e'; ctx.lineWidth = 1.5; ctx.beginPath();
  if (good) { ctx.moveTo(x, y - 4); ctx.lineTo(x + 4.5, y + 4); ctx.lineTo(x - 4.5, y + 4); } else { ctx.moveTo(x - 4.5, y - 4); ctx.lineTo(x + 4.5, y - 4); ctx.lineTo(x, y + 4); }
  ctx.closePath(); ctx.stroke(); ctx.fill(); ctx.restore();
}
function drawOneStatus(app, ent, id, x, y, sz, anchorRect) {
  const ctx = app.ctx, n = ent.st[id], pop = (ent.pop && ent.pop[id]) || 0, good = stGood(id);
  const k = 1 + 0.55 * pop * pop;
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k); drawStatus(ctx, id, 0, 0, sz, good); ctx.restore();
  if (pop > 0) { ctx.save(); ctx.globalAlpha = pop; ctx.strokeStyle = stCol(id); ctx.lineWidth = 3 * pop + 1; ctx.beginPath(); ctx.arc(x, y, sz * 0.5 + (1 - pop) * sz * 0.9, 0, 6.283); ctx.stroke(); ctx.restore(); }
  const d = STATUSES[id];
  if (d && d.stack === 'dur' && n > 0 && n <= 5) { // duration pips on the lower arc
    ctx.save(); ctx.fillStyle = stCol(id); ctx.strokeStyle = '#0e0e0e'; ctx.lineWidth = 1;
    for (let i = 0; i < n; i++) { const a = 1.5708 + (i - (n - 1) / 2) * 0.42; const px = x + Math.cos(a) * (sz / 2 + 1), py = y + Math.sin(a) * (sz / 2 + 1); ctx.beginPath(); ctx.arc(px, py, 2, 0, 6.283); ctx.fill(); ctx.stroke(); }
    ctx.restore();
  }
  if (cb(app)) cornerShape(ctx, good, x - sz / 2 + 3, y - sz / 2 + 4);
  const nfs = Math.max(14, Math.min(20, Math.round(sz * 0.58)));
  app.text(String(n), x + sz / 2 + 2, y + sz / 2 - nfs - 1, { size: nfs, bold: true, ui: true, align: 'right', stroke: '#0e0e0e', strokeW: 4, color: '#fff', fixed: true });
  if (app.inRect(x - sz / 2, y - sz / 2, sz, sz)) queueTip(app, 'st:' + id + ':' + n, [[statusSection(id, n, ent)]], { x: x - sz / 2, y: y - sz / 2, w: sz, h: sz });
}
// Status icons in rows: good statuses on the top row, bad on the second (rows = 2), or one row (rows = 1). Icons shrink from
// `size` to 26 before anything collapses; beyond 8 (or what fits) the rest hides behind a '+N' chip opening a list.
// ent: {st, pop}. o: { id, rows, group }. Returns the height used.
export function drawStatusRow(app, ent, cx, y, maxW, size, t, o = {}) {
  const ids = Object.keys(ent.st).filter((s) => ent.st[s]);
  const rows = o.rows || 2, key = o.id || 'ent';
  if (!ids.length) { if (hudState.open === 'st:' + key) hudState.open = null; return 0; }
  const good = ids.filter(stGood), bad = ids.filter((s) => !stGood(s));
  let sz = size, perRow = Math.max(1, Math.floor((maxW + 4) / (sz + 4)));
  const need = (k) => Math.max(1, Math.floor((maxW + 4) / (k + 4)));
  const fits = (k) => (rows === 1 ? ids.length <= need(k) : good.length <= need(k) && bad.length <= need(k)) && ids.length <= 8;
  for (const k of [size, 30, 28, 26]) { if (k > size) continue; sz = k; perRow = need(k); if (fits(k)) break; }
  let gShow = good, bShow = bad; const hidden = [];
  if (rows === 1) { const all = good.concat(bad); gShow = all.slice(0, ids.length <= Math.min(8, perRow) ? all.length : Math.min(8, perRow) - 1); bShow = []; hidden.push(...all.slice(gShow.length)); }
  else {
    if (good.length > perRow) { gShow = good.slice(0, perRow); hidden.push(...good.slice(perRow)); }
    if (bad.length > perRow) { bShow = bad.slice(0, perRow); hidden.push(...bad.slice(perRow)); }
    while (gShow.length + bShow.length > 8) { hidden.push((bShow.length ? bShow : gShow).pop()); }
    if (hidden.length && bShow.length >= perRow) hidden.push(bShow.pop());
  }
  const step = sz + 4, rowH = sz + 3, ctx = app.ctx;
  const rowsOut = rows === 1 ? [gShow.concat([])] : [gShow, bShow];
  let chip = hidden.length ? true : false;
  if (rows === 1) { /* chip joins the single row */ } else if (!bShow.length && gShow.length && chip) { /* chip goes on row 2 */ }
  let r = 0, minX = 1e9, maxX = -1e9, used = 0;
  const lay = (list, extraChip) => {
    const n = list.length + (extraChip ? 1 : 0); if (!n) return;
    const w = n * step - 4, x0 = cx - w / 2 + sz / 2, yy = y + r * rowH + sz / 2;
    list.forEach((id, i) => drawOneStatus(app, ent, id, x0 + i * step, yy, sz));
    minX = Math.min(minX, cx - w / 2); maxX = Math.max(maxX, cx + w / 2);
    if (extraChip) {
      const chipX = x0 + list.length * step - sz / 2, cr = { x: chipX, y: yy - sz / 2, w: sz + 6, h: sz };
      app.rr(cr.x, cr.y, cr.w, cr.h, 6); ctx.save(); ctx.fillStyle = 'rgba(14,12,10,.92)'; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = COL.lamp; ctx.stroke(); ctx.restore();
      app.text('+' + hidden.length, cr.x + cr.w / 2, cr.y + cr.h / 2 - 8, { size: 14, bold: true, ui: true, align: 'center', color: COL.lamp, fixed: true });
      maxX = Math.max(maxX, cr.x + cr.w);
      if (app.inRect(cr.x, cr.y, cr.w, cr.h)) { app.cursor = 'pointer'; if (app.clicked(cr.x, cr.y, cr.w, cr.h)) hudState.open = hudState.open === 'st:' + key ? null : 'st:' + key; }
      if (hudState.open === 'st:' + key) hudState.chip = { key: 'st:' + key, rect: cr, items: ids.map((id) => ({ id, n: ent.st[id] })), kind: 'st' };
    }
    r++; used = r;
  };
  if (rows === 1) lay(gShow, chip);
  else { lay(gShow, false); if (bShow.length || chip) { lay(bShow, chip); } }
  const h = used * rowH;
  if (maxX > minX) app.reg('status:' + key, minX, y, maxX - minX, h, { group: o.group || key });
  return h;
}

// Popovers (drawn last so nothing covers them): the status list and the relic list.
export function drawPopovers(app) {
  const ctx = app.ctx, pc = hudState.chip; hudState.chip = null;
  if (!hudState.open) return;
  if (!pc || pc.key !== hudState.open) { if (!pc) hudState.open = null; return; }
  const items = pc.items, rowH = 28, pad = 8;
  const cols = pc.kind === 'relic' ? 6 : 1;
  const w = pc.kind === 'relic' ? cols * 38 + pad * 2 : 230;
  const rowsN = pc.kind === 'relic' ? Math.ceil(items.length / cols) : Math.min(items.length, 14);
  const h = pc.kind === 'relic' ? rowsN * 38 + pad * 2 : rowsN * rowH + pad * 2;
  const x = clamp(pc.rect.x + pc.rect.w / 2 - w / 2, 6, 1274 - w), y = Math.min(pc.rect.y + pc.rect.h + 6, 714 - h);
  app.panel(x, y, w, h, { fill: 'rgba(14,12,10,.98)', stroke: COL.lamp });
  app.reg('popover', x, y, w, h, { layer: 'overlay', overlay: true });
  if (pc.kind === 'relic') {
    items.forEach((it, i) => {
      const ix = x + pad + (i % cols) * 38, iy = y + pad + Math.floor(i / cols) * 38;
      drawRelic(ctx, it.id, ix + 19, iy + 19, 30);
      if (app.inRect(ix, iy, 38, 38) && RELICS[it.id]) queueTip(app, 'rl:' + it.id, [[{ title: RELICS[it.id].name, text: RELICS[it.id].text, color: COL.lamp, glyph: 'star' }]], { x: ix, y: iy, w: 38, h: 38 });
    });
  } else {
    items.slice(0, rowsN).forEach((it, i) => {
      const iy = y + pad + i * rowH;
      drawStatus(ctx, it.id, x + pad + 11, iy + 12, 22, stGood(it.id));
      app.text(`${stName(it.id)} ${it.n}`, x + pad + 30, iy + 3, { size: 16, ui: true, bold: true, color: stCol(it.id), fixed: true });
      if (app.inRect(x + pad, iy, w - pad * 2, rowH)) queueTip(app, 'stl:' + it.id, [[statusSection(it.id, it.n)]], { x, y: iy, w, h: rowH });
    });
  }
  const r = pc.rect;
  if (app.mouse.released && !app.inRect(x, y, w, h) && !app.inRect(r.x, r.y, r.w, r.h)) hudState.open = null;
}

// Relic strip: shows `show` relics then a '+N' chip. Registers 'topRelics'.
export function drawRelicStrip(app, relics) {
  const R = L.RELIC0, ctx = app.ctx, n = relics.length;
  const shown = n > R.show ? R.show : n, step = n <= R.show ? Math.min(R.step, (R.x1 - R.x) / Math.max(1, n)) : R.step;
  for (let i = 0; i < shown; i++) {
    const id = relics[i], cx = R.x + i * step + R.size / 2;
    drawRelic(ctx, id, cx, R.y, R.size);
    const r = RELICS[id];
    if (r && app.inRect(cx - R.size / 2 - 2, R.y - R.size / 2, R.size + 4, R.size)) queueTip(app, 'rl:' + id, [[{ title: r.name, text: r.text, color: COL.lamp, glyph: 'star' }]], { x: cx - R.size / 2, y: R.y - R.size / 2, w: R.size, h: R.size });
  }
  let endX = R.x + Math.max(0, shown - 1) * step + R.size + 2;
  if (n > shown) {
    const rest = n - shown, cr = { x: R.x + shown * step, y: R.y - 14, w: 46, h: 28 };
    app.rr(cr.x, cr.y, cr.w, cr.h, 7); ctx.save(); ctx.fillStyle = 'rgba(40,34,30,.95)'; ctx.fill(); ctx.lineWidth = 1.8; ctx.strokeStyle = COL.lamp; ctx.stroke(); ctx.restore();
    app.text('+' + rest, cr.x + cr.w / 2, cr.y + 4, { size: 18, bold: true, ui: true, align: 'center', color: COL.lamp, fixed: true });
    if (app.inRect(cr.x, cr.y, cr.w, cr.h)) { app.cursor = 'pointer'; if (app.clicked(cr.x, cr.y, cr.w, cr.h)) hudState.open = hudState.open === 'relics' ? null : 'relics'; }
    if (hudState.open === 'relics') hudState.chip = { key: 'relics', rect: cr, items: relics.slice(shown).map((id) => ({ id })), kind: 'relic' };
    endX = cr.x + cr.w;
  } else if (hudState.open === 'relics') hudState.open = null;
  app.reg('topRelics', R.x, R.y - 14, Math.max(30, endX - R.x), 28, {});
}

export function intentText(info) {
  if (!info) return '';
  if (info.hidden) return 'Its intent is hidden.';
  const out = [];
  for (const k of info.kinds) {
    if (k === 'attack') out.push(info.hits > 1 ? `Attacks for ${info.per} x ${info.hits}.` : `Attacks for ${info.dmg}.`);
    else if (k === 'defend') out.push('Plans to gain Block.');
    else if (k === 'buff') out.push('Plans to strengthen itself or its allies.');
    else if (k === 'debuff') out.push('Plans to afflict you.');
    else if (k === 'junk') out.push('Plans to clog your deck with junk.');
    else if (k === 'summon') out.push('Plans to call for help.');
    else out.push('Intent unclear.');
  }
  return out.join(' ');
}

// Intent plate centred at (x, y): 28 px icon + 24 px bold number (contrast stroke) + 'xN' hits. prog 0..1 = ink-in progress.
// Returns { x, y, w, h } of the plate (for hit tests and the layout registry).
export function drawIntentBubble(app, info, x, y, prog, alpha = 1, maxW = 170) {
  const ctx = app.ctx;
  if (!info || prog <= 0 || alpha <= 0) return { x, y, w: 0, h: 0 };
  let kinds = info.hidden ? ['unknown'] : info.kinds.slice(0, 3); // a 3-effect move (Appraiser: attack + block + debuff) shows all three when the plate is wide enough
  const attack = !info.hidden && info.kinds.includes('attack');
  const num = attack ? String(info.hits > 1 ? info.per : info.dmg) : (info.hidden ? '?' : '');
  const hitTxt = attack && info.hits > 1 ? 'x' + info.hits : '';
  const numW = num ? app.measure(num, 30, { bold: true, ui: true }) : 0, hitW = hitTxt ? app.measure(hitTxt, 22, { bold: true, ui: true }) : 0;
  const body = (k) => k.length * 38 + (numW ? numW + 4 : 0) + (hitW ? hitW + 4 : 0) + 16;
  while (body(kinds) > maxW && kinds.length > 1) kinds = kinds.slice(0, -1);
  const w = Math.min(maxW, body(kinds)), h = 44;
  ctx.save();
  ctx.globalAlpha = alpha * clamp(prog * 2.5, 0, 1);
  const col = info.hidden ? '#bbb' : attack ? '#e86a5a' : info.kinds.includes('debuff') ? '#c78bd8' : info.kinds.includes('buff') ? '#7fcf8a' : '#cfc3a8';
  // engraved brass-framed tag (not a web pill): squarer corners, spot-colour rule, thin sepia inner line, four rivets
  app.rr(x - w / 2, y - h / 2, w, h, 6); ctx.fillStyle = 'rgba(16,13,12,.9)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.stroke();
  app.rr(x - w / 2 + 3, y - h / 2 + 3, w - 6, h - 6, 3.5); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(214,190,140,.32)'; ctx.stroke();
  ctx.fillStyle = 'rgba(255,241,176,.55)'; for (const [rx, ry] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.beginPath(); ctx.arc(x + rx * (w / 2 - 3.5), y + ry * (h / 2 - 3.5), 1, 0, 6.2832); ctx.fill(); }
  ctx.beginPath(); ctx.rect(x - w / 2, y - h, w * clamp(prog * 1.6, 0, 1), h * 2); ctx.clip();
  let cx = x - w / 2 + 8;
  for (const k of kinds) { drawIntent(ctx, k, cx + 17, y, 36); cx += 38; }
  if (num) { app.text(num, cx + 2, y - 18, { size: 30, bold: true, ui: true, color: '#fff', stroke: '#0e0e0e', strokeW: 4, fixed: true }); cx += numW + 4; }
  if (hitTxt) app.text(hitTxt, cx + 2, y - 13, { size: 22, bold: true, ui: true, color: '#ffd9a0', stroke: '#0e0e0e', strokeW: 4, fixed: true });
  ctx.restore();
  return { x: x - w / 2, y: y - h / 2, w, h };
}

// ---- enemy plate: nameplate, move name, intent, hp bar with trail, block, status rows. ALL inside the enemy's slot. ----
// o: { alpha, hot, info, many (live enemies), suppress, tgt }
export function drawEnemyPlate(app, ed, o) {
  const ctx = app.ctx, def = ed.e.def, sw = Math.max(L.ENEMY_SLOT_MIN, ed.sw || 130), left = ed.x - sw / 2, foot = L.ENEMY_FOOT, grp = 'en' + ed.id;
  const col = def.kind === 'boss' ? COL.scar : def.kind === 'elite' ? COL.lamp : COL.vellum;
  const nameCol = def.kind === 'boss' ? '#ff8a8a' : col;
  ctx.save(); ctx.globalAlpha = o.alpha;
  // nameplate
  const nm = fitText(app, ed.e.name, sw - 4, 17, 14, { bold: true });
  app.text(nm.str, ed.x, L.ENEMY_LANE_TOP, { size: nm.size, bold: true, align: 'center', color: nameCol, stroke: '#0e0e0e', strokeW: 3 });
  app.reg(grp + ':name', ed.x - nm.w / 2, L.ENEMY_LANE_TOP, nm.w, Math.round(nm.size * 1.25), { group: grp });
  // move name: always with <= 4 enemies, else on hover
  const info = o.info;
  if (info && !info.hidden && (o.many <= 4 || o.hot)) {
    const mn = fitText(app, shortMove(o.moveName), sw - 4, 15, 14, { ui: true }); // the (+4 if ...) detail lives in the hover tip, not on the plate
    app.text(mn.str, ed.x, L.ENEMY_LANE_TOP + 21, { size: mn.size, ui: true, align: 'center', color: COL.vellum2, stroke: '#0e0e0e', strokeW: 3 });
    app.reg(grp + ':move', ed.x - mn.w / 2, L.ENEMY_LANE_TOP + 21, mn.w, Math.round(mn.size * 1.25), { group: grp });
  }
  // intent plate
  let ir = null;
  if (info && ed.intentOut < 1) {
    ir = drawIntentBubble(app, info, ed.x, L.ENEMY_LANE_TOP + 64, ed.intentT, (1 - ed.intentOut), sw - 2);
    if (ir.w) app.reg(grp + ':intent', ir.x, ir.y, ir.w, ir.h, { group: grp });
    // a move with a hover note (a condition that changes the number, e.g. Aria's +3 per extra card) gets a gold '+' pip so the plate itself says "this number can move"
    const mvc = ed.e.def.moves && ed.e.def.moves[ed.e.move];
    if (ir.w && mvc && (mvc.tip || mvc.note) && !info.hidden) { const bx = ir.x + ir.w - 2, by0 = ir.y + 2; ctx.save(); ctx.beginPath(); ctx.arc(bx, by0, 9, 0, 6.2832); ctx.fillStyle = '#e6b84a'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#0e0e0e'; ctx.stroke(); app.text('+', bx, by0 - 9, { size: 15, bold: true, ui: true, align: 'center', color: '#1a1208', fixed: true }); ctx.restore(); }
  }
  // hp bar + block
  const by = foot + 6, bx = left + 24, bw = sw - 26;
  drawBar(app, bx, by, bw, 16, ed.shown, ed.trail, ed.maxHp, '#a8412f', `${Math.max(0, Math.ceil(ed.hp))}/${ed.maxHp}`);
  if (ed.block > 0) { const k = 1 + ed.bpulse * 0.35; ctx.save(); ctx.translate(left + 11, by + 9); ctx.scale(k, k); drawShield(ctx, 0, 0, 30, ed.block); ctx.restore(); }
  app.reg(grp + ':hp', left, by - 3, sw, 22, { group: grp });
  ctx.restore();
  // status rows
  ctx.save(); ctx.globalAlpha = o.alpha;
  drawStatusRow(app, ed, ed.x, by + 24, sw - 2, ed.scale < 0.8 ? 28 : 32, 0, { id: grp, rows: 2, group: grp });
  ctx.restore();
  if (o.suppress) return;
  // tips: block, intent, hp/body
  // enemy tips fill a band beside the whole plate (never over its own health bar, intent or statuses): right of the slot when it fits, else left
  const bandR = left + sw + 8 + 320 <= W - 6, band = { x: bandR ? left + sw + 8 : left - 8, y: L.ENEMY_LANE_TOP, bottom: foot + 150, dir: bandR ? 1 : -1 };
  if (ed.block > 0 && app.inRect(left, by - 6, 24, 28)) queueTip(app, 'blk' + grp, [[{ title: 'Block ' + ed.block, text: 'Absorbs damage until this enemy acts.', color: '#bcd0d8', glyph: 'square' }]], { x: left, y: by - 6, w: 24, h: 28, band });
  else if (ir && ir.w && o.info && app.inRect(ir.x, ir.y, ir.w, ir.h)) queueTip(app, 'int' + grp + ':' + o.info.move, intentTip(app, ed, o), { x: ir.x, y: ir.y, w: ir.w, h: ir.h, band });
  else if (o.hot && !o.tgt && app.inRect(ed.x - ed.w / 2, foot - ed.h, ed.w, ed.h + 24)) queueTip(app, 'body' + grp, bodyTip(ed, o), { x: ed.x - ed.w / 2, y: foot - ed.h, w: ed.w, h: ed.h, band });
}
function intentTip(app, ed, o) {
  const info = o.info;
  if (info.hidden) return [[{ title: 'Unknown intent', text: 'This enemy hides what it will do next.', color: '#bbb', glyph: 'diamond' }]];
  const ex = explainIntent(o.c, ed.e, info);
  const mv = ed.e.def.moves[ed.e.move] || {};
  let text = (ex.lines.length ? ex.lines.join('\n') : intentText(info));
  for (const extra of [mv.note, mv.tip]) if (extra && !text.includes(extra)) text += '\n' + extra;
  return [[{ title: o.moveName || 'Intent', text, color: info.kinds.includes('attack') ? '#ff9a8a' : COL.vellum, glyph: 'tri', why: ex.why }]];
}
function bodyTip(ed, o) {
  const def = ed.e.def, kindTxt = def.kind === 'boss' ? ' (Boss)' : def.kind === 'elite' ? ' (Elite)' : '';
  const panels = [[{ title: ed.e.name + kindTxt, text: `HP ${ed.hp}/${ed.maxHp}` + (ed.block ? `, Block ${ed.block}` : '') + (o.info ? '\nNext: ' + (o.info.hidden ? 'unknown' : (o.moveName || '') + '. ' + intentText(o.info)) : ''), color: def.kind === 'boss' ? '#ff8a8a' : def.kind === 'elite' ? COL.lamp : COL.vellum, glyph: 'diamond' }]];
  const sts = Object.keys(ed.st).filter((s) => ed.st[s]).slice(0, 4).map((s) => statusSection(s, ed.st[s], ed));
  if (sts.length) panels.push(sts);
  return panels;
}

// Hero plate: hp bar, block, one row of statuses (good first). Registers 'heroPlate'.
// dgr (low HP): { pulse 0..1, level, rm }. The bar glows and throbs with the heartbeat, the number swells and shakes; reduced motion keeps a steady glow.
export function drawHeroPlate(app, P, heroName, t, dgr) {
  const ctx = app.ctx, H = L.HERO_PLATE;
  const hpLabel = `${Math.max(0, Math.ceil(P.hp))}/${P.maxHp}`;
  if (dgr) {
    const pu = dgr.rm ? 0.4 : dgr.pulse, lv = dgr.level, bx = H.x + 34, by = H.y + 2, bw = H.w - 38;
    const sh = dgr.rm ? 0 : Math.sin(t * 90) * 1.6 * pu * lv, grow = 1 + pu * 0.06 * lv;
    ctx.save(); ctx.translate(bx + bw / 2 + sh, by + 8); ctx.scale(grow, 1 + pu * 0.22 * lv); ctx.translate(-(bx + bw / 2), -8);
    ctx.shadowColor = `rgba(255,40,60,${0.45 + 0.5 * pu * lv})`; ctx.shadowBlur = 8 + 16 * pu * lv;
    drawBar(app, bx, 0, bw, 16, P.shown, P.trail, P.maxHp, pu > 0.5 ? '#e0344a' : '#b3263a', '');
    ctx.restore();
    const fs = 14 + Math.round(5 * pu * lv);
    app.text(hpLabel, bx + bw / 2 + sh, by + 8 - 8 - (fs - 14) * 0.5, { size: fs, align: 'center', ui: true, bold: true, color: pu > 0.5 ? '#ffb0b0' : '#ff8a8a', stroke: '#2a0408', strokeW: 4, fixed: true });
  } else
  drawBar(app, H.x + 34, H.y + 2, H.w - 38, 16, P.shown, P.trail, P.maxHp, '#b3263a', hpLabel);
  if (P.block > 0) { const k = 1 + P.bpulse * 0.35; ctx.save(); ctx.translate(H.x + 15, H.y + 11); ctx.scale(k, k); drawShield(ctx, 0, 0, 32, P.block); ctx.restore(); }
  drawStatusRow(app, P, H.x + H.w / 2, H.y + 26, H.w, 24, t, { id: 'hero', rows: 1, group: 'heroPlate' });
  app.reg('heroPlate', H.x, H.y, H.w, H.h, {});
  if (P.block > 0 && app.inRect(H.x, H.y, 30, 22)) queueTip(app, 'heroblk', [[{ title: 'Block ' + P.block, text: 'Absorbs damage until your next turn.', color: '#bcd0d8', glyph: 'square' }]], { x: H.x, y: H.y, w: 30, h: 22 });
  else if (app.inRect(H.x + 34, H.y + 2, H.w - 38, 16)) queueTip(app, 'herohp', [[{ title: heroName, text: `HP ${P.hp} / ${P.maxHp}`, color: COL.bad, glyph: 'cross' }]], { x: H.x + 34, y: H.y + 2, w: H.w - 38, h: 16 });
}


// ---- card keyword panel ----
const FLAG_HELP = {
  innate: ['Innate', 'Starts in your opening hand.'],
  retain: ['Retain', 'Stays in your hand at end of turn.'],
  exhaust: ['Exhaust', 'Removed for the rest of this combat once played.'],
  ethereal: ['Ethereal', 'Exhausts if it is still in your hand at end of turn.'],
  unplayable: ['Unplayable', 'Cannot be played.'],
};
function walkStatuses(fx, out) {
  for (const op of fx || []) {
    if (op.s && !out.has(op.s)) out.set(op.s, typeof op.n === 'number' ? op.n : 1);
    if (op.then) walkStatuses(op.then, out);
    if (op.else) walkStatuses(op.else, out);
    if (op.fx) walkStatuses(op.fx, out);
  }
}
// sections: [{title, color, text}]
export function cardSections(spec, card, dc) {
  const out = [];
  for (const f of Object.keys(spec.flags || {})) if (spec.flags[f] && FLAG_HELP[f]) out.push({ title: FLAG_HELP[f][0], color: COL.lamp, text: FLAG_HELP[f][1] });
  const sts = new Map(); walkStatuses(spec.fx, sts);
  for (const [s, n] of sts) if (STATUSES[s]) out.push({ title: stName(s), color: stCol(s), text: statusText(s, n) });
  if (spec.repeat > 0) out.push({ title: 'Plays twice', color: COL.echo, text: 'Resolves its numbers again. Draw, energy and gold do not repeat.' });
  for (const gid of spec.grafts || []) {
    const g = GRAFTS[gid]; if (!g) continue;
    const sc = SCHOOLS[g.school];
    out.push({ title: `${g.name}  (weight ${g.weight})`, color: (sc && sc.color) || COL.lamp, text: `Boon: ${g.boon}\nPrice: ${g.price}` });
  }
  if (spec.overload) out.push({ title: 'Overload', color: COL.lamp, text: 'Third graft. Damage and block x1.5. 25% to Shatter on its first play each combat: it resolves, then is destroyed for the run.' });
  if (card && card.tithed) out.push({ title: 'Tithed', color: COL.scar, text: 'Over Budget. This card fights at 75% numbers this combat.' });
  if (dc && dc.jam) out.push({ title: 'Jammed', color: '#c0713a', text: 'Costs 1 more until it is played or leaves your hand.' });
  const j = spec.price || {};
  if (j.selfHurt) out.push({ title: 'Price: blood', color: COL.bad, text: `Lose ${j.selfHurt} HP when played.` });
  return out.slice(0, 7);
}

export function drawSections(app, sections, x, y, w, maxH) {
  const pad = 10;
  const blocks = sections.map((s) => ({ s, lines: app.wrap(s.text, w - pad * 2, 14, { ui: true }) }));
  let h = pad * 2; for (const b of blocks) h += 22 + b.lines.length * 17 + 6;
  if (y + h > 712) y = Math.max(8, 712 - h);
  app.panel(x, y, w, h, { fill: 'rgba(14,12,10,.96)', stroke: 'rgba(242,193,78,.7)' });
  let yy = y + pad;
  for (const b of blocks) {
    app.text(b.s.title, x + pad, yy, { size: 16, bold: true, color: b.s.color });
    yy += 22;
    app.text(b.s.text, x + pad, yy, { size: 14, ui: true, maxW: w - pad * 2, lineH: 17, color: COL.vellum });
    yy += b.lines.length * 17 + 6;
  }
  return h;
}

export function gearIcon(ctx, x, y, w, h) {
  const cx = x + w / 2, cy = y + h / 2;
  ctx.save(); ctx.translate(cx, cy); ctx.fillStyle = COL.vellum;
  for (let i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); ctx.fillRect(-2.5, -12, 5, 6); }
  ctx.beginPath(); ctx.arc(0, 0, 8, 0, 6.283); ctx.fill();
  ctx.fillStyle = COL.slab2; ctx.beginPath(); ctx.arc(0, 0, 3.2, 0, 6.283); ctx.fill();
  ctx.restore();
}
export { drawShield, rgba, CARDS };
