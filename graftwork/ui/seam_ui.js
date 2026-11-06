// THE THREAD user interface (design/THREAD.md): the rail above the hand, hand badges, and the seam event animations.
//   drawSeamRail(app, c, rect, t, focusCard, idle)  the thread rail: knots as brass-ringed school beads, a bobbing needle, payout chip
//   seamBadge(c, card)                 'extend' | 'cut' | 'slack' | 'tied' | null  (what playing this card would do)
//   seamBadgeInfo(c, card)             { kind, school, pv } for U5 when it wants the school colour too
//   drawSeamBadge(app, kind, x, y, s, school?)  needle / scissors / loose thread / clasp badge, readable at 0.54 scale
//   onSeamEvent(app, ev, ctx)          animate seamExtend / seamCut / seamSlack / seamFray / seamPay (ctx = { fx, entPos, c }); returns ms to wait
//   seamTip(app, c, rect)              the one-time 'thread' tutorial tip (call last in the tips pass)
//   payShort(school, stitches)         the short payout text shared by chip, floats and tests
import { COL, EASE, clamp, rgba } from './core.js';
import { FX_OPTS } from './fx.js';
import { drawSchoolGlyph } from '../art/cards.js';
import { schoolsOf } from '../engine/cards.js';
import { specOf } from '../engine/combat.js';
import * as SEAM from '../engine/seam.js';
import { maybeTip, threadLesson, tipSeen, TIP_TEXTS } from './tutorial.js';
import * as L from './combat_layout.js';
import { lnw } from '../art/linework.js';

const BRASS = '#C9A227', BRASS_D = '#7a5f16', BRASS_L = '#ecd27a', INK = '#0E0E0E', PAPER = '#f3ead4';
const SCHOOL_NAME = { ember: 'Ember', echo: 'Echo', hoard: 'Hoard', blood: 'Blood', rust: 'Rust', static: 'Static', gilded: 'Gilded' };
export const SEAM_MS = { extendStart: 90, extend: 140, cut: 300, pay: 280, snipClose: 60, beadFlight: 240 }; // waits (ms) the combat queue honours for the Thread beats; tests/graftwork_motion.test.mjs budgets them
const SNIP_CLOSE = 0.06; // s: the scissors close on the thread, then the snap releases the beads (anticipation before the cut)
const SPACING = 52, BEAD_R = 15, LEFT_W = 112, CHIP_W = 216;
const rnd = (a, b) => a + Math.random() * (b - a);
const schoolCol = (s) => COL[s] || BRASS;

// ---------------------------------------------------------------- shared text
export function payShort(school, n) {
  switch (school) {
    case 'ember': return `+${3 * n} Burn to all`;
    case 'echo': return `+${Math.ceil(n / 2)} Echo`;
    case 'hoard': return Math.floor(n / 2) > 0 ? `Draw ${Math.floor(n / 2)}, retain 1` : 'Retain 1';
    case 'blood': return `Heal ${2 * n}`;
    case 'rust': return `+${3 * n} Block`;
    case 'static': return `+${n} Charge, ${2 * n} zap`;
    case 'gilded': return `+${2 * n} gold, ${2 * n} Block`;
    default: return `${n} stitches`;
  }
}
const payLine = (pay) => pay.map((p) => payShort(p.school, p.stitches)).join(' and ');

// ---------------------------------------------------------------- module state (one combat at a time)
const M = { lastSchool: null, c: null, rect: null, beads: [], fly: [], sigs: [], puffs: [], nx: null, nxT: 0, pullT: -9, snipT: -9, snipX: 0, payIdx: 0, fx: null };
function reset(c) { M.lesson = null; M.c = c; M.beads = []; M.fly = []; M.sigs = []; M.puffs = []; M.nx = null; M.pullT = -9; M.snipT = -9; M.payIdx = 0; }
const reduced = (app) => !!((app.shared && app.shared.meta && app.shared.meta.settings && app.shared.meta.settings.reducedMotion) || FX_OPTS.reduced);
const lx0 = (r) => r.x + LEFT_W;
const lx1 = (r) => r.x + r.w - CHIP_W - 10;
const beadPos = (r, i) => ({ x: lx0(r) + 34 + i * SPACING, y: r.y + r.h / 2 });

function snd(app, name, fallback, o) {
  const a = app.shared && app.shared.audio; if (!a || !a.sfx) return;
  const names = a.SFX_NAMES;
  const n = !names || names.includes(name) ? name : fallback;
  if (n) a.sfx(n, o);
}
function fitText(app, str, x, y, size, o = {}) {
  const w = o.maxW || 200, rest = { ...o, ui: true, maxW: undefined, fit: { w, lines: o.lines || 1, h: o.h } };
  return app.text(str, x, y, { ...rest, size });
}

// ---------------------------------------------------------------- preview / badge logic
function fallbackPreview(c, card) {
  const s = c.seam, spec = specOf(c, card), set = schoolsOf(spec);
  const mk = (kind, school) => ({ kind, school: school || null, len: s.len, payout: [] });
  if (card.jam || !set.length) return mk('slack', set[0]);
  if (spec.fused && spec.fused.length) return mk('tied', set[0]);
  if (s.len === 0) return mk('extend', set[0]);
  const shared = set.find((x) => s.set.includes(x));
  return shared ? mk('extend', shared) : mk('cut', set[0]);
}
export function seamBadgeInfo(c, card) {
  if (!c || !c.seam || !card) return null;
  let pv = null;
  try { if (typeof SEAM.seamPreview === 'function') pv = SEAM.seamPreview(c, card); } catch (e) { pv = null; }
  if (!pv) { try { pv = fallbackPreview(c, card); } catch (e) { return null; } }
  return { kind: pv.kind, school: pv.school, pv };
}
export function seamBadge(c, card) { const i = seamBadgeInfo(c, card); M.lastSchool = i ? i.school : null; return i ? i.kind : null; }

// What cutting the Line right now would pay (approximate when no card is focused; the real number is E1's seamPreview).
function worthNow(c) {
  const s = c.seam;
  if (s.len < 2 || s.cuts >= 3) return [];
  const cap = typeof SEAM.seamCap === 'function' ? SEAM.seamCap(c) : 5;
  const S = Math.min(s.len, cap) - 1; if (S <= 0) return [];
  const tier = (x) => (c.res && c.res[x]) || 0;
  const sch = s.order.filter((x) => s.counts[x] > 0); if (!sch.length) return [];
  const rank = (x) => s.counts[x] * 10 + (s.set.includes(x) ? 1 : 0);
  let top = sch[0]; for (const x of sch) if (rank(x) > rank(top)) top = x;
  const times = 1 + (tier(top) >= 6 ? 1 : 0) + (s.cuts === 0 && (s.tapestry || (c.player.st && c.player.st.tapestry > 0)) ? 1 : 0);
  const out = [{ school: top, stitches: (S + (tier(top) >= 3 ? 1 : 0)) * times }];
  const rest = sch.filter((x) => x !== top && s.counts[x] >= 2);
  if (rest.length && Math.floor(S / 2) > 0) {
    let sec = rest[0]; for (const x of rest) if (s.counts[x] > s.counts[sec]) sec = x;
    out.push({ school: sec, stitches: (Math.floor(S / 2) + (tier(sec) >= 3 ? 1 : 0)) * times });
  }
  return out;
}

// ---------------------------------------------------------------- glyphs
function badgeGlyph(ctx, kind, x, y, r, col) {
  ctx.save(); ctx.translate(x, y); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = lnw(Math.max(1.6, r * 0.2));
  if (kind === 'extend') { // needle with an eye and a thread tail
    ctx.beginPath(); ctx.moveTo(-r * 0.62, r * 0.62); ctx.lineTo(r * 0.7, -r * 0.7); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-r * 0.5, r * 0.5, r * 0.16, r * 0.3, 0.78, 0, 6.283); ctx.fillStyle = INK; ctx.fill(); ctx.stroke();
    ctx.lineWidth = lnw(Math.max(1.2, r * 0.12)); ctx.beginPath(); ctx.moveTo(-r * 0.66, r * 0.7); ctx.quadraticCurveTo(-r * 0.9, r * 0.2, -r * 0.4, r * 0.05); ctx.stroke();
  } else if (kind === 'cut') { // scissors
    ctx.beginPath(); ctx.moveTo(-r * 0.4, -r * 0.4); ctx.lineTo(r * 0.8, r * 0.5); ctx.moveTo(-r * 0.4, r * 0.4); ctx.lineTo(r * 0.8, -r * 0.5); ctx.stroke();
    ctx.lineWidth = lnw(Math.max(1.4, r * 0.15));
    ctx.beginPath(); ctx.arc(-r * 0.62, -r * 0.5, r * 0.26, 0, 6.283); ctx.stroke(); ctx.beginPath(); ctx.arc(-r * 0.62, r * 0.5, r * 0.26, 0, 6.283); ctx.stroke();
  } else if (kind === 'slack') { // a loose thread
    ctx.beginPath(); ctx.moveTo(-r * 0.8, r * 0.1); ctx.bezierCurveTo(-r * 0.4, -r * 0.7, -r * 0.1, r * 0.7, r * 0.25, -r * 0.1); ctx.bezierCurveTo(r * 0.45, -r * 0.45, r * 0.75, -r * 0.2, r * 0.55, r * 0.15); ctx.stroke();
  } else { // tied: a brass clasp, two interlocked rings
    ctx.beginPath(); ctx.arc(-r * 0.28, 0, r * 0.46, 0, 6.283); ctx.stroke(); ctx.beginPath(); ctx.arc(r * 0.28, 0, r * 0.46, 0, 6.283); ctx.stroke();
  }
  ctx.restore();
}
function badgeBody(ctx, kind, x, y, r, col) {
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath();
  if (kind === 'cut') { for (let i = 0; i < 6; i++) { const a = i / 6 * 6.2832 + 0.5236; i ? ctx.lineTo(Math.cos(a) * r * 1.08, Math.sin(a) * r * 1.08) : ctx.moveTo(Math.cos(a) * r * 1.08, Math.sin(a) * r * 1.08); } ctx.closePath(); }
  else if (kind === 'slack') { const q = r * 0.92; ctx.moveTo(-q, -q * 0.3); ctx.quadraticCurveTo(-q, -q, -q * 0.3, -q); ctx.lineTo(q * 0.3, -q); ctx.quadraticCurveTo(q, -q, q, -q * 0.3); ctx.lineTo(q, q * 0.3); ctx.quadraticCurveTo(q, q, q * 0.3, q); ctx.lineTo(-q * 0.3, q); ctx.quadraticCurveTo(-q, q, -q, q * 0.3); ctx.closePath(); }
  else ctx.arc(0, 0, r, 0, 6.283);
  ctx.fillStyle = 'rgba(16,12,10,.94)'; ctx.fill();
  ctx.lineWidth = lnw(Math.max(2, r * 0.2)); ctx.strokeStyle = col;
  if (kind === 'slack' && ctx.setLineDash) ctx.setLineDash([r * 0.5, r * 0.3]);
  ctx.stroke();
  if (ctx.setLineDash) ctx.setLineDash([]);
  if (kind === 'tied') { ctx.beginPath(); ctx.arc(0, 0, r * 1.2, 0, 6.283); ctx.lineWidth = lnw(Math.max(1, r * 0.1)); ctx.strokeStyle = BRASS; ctx.stroke(); }
  ctx.restore();
}
export function drawSeamBadge(app, kind, x, y, s, school) {
  if (!kind) return;
  if (school === undefined) school = M.lastSchool; // U5 calls seamBadge() right before drawSeamBadge()
  const ctx = app.ctx, r = clamp(24 * (s || 1), 10, 30), col = school ? schoolCol(school) : BRASS;
  badgeBody(ctx, kind, x, y, r, col);
  badgeGlyph(ctx, kind, x, y, r * 0.78, kind === 'slack' ? '#cfc7b4' : PAPER);
  if (school) drawSchoolGlyph(ctx, school, x + r * 0.78, y + r * 0.78, Math.max(5, r * 0.5), col);
}

function drawBead(ctx, x, y, school, o = {}) {
  const sc = o.scale === undefined ? 1 : o.scale, col = o.tint || schoolCol(school);
  ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); ctx.globalAlpha *= o.alpha === undefined ? 1 : o.alpha;
  if (o.hot) { ctx.beginPath(); ctx.arc(0, 0, BEAD_R + 5 + (o.pulse || 0), 0, 6.283); ctx.strokeStyle = rgba(col.length === 7 ? col : '#ffffff', 0.55); ctx.lineWidth = lnw(2.5); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(0, 0, BEAD_R, 0, 6.283); ctx.fillStyle = o.ghost ? 'rgba(30,50,56,.55)' : '#1d1813'; ctx.fill();
  ctx.lineWidth = lnw(3.4); ctx.strokeStyle = o.ghost ? col : BRASS_D; ctx.stroke();
  if (!o.ghost) { ctx.beginPath(); ctx.arc(0, 0, BEAD_R - 0.6, -2.6, -0.5); ctx.lineWidth = lnw(1.5); ctx.strokeStyle = BRASS_L; ctx.stroke(); }
  drawSchoolGlyph(ctx, school, 0, 0, 10.5, col);
  ctx.restore();
}
function drawNeedle(ctx, x, y, ang) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  const g = ctx.createLinearGradient(0, -3, 0, 3); g.addColorStop(0, '#f4f7f8'); g.addColorStop(1, '#8e999e');
  ctx.beginPath(); ctx.moveTo(-17, -2.6); ctx.lineTo(14, -1.6); ctx.lineTo(24, 0); ctx.lineTo(14, 1.6); ctx.lineTo(-17, 2.6); ctx.closePath();
  ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = lnw(1); ctx.strokeStyle = INK; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(-12, 0, 1.6, 0.9, 0, 0, 6.283); ctx.fillStyle = INK; ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- the rail
export function drawSeamRail(app, c, rect, t, focus, idle) {
  if (!c || !c.seam) return;
  rect = rect || L.SEAM;
  if (M.c !== c) reset(c);
  M.rect = rect;
  const ctx = app.ctx, s = c.seam, now = app.t, red = reduced(app);
  if (app.reg) app.reg('seamRail', rect.x, rect.y, rect.w, rect.h, { layer: 'hud', group: 'seam' });
  // keep the shown beads in step with the real Line whenever the event queue is idle
  if (idle !== false && !M.fly.length && M.beads.length !== s.len) {
    const seq = [];
    for (const k of s.order) for (let i = 0; i < (s.counts[k] || 0); i++) seq.push(k);
    while (seq.length > s.len) seq.pop();
    while (seq.length < s.len) seq.push(s.set[0] || s.order[0] || 'ember');
    M.beads = seq.map((k) => ({ school: k, born: -9 }));
  }
  const n = M.beads.length, cy = rect.y + rect.h / 2, a0 = lx0(rect), a1 = lx1(rect);
  const pv = focus ? seamBadgeInfo(c, focus) : null;
  const ghost = pv && pv.kind === 'extend' && pv.school && !s.tied;

  // panel
  ctx.save();
  app.rr(rect.x, rect.y, rect.w, rect.h, 12); ctx.fillStyle = 'rgba(14,12,10,.74)'; ctx.fill(); ctx.lineWidth = lnw(1.5); ctx.strokeStyle = s.tied ? BRASS : 'rgba(232,220,196,.22)'; ctx.stroke();

  // left block: label, knot count, cut pips, frayed icon
  const tl = app.layoutText(s.tied ? 'TIED' : 'THREAD', { size: 11, ui: true, bold: true, fit: { w: 66, lines: 1 } }), pip0 = rect.x + 14 + tl.w + 9;
  app.text(s.tied ? 'TIED' : 'THREAD', rect.x + 14, rect.y + 6, { size: tl.size, exact: true, ui: true, bold: true, color: s.tied ? BRASS_L : BRASS });
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(pip0 + i * 10, rect.y + 6 + tl.size * 0.55, 3.4, 0, 6.283); ctx.fillStyle = i < s.cuts ? '#6a6458' : BRASS; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = lnw(1); ctx.stroke(); }
  fitText(app, `${s.len} knot${s.len === 1 ? '' : 's'}`, rect.x + 14, rect.y + 23, 17, { bold: true, color: COL.vellum, maxW: 90 });
  const jammed = (c.hand || []).filter((k) => k.jam).length;
  if (jammed) { // frayed icon: a thread ending in loose strands
    const fx0 = rect.x + 104, fy0 = rect.y + 37;
    ctx.strokeStyle = '#d8a066'; ctx.lineWidth = lnw(1.8); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(fx0 - 9, fy0); ctx.lineTo(fx0, fy0); ctx.moveTo(fx0, fy0); ctx.lineTo(fx0 + 8, fy0 - 5); ctx.moveTo(fx0, fy0); ctx.lineTo(fx0 + 9, fy0); ctx.moveTo(fx0, fy0); ctx.lineTo(fx0 + 8, fy0 + 5); ctx.stroke();
    app.text(String(jammed), fx0 - 14, fy0 - 7, { size: 11, ui: true, bold: true, color: '#d8a066', align: 'right' });
  }

  // the seam: a dashed slit in the cloth under the thread
  ctx.strokeStyle = 'rgba(232,220,196,.26)'; ctx.lineWidth = lnw(2); if (ctx.setLineDash) ctx.setLineDash([7, 6]);
  ctx.beginPath(); ctx.moveTo(a0, cy); ctx.lineTo(a1, cy); ctx.stroke(); if (ctx.setLineDash) ctx.setLineDash([]);
  // start anchor: a grommet, or the brass clasp when Tied
  if (s.tied) {
    ctx.strokeStyle = BRASS_L; ctx.lineWidth = lnw(3); ctx.beginPath(); ctx.arc(a0 - 3, cy, 8, 0, 6.283); ctx.stroke(); ctx.beginPath(); ctx.arc(a0 + 6, cy, 8, 0, 6.283); ctx.strokeStyle = BRASS; ctx.stroke();
  } else { ctx.beginPath(); ctx.arc(a0, cy, 5, 0, 6.283); ctx.fillStyle = '#1d1813'; ctx.fill(); ctx.lineWidth = lnw(2.5); ctx.strokeStyle = BRASS_D; ctx.stroke(); }

  // needle position (eased) and the pull animation
  const lastX = n ? beadPos(rect, n - 1).x : a0;
  let nTarget = n ? lastX + 40 : a0 + 24;
  if (ghost) nTarget += SPACING * 0.62;
  if (M.nx === null) M.nx = nTarget;
  M.nx += (nTarget - M.nx) * Math.min(1, (now - M.nxT > 0.5 ? 0.5 : now - M.nxT) * 14); M.nxT = now;
  const pk = clamp((now - M.pullT) / 0.28, 0, 1);
  const pull = red ? 0 : (1 - EASE.out(pk)) * 26 * (M.pullT > -5 ? 1 : 0);
  const bob = red ? 0 : Math.sin(now * 3.2) * 2.2;
  const ang = -0.38 + (red ? 0 : Math.sin(now * 2.4) * 0.07);
  const ndx = M.nx + pull, ndy = cy + bob - 3;
  const eye = { x: ndx - Math.cos(ang) * 12, y: ndy - Math.sin(ang) * 12 };

  // the thread, whipping after a cut
  const whip = red ? 0 : clamp(1 - (now - M.snipT) / 0.5, 0, 1);
  const thread = (w, col) => {
    ctx.beginPath(); ctx.moveTo(a0, cy); let px = a0, py = cy;
    for (let i = 0; i < n; i++) { const b = beadPos(rect, i); ctx.quadraticCurveTo((px + b.x) / 2, cy + 6, b.x, cy); px = b.x; py = cy; }
    ctx.quadraticCurveTo((px + eye.x) / 2, cy + 7, eye.x, eye.y); ctx.lineWidth = lnw(w); ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.stroke();
  };
  if (n || whip <= 0) { thread(5.5, 'rgba(232,220,196,.28)'); thread(3, '#0a0908'); }
  if (!n && whip > 0) { // recoiling stub
    const sx = M.snipX, len = Math.max(20, (sx - a0) * whip);
    ctx.beginPath(); ctx.moveTo(a0, cy);
    for (let i = 1; i <= 12; i++) { const x = a0 + (len * i) / 12; ctx.lineTo(x, cy + Math.sin(i * 1.3 + now * 40) * 9 * whip); }
    ctx.lineWidth = lnw(3); ctx.strokeStyle = '#0a0908'; ctx.stroke();
  }

  // beads
  const hotSet = s.set || [];
  for (let i = 0; i < n; i++) {
    const b = M.beads[i], p = beadPos(rect, i), k = clamp((now - b.born) / 0.26, 0, 1);
    const sc = k >= 1 ? 1 : 1 + (1 - EASE.out(k)) * 0.7;
    drawBead(ctx, p.x, p.y, b.school, { scale: sc, hot: hotSet.includes(b.school), pulse: red ? 0 : Math.sin(now * 4 + i) * 1.2 });
  }
  // ghost bead for the hovered / selected card that would extend, scissors for one that would cut
  if (ghost) {
    const p = beadPos(rect, n); const pa = 0.5 + (red ? 0 : Math.sin(now * 5) * 0.15);
    drawBead(ctx, p.x, p.y, pv.school, { ghost: true, alpha: pa });
  } else if (pv && pv.kind === 'cut' && n) {
    const sx = lastX + 30; ctx.save(); ctx.globalAlpha = 0.9; badgeGlyph(ctx, 'cut', sx, cy - 20 + (red ? 0 : Math.sin(now * 6) * 1.5), 12, BRASS_L); ctx.restore();
  }
  drawNeedle(ctx, ndx, ndy, ang);

  // teaching text when the Line is empty or short
  if (!pv) {
    if (s.len === 0) fitText(app, 'Share a school with the last card to tie a knot.', a0 + 66, cy - 23, 14, { lines: 2, h: 46, maxW: a1 - a0 - 70, color: 'rgba(232,220,196,.9)' });
    else if (s.len === 1) {
      fitText(app, 'Play a card with the same school to tie a knot.', lastX + 96, cy - 23, 14, { lines: 2, h: 46, maxW: a1 - lastX - 96, color: 'rgba(232,220,196,.88)' });
    }
  }
  ctx.restore();

  drawChip(app, c, rect, pv);
  drawOverlays(app, c, rect);
}

function drawChip(app, c, rect, pv) {
  const ctx = app.ctx, s = c.seam, x = rect.x + rect.w - CHIP_W, y = rect.y + 5, w = CHIP_W - 8, h = rect.h - 10;
  let kind = null, school = null, l1 = '', l2 = '';
  if (pv) {
    kind = pv.kind; school = pv.school; const p = pv.pv;
    const pay = p.payout || [];
    if (kind === 'extend') { l1 = s.len === 0 ? 'Starts a Line' : 'Ties a knot'; l2 = pay.length ? `If cut after: ${payLine(pay)}` : `Line grows to ${p.len}`; }
    else if (kind === 'cut') { l1 = 'Cuts the Line'; l2 = pay.length ? `Pays ${payLine(pay)}` : 'Nothing to cash'; }
    else if (kind === 'tied') { l1 = 'Tied: carries on'; l2 = 'Line is not cut'; }
    else { l1 = 'Slack'; l2 = 'Line is unchanged'; }
  } else if (s.len >= 2) {
    const w2 = worthNow(c); kind = 'cut'; school = w2[0] ? w2[0].school : s.set[0];
    l1 = s.cuts >= 3 ? 'Cuts spent' : 'Cut now'; l2 = s.cuts >= 3 ? 'Later cuts pay nothing' : w2.length ? `Pays ${payLine(w2)}` : 'Nothing to cash';
  } else return;
  const col = school ? schoolCol(school) : BRASS;
  ctx.save();
  app.rr(x, y, w, h, 9); ctx.fillStyle = 'rgba(30,24,18,.9)'; ctx.fill(); ctx.lineWidth = lnw(2); ctx.strokeStyle = col; ctx.stroke();
  ctx.restore();
  drawSeamBadge(app, kind, x + 20, y + h / 2, 0.62, school);
  fitText(app, l1, x + 42, y + 3, 14, { bold: true, color: col === COL.gilded || col === COL.static || col === COL.echo ? col : COL.vellum, maxW: w - 48 });
  fitText(app, l2, x + 42, y + h / 2 + 1, 13, { color: 'rgba(232,220,196,.88)', maxW: w - 48 });
}

// ---------------------------------------------------------------- overlays (flying beads, snip, signature moments, puffs)
function drawOverlays(app, c, rect) {
  const ctx = app.ctx, now = app.t, cy = rect.y + rect.h / 2;
  // flying beads
  for (const f of M.fly) {
    const k = clamp((now - f.t0 - f.delay) / f.dur, 0, 1); if (now < f.t0 + f.delay) { drawBead(ctx, f.x0, f.y0, f.school, { tint: f.grey ? '#8a8478' : undefined }); continue; }
    const e = EASE.in(k); // accelerate into the target so the bead lands with speed
    const x = f.x0 + (f.x1 - f.x0) * e, y = f.y0 + (f.y1 - f.y0) * e + (f.grey ? 0 : -Math.sin(k * Math.PI) * f.arc);
    drawBead(ctx, x, y, f.school, { scale: 1 - 0.55 * e, alpha: 1 - Math.max(0, k - 0.75) * 4, tint: f.grey ? '#8a8478' : undefined });
    if (!f.grey && !f.trailed && FX_OPTS.reduced === false && M.fx && k > 0.02) M.fx.emit({ x, y, n: 1, color: schoolCol(f.school), speed: 20, life: 0.3, size: 3, gravity: 0, glow: false });
  }
  for (const f of M.fly) if (now >= f.t0 + f.delay + f.dur && !f.grey && !f.landed && M.fx) { f.landed = true; M.fx.burst(f.x1, f.y1, 'spark', { n: 4, speed: 110, life: 0.25, size: 2.5, colors: [schoolCol(f.school), '#fff6c8'] }); }
  M.fly = M.fly.filter((f) => now < f.t0 + f.delay + f.dur);
  // the snip: scissors close on the thread with a bright flash
  const sk = (now - M.snipT) / 0.5;
  if (sk >= 0 && sk < 1) {
    const x = M.snipX, close = clamp(sk / (SNIP_CLOSE / 0.5), 0, 1), fl = (sk - SNIP_CLOSE / 0.5) / 0.28;
    ctx.save(); ctx.globalAlpha = 1 - clamp((sk - 0.5) / 0.5, 0, 1);
    if (fl >= 0 && fl < 1) { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = '#fff'; ctx.lineWidth = lnw(4 * (1 - fl) + 1); ctx.beginPath(); ctx.moveTo(x, rect.y - 6); ctx.lineTo(x, rect.y + rect.h + 6); ctx.stroke(); ctx.beginPath(); ctx.arc(x, cy, 26 * (1 - fl) + 6, 0, 6.283); ctx.fillStyle = 'rgba(255,248,214,.55)'; ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
    const sy = cy - 4 - (sk > 0.3 ? (sk - 0.3) * 40 : 0), open = 1 - close;
    ctx.translate(x + 6, sy); ctx.rotate(-0.4 + open * 0.0);
    ctx.lineCap = 'round'; ctx.strokeStyle = '#dfe6ea'; ctx.lineWidth = lnw(3.2);
    const sp = open * 0.5;
    ctx.save(); ctx.rotate(sp); ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(18, 0); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.rotate(-sp); ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(18, 0); ctx.stroke(); ctx.restore();
    ctx.strokeStyle = BRASS; ctx.lineWidth = lnw(2.4); ctx.beginPath(); ctx.arc(-20, -5, 5, 0, 6.283); ctx.stroke(); ctx.beginPath(); ctx.arc(-20, 5, 5, 0, 6.283); ctx.stroke();
    ctx.restore();
  }
  // signature moments
  for (const g of M.sigs) {
    const k = (now - g.t0) / g.dur; if (k < 0 || k > 1) continue;
    SIG_DRAW[g.kind] && SIG_DRAW[g.kind](app, g, k, rect, cy);
  }
  M.sigs = M.sigs.filter((g) => now - g.t0 < g.dur);
  // grey puffs
  for (const p of M.puffs) {
    const k = (now - p.t0) / 0.5; if (k < 0 || k > 1) continue;
    ctx.save(); ctx.globalAlpha = (1 - k) * 0.5; ctx.fillStyle = '#9a9488';
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(p.x + (i - 1) * 7 * k, p.y - k * 14 - i * 2, 4 + k * 6, 0, 6.283); ctx.fill(); }
    ctx.restore();
  }
  M.puffs = M.puffs.filter((p) => now - p.t0 < 0.5);
}

const SIG_DRAW = {
  ember(app, g, k, rect) { // the rail edge ignites
    const ctx = app.ctx; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (1 - k) * 0.85;
    ctx.lineWidth = lnw(3 + 3 * (1 - k)); ctx.strokeStyle = '#ff8a3c'; app.rr(rect.x, rect.y, rect.w, rect.h, 12); ctx.stroke();
    ctx.globalAlpha = (1 - k) * 0.25; ctx.fillStyle = '#ff6a2b'; ctx.fillRect(rect.x + 4, rect.y + rect.h - 10 - 18 * (1 - k), rect.w - 8, 14); ctx.restore();
  },
  echo(app, g, k, rect) { // a glass twin of the Line replays three times, each fainter
    const ctx = app.ctx;
    for (let r = 1; r <= 3; r++) {
      const kk = clamp((k - r * 0.14) / 0.4, 0, 1); if (kk <= 0 || kk >= 1) continue;
      for (const b of g.beads) drawBead(ctx, b.x + r * 15, b.y - r * 3, b.school, { ghost: true, alpha: (1 - kk) * 0.55, tint: '#9fe3ef', scale: 1 + kk * 0.1 });
    }
  },
  hoard(app, g, k, rect) { // a coin stack rattles up, then bursts
    const ctx = app.ctx, x = g.x, y = rect.y + rect.h - 6; if (k > 0.62) { if (!g.burst && M.fx) { g.burst = true; M.fx.emit({ x, y: y - 40, n: 18, colors: ['#F2C14E', '#ffe38a', '#C9A227'], speed: 320, life: 1.0, size: 6, gravity: 900, shape: 'coin', angle: -Math.PI / 2, spread: 2.2 }); } return; }
    const cnt = g.n, shown = Math.min(cnt, Math.ceil((k / 0.6) * cnt));
    for (let i = 0; i < shown; i++) {
      const wob = Math.sin(app.t * 40 + i * 2) * (1 + k * 3), cyy = y - i * 6;
      ctx.beginPath(); ctx.ellipse(x + wob, cyy, 13, 4.6, 0, 0, 6.283); ctx.fillStyle = i % 2 ? '#ecd27a' : '#C9A227'; ctx.fill(); ctx.lineWidth = lnw(1.4); ctx.strokeStyle = INK; ctx.stroke();
    }
  },
  blood(app, g, k, rect, cy) { // a seam opens along the Line, then stitches shut
    const ctx = app.ctx, x0 = lx0(rect) + 8, x1 = Math.min(lx1(rect), g.x1);
    const open = k < 0.5 ? EASE.out(k / 0.5) : 1 - EASE.in((k - 0.5) / 0.3 > 1 ? 1 : (k - 0.5) / 0.3);
    if (open > 0.02) {
      ctx.beginPath(); ctx.moveTo(x0, cy); ctx.quadraticCurveTo((x0 + x1) / 2, cy - 11 * open, x1, cy); ctx.quadraticCurveTo((x0 + x1) / 2, cy + 11 * open, x0, cy);
      ctx.fillStyle = '#3a0510'; ctx.fill(); ctx.lineWidth = lnw(2); ctx.strokeStyle = '#c4223c'; ctx.stroke();
    }
    if (k > 0.5) { const cnt = Math.floor(clamp((k - 0.5) / 0.4, 0, 1) * 8); ctx.strokeStyle = '#e9d9c0'; ctx.lineWidth = lnw(1.8); ctx.beginPath(); for (let i = 0; i < cnt; i++) { const x = x0 + (x1 - x0) * (i + 0.5) / 8; ctx.moveTo(x - 3, cy - 7); ctx.lineTo(x + 3, cy + 7); } ctx.stroke(); }
  },
  rust(app, g, k, rect, cy) { // an orange bloom where the plates corrode
    const ctx = app.ctx, r = 40 + 110 * EASE.out(k), gr = ctx.createRadialGradient(g.x, cy, 4, g.x, cy, r);
    gr.addColorStop(0, `rgba(255,150,60,${0.6 * (1 - k)})`); gr.addColorStop(1, 'rgba(255,120,30,0)');
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = gr; ctx.fillRect(g.x - r, cy - r, r * 2, r * 2); ctx.restore();
  },
  static(app, g, k, rect, cy) { // a one-frame white snap along the rail
    if (k > 0.25) return; const ctx = app.ctx; ctx.save(); ctx.globalAlpha = 1 - k * 4; ctx.strokeStyle = '#fff'; ctx.lineWidth = lnw(2); ctx.shadowColor = '#E8F542'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.moveTo(rect.x + 6, cy); for (let i = 1; i < 14; i++) ctx.lineTo(rect.x + 6 + (rect.w - 12) * i / 14, cy + (i % 2 ? -1 : 1) * (6 + (i * 37) % 7)); ctx.stroke(); ctx.restore();
  },
  gilded(app, g, k) { // gold-leaf god-ray fan
    const ctx = app.ctx; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(g.x, g.y);
    const a = Math.sin(Math.min(1, k * 1.6) * Math.PI) * 0.5, len = 120 + 170 * EASE.out(k);
    for (let i = 0; i < 9; i++) {
      const ang = -Math.PI / 2 + (i - 4) * 0.2 + Math.sin(app.t * 1.5 + i) * 0.02; const gr = ctx.createLinearGradient(0, 0, Math.cos(ang) * len, Math.sin(ang) * len);
      gr.addColorStop(0, `rgba(255,236,170,${a})`); gr.addColorStop(1, 'rgba(255,236,170,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(ang - 0.045) * len, Math.sin(ang - 0.045) * len); ctx.lineTo(Math.cos(ang + 0.045) * len, Math.sin(ang + 0.045) * len); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  },
};

// ---------------------------------------------------------------- events
function liveEnemies(c) { return (c.enemies || []).filter((e) => !e.dead); }
function targetFor(school, ctx, i) {
  const c = ctx.c, pos = ctx.entPos || (() => ({ x: 260, y: 360 }));
  if (school === 'ember') { const live = c ? liveEnemies(c) : []; if (live.length) return pos(live[i % live.length].uid); }
  if (school === 'gilded') return { x: L.GOLD_POS.x, y: L.GOLD_POS.y };
  if (school === 'hoard') return { x: L.DRAW_POS.x, y: L.DRAW_POS.y - 40 };
  return pos('player');
}

export function onSeamEvent(app, ev, ctx = {}) {
  const fx = ctx.fx, c = ctx.c || M.c;
  if (c && M.c !== c) reset(c);
  M.fx = fx || M.fx;
  const now = app.t, red = reduced(app), rect = M.rect || L.SEAM, cy = rect.y + rect.h / 2;
  { const lesson = threadLesson(app, ev); if (lesson && !(lesson === 'thread_chain' && M.lesson === 'thread_cut')) M.lesson = lesson; }
  switch (ev.t) {
    case 'seamExtend': {
      if (ev.start) M.beads.length = 0;
      const want = Math.max(1, ev.len | 0), school = ev.school || (c && c.seam && c.seam.set[0]) || 'ember';
      let grew = false;
      while (M.beads.length < want) { M.beads.push({ school, born: now }); grew = true; }
      if (M.beads.length > want) M.beads.length = want;
      if (!grew && M.beads.length) M.beads[M.beads.length - 1].born = now;
      M.pullT = now;
      const p = beadPos(rect, M.beads.length - 1);
      if (fx) { fx.burst(p.x, p.y, 'spark', { n: ev.start ? 4 : 8, speed: 180, life: 0.35, size: 2.5, colors: [schoolCol(school), '#fff6c8', BRASS_L] }); }
      snd(app, 'knotTie', 'uiClick', { pitch: 0.9 + Math.min(0.5, M.beads.length * 0.1), vol: 0.7 });
      if (!ev.start) snd(app, 'needlePull', null, { vol: 0.5 });
      return red ? 50 : ev.start ? SEAM_MS.extendStart : SEAM_MS.extend;
    }
    case 'seamCut': {
      M.payIdx = 0;
      const beads = M.beads.splice(0), paid = ev.paid | 0, school = ev.school;
      const sx = beads.length ? beadPos(rect, beads.length - 1).x + 30 : lx0(rect) + 20;
      M.snipT = now; M.snipX = sx;
      const grey = paid <= 0 || !school;
      beads.forEach((b, i) => {
        const p = beadPos(rect, i), tg = grey ? { x: p.x + rnd(-14, 14), y: rect.y + rect.h + 120 } : targetFor(school, { ...ctx, c }, i);
        M.fly.push({ school: b.school, x0: p.x, y0: p.y, x1: tg.x, y1: tg.y, t0: now + (red ? 0 : SNIP_CLOSE), delay: red ? 0 : i * 0.03, dur: red ? 0.2 : grey ? 0.45 : 0.24, arc: rnd(40, 90), grey });
      });
      M.nx = null;
      const snap = () => { fx.flash('#fff3c8', 0.16, 0.12); fx.burst(sx, cy, 'spark', { n: 14, speed: 300, life: 0.4, colors: ['#ffffff', BRASS_L, '#dfe6ea'] }); fx.shake(0.12); };
      if (fx && !red) { if (app.after) app.after(SNIP_CLOSE * 1000, snap); else snap(); }
      snd(app, 'snip', 'hitSmall', { vol: 0.8, pitch: 1.3 });
      snd(app, 'threadCut', null, { vol: 0.8 });
      if (ev.kind === 'break' && fx) fx.float('Snapped', sx, rect.y - 14, { color: '#9a9488', size: 18 });
      return red ? 80 : grey ? 200 : SEAM_MS.cut;
    }
    case 'seamPay': {
      const school = ev.school, col = schoolCol(school), amount = ev.amount | 0, idx = M.payIdx++;
      const label = payFloat(school, amount);
      const tg = targetFor(school, { ...ctx, c }, 0);
      const targets = school === 'ember' && c && liveEnemies(c).length ? liveEnemies(c).map((e) => (ctx.entPos ? ctx.entPos(e.uid) : tg)) : [tg];
      if (fx) {
        targets.forEach((p, i) => fx.float(label, p.x, p.y - 70 - idx * 30 - i * 0, { color: amount > 0 ? col : '#9a9488', size: 26, big: true, life: 1.2 }));
        signature(app, school, ev, { fx, c, rect, cy, targets, tg, red, entPos: ctx.entPos });
      }
      snd(app, PAY_SFX[school] || 'cardPlay', null, { vol: 0.8 });
      return red ? 90 : SEAM_MS.pay;
    }
    case 'seamSlack': {
      const p = { x: (M.nx === null ? lx0(rect) + 24 : M.nx), y: cy - 8 };
      M.puffs.push({ x: p.x, y: p.y, t0: now });
      if (fx && !red) fx.burst(p.x, p.y, 'dust', { n: 4, speed: 50, life: 0.5, size: 3 });
      return 40;
    }
    case 'seamFray': {
      const p = { x: (M.nx === null ? lx0(rect) + 24 : M.nx), y: cy - 8 };
      M.puffs.push({ x: p.x, y: p.y, t0: now });
      if (fx) fx.float('Frayed', p.x, rect.y - 10, { color: '#d8a066', size: 18, life: 0.9 });
      snd(app, 'jam', null, { vol: 0.3, pitch: 1.4 });
      return 40;
    }
    default: return 0;
  }
}
const PAY_SFX = { ember: 'burnApply', echo: 'echo', hoard: 'coin', blood: 'heal', rust: 'rustGrind', static: 'static', gilded: 'gilded' };
function payFloat(school, a) {
  if (a <= 0 && school !== 'hoard') return 'Capped';
  switch (school) {
    case 'ember': return `+${a} Burn`;
    case 'echo': return `+${a} Echo`;
    case 'hoard': return a > 0 ? `Draw ${a}` : 'Retain 1';
    case 'blood': return `+${a} Heal`;
    case 'rust': return `+${a} Block`;
    case 'static': return `+${a} Charge`;
    case 'gilded': return `+${a} Gold`;
    default: return `+${a}`;
  }
}

// Each school's signature moment (ART_BIBLE). Uses fx.emit / bolt / ring so it works with the old and the new fx.js.
function signature(app, school, ev, o) {
  const { fx, rect, cy, targets, tg, red, c } = o, now = app.t, endX = M.snipX || lx0(rect) + 100;
  const add = (kind, dur, extra) => M.sigs.push({ kind, t0: now, dur, ...extra });
  switch (school) {
    case 'ember': {
      add('ember', 0.8, {});
      if (!red) for (let i = 0; i < 6; i++) fx.emit({ x: rect.x + 40 + (rect.w - 80) * (i / 5), y: rect.y + 3, n: 3, colors: ['#ff6a2b', '#ffb347', '#ffe08a'], angle: -Math.PI / 2, spread: 0.7, speed: 90, life: 0.8, size: 4, gravity: -140, glow: true, jitter: 20 });
      for (const p of targets) {
        fx.burst(p.x, p.y, 'ember', { n: 12, speed: 150 });
        if (!red) fx.emit({ x: p.x, y: p.y - 50, n: 7, colors: ['#f1e2bd', '#d9b36b', '#fff1cf'], angle: Math.PI / 2, spread: 0.5, speed: 50, life: 1.1, size: 3, gravity: 520, drag: 0.2, jitter: 40 });
      }
      break;
    }
    case 'echo': {
      add('echo', 0.9, { beads: M.fly.map((f) => ({ x: f.x0, y: f.y0, school: f.school })) });
      fx.ring(tg.x, tg.y, '#7FD1E0', 130, 0.6); fx.burst(tg.x, tg.y, 'echo', { n: 10 });
      break;
    }
    case 'hoard': {
      add('hoard', 0.9, { x: endX + 60, n: 4 + Math.min(5, ev.stitches | 0) });
      break;
    }
    case 'blood': {
      add('blood', 0.9, { x1: endX });
      fx.burst(tg.x, tg.y, 'blood', { n: 10, speed: 160, life: 0.6 }); fx.burst(tg.x, tg.y - 30, 'heal', { n: 8 });
      break;
    }
    case 'rust': {
      add('rust', 0.7, { x: endX });
      fx.burst(tg.x, tg.y, 'flake', { n: 16, speed: 220 }); fx.ring(tg.x, tg.y, '#ff8a3c', 110, 0.5);
      if (!red) fx.flash('#ff8a3c', 0.14, 0.2);
      break;
    }
    case 'static': {
      add('static', 0.4, {});
      const live = c ? liveEnemies(c) : [];
      const pts = live.map((e) => (o.entPos ? o.entPos(e.uid) : tg));
      let prev = { x: endX, y: cy };
      if (!pts.length) pts.push(tg);
      for (const p of pts) { fx.bolt(prev.x, prev.y, p.x, p.y, '#E8F542'); fx.burst(p.x, p.y, 'zap', { n: 8 }); prev = p; }
      if (!red) { fx.flash('#ffffff', 0.22, 0.08); if (app.post && app.post.aberration) app.post.aberration(2.5, 240); }
      break;
    }
    case 'gilded': {
      add('gilded', 1.0, { x: endX, y: cy });
      fx.burst(endX, cy - 10, 'gild', { n: 16 });
      if (!red) fx.emit({ x: endX, y: cy, n: 12, colors: ['#F5E6A8', '#F2C14E', '#ffffff'], shape: 'shard', speed: 120, life: 1.2, size: 5, gravity: -30, drag: 1, glow: true, jitter: 60 });
      break;
    }
    default: break;
  }
}

// ---------------------------------------------------------------- teaching
export function seamTip(app, c, rect) {
  const key = M.lesson;
  if (!key) return false;
  const meta = app.shared && app.shared.meta;
  if (tipSeen(meta, key)) { M.lesson = null; return false; }
  rect = rect || L.SEAM;
  const shown = maybeTip(app, key, rect.x + rect.w / 2, rect.y, TIP_TEXTS[key], { side: 'above', w: 360 });
  if (!shown && tipSeen(meta, key)) M.lesson = null; // clicked away this frame
  return shown;
}
