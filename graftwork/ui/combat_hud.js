// Combat screen drawing helpers: bars, status rows, intent bubbles, card keyword panel.
import { COL, EASE, clamp, rgba } from './core.js';
import { STATUSES, GRAFTS, SCHOOLS, CARDS } from '../data/index.js';
import { statusText } from '../engine/text.js';
import { drawStatus, drawIntent, drawShield } from '../art/icons.js';
import { statusSlots } from './combat_layout.js';

export const STATUS_COL = { burn: COL.ember, bleed: '#d12a44', poison: '#8fd14f', vulnerable: '#e0a050', weak: '#9aa8b0', strength: '#ff9a6a', dexterity: '#7fd1e0' };
export const stCol = (id) => STATUS_COL[id] || (STATUSES[id] && STATUSES[id].good ? COL.good : COL.bad);
export const stName = (id) => (STATUSES[id] ? STATUSES[id].name : id);
export const stGood = (id) => !(STATUSES[id] && STATUSES[id].good === false);

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
  ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(x, y + 1, w * pct, Math.max(1, h * 0.28));
  ctx.restore();
  app.rr(x, y, w, h, h / 2); ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(232,220,196,.55)'; ctx.stroke();
  ctx.restore();
  if (label) app.text(label, x + w / 2, y + h / 2 - Math.round(h * 0.5), { size: Math.max(10, h - 3), align: 'center', ui: true, bold: true, shadow: true });
}

// icons with counts, pop rings, hover tooltips. ent: {st, pop}. Returns nothing.
export function drawStatusRow(app, ent, cx, y, maxW, size, t) {
  const ctx = app.ctx;
  const ids = Object.keys(ent.st).filter((s) => ent.st[s]);
  const slots = statusSlots(ids, cx, y, maxW, size);
  for (const sl of slots) {
    const n = ent.st[sl.id];
    const pop = ent.pop[sl.id] || 0;
    const sc = 1 + 0.55 * pop * pop;
    ctx.save(); ctx.translate(sl.x, sl.y); ctx.scale(sc, sc);
    drawStatus(ctx, sl.id, 0, 0, size, stGood(sl.id));
    ctx.restore();
    if (pop > 0) {
      ctx.save(); ctx.globalAlpha = pop; ctx.strokeStyle = stCol(sl.id); ctx.lineWidth = 3 * pop + 1;
      ctx.beginPath(); ctx.arc(sl.x, sl.y, size * 0.5 + (1 - pop) * size * 0.9, 0, 6.283); ctx.stroke(); ctx.restore();
    }
    app.text(String(n), sl.x + size * 0.5, sl.y + size * 0.1, { size: Math.max(11, Math.round(size * 0.55)), bold: true, ui: true, align: 'right', stroke: '#0e0e0e', strokeW: 3, color: '#fff' });
    if (app.inRect(sl.x - size / 2, sl.y - size / 2, size, size)) app.tooltip(stName(sl.id) + ' ' + n, statusText(sl.id, n), { color: stCol(sl.id) });
  }
}

export const KIND_NAME = { attack: 'Attack', defend: 'Defend', buff: 'Buff', debuff: 'Debuff', junk: 'Clog', summon: 'Summon', unknown: 'Unknown', stun: 'Stun' };
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

// Intent bubble centred at (x, y). prog 0..1 = ink-in progress.
export function drawIntentBubble(app, info, x, y, prog, alpha = 1) {
  const ctx = app.ctx;
  if (!info || prog <= 0 || alpha <= 0) return { w: 0, h: 0 };
  const kinds = info.hidden ? ['unknown'] : info.kinds.slice(0, 3);
  const showNum = !info.hidden && info.kinds.includes('attack');
  const num = showNum ? (info.hits > 1 ? `${info.per}x${info.hits}` : String(info.dmg)) : (info.hidden ? '?' : '');
  const isz = 30, numW = num ? app.measure(num, 22, { bold: true }) + 6 : 0;
  const w = kinds.length * (isz + 2) + numW + 18, h = 42;
  const sc = EASE.back(clamp(prog, 0, 1));
  ctx.save();
  ctx.globalAlpha = alpha * clamp(prog * 2.5, 0, 1);
  ctx.translate(x, y); ctx.scale(sc, sc);
  const col = info.hidden ? '#bbb' : info.kinds.includes('attack') ? '#e86a5a' : info.kinds.includes('debuff') ? '#c78bd8' : info.kinds.includes('buff') ? '#7fcf8a' : '#cfc3a8';
  app.rr(-w / 2, -h / 2, w, h, 12); ctx.fillStyle = 'rgba(16,13,12,.82)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.stroke();
  // ink wipe: reveal left to right
  ctx.save(); ctx.beginPath(); ctx.rect(-w / 2, -h, w * clamp(prog * 1.6, 0, 1), h * 2); ctx.clip();
  let cx = -w / 2 + 9 + isz / 2;
  for (const k of kinds) { drawIntent(ctx, k, cx, 0, isz); cx += isz + 2; }
  if (num) app.text(num, w / 2 - 9, -13, { size: 22, bold: true, align: 'right', color: info.hidden ? '#ddd' : '#fff', stroke: '#0e0e0e', strokeW: 4 });
  ctx.restore();
  ctx.restore();
  return { w, h };
}

export function barCol(isPlayer) { return isPlayer ? '#b3263a' : '#a8412f'; }

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
  ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); ctx.arc(0, 0, 3.2, 0, 6.283); ctx.fill();
  ctx.restore();
}
export { drawShield, rgba, CARDS };
