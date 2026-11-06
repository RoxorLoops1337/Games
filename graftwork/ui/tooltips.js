// Keyword glossary and PINNED tooltip stacks (design/UX_SPEC.md section 2).
//   KEYWORDS                  { name: { color, glyph, text } } glossary of every rules word
//   keywordsIn(lines)         the keywords that appear in a card's text lines, in order of appearance
//   drawCardText(app, ctx, lines, x, y, w, size)  card text with dotted-underlined keywords (returns height)
//   explainNumber(spec, c, o) 'why' lines for every damage / block number: "Base 6, +3 Strength, x1.5 Overload = 13"
//   explainIntent(c, e, info) the same for an enemy move
//   renderTip(app, tip)       draws a pinned stack beside the item. tip = { title, text, color, lines } (core's app.tip) or
//                             { stack: [[section]], anchor: {x,y,w,h} }; a section = { title, text, color, glyph, why: [] }
//   queueTip(app, key, stack, anchor) / flushTips(app)  combat HUD tips: one per frame, drawn last, 150 ms hover delay
//   statusPanel / keywordPanel / cardTipStack helpers build the sections.
import { COL } from './core.js';
import { STATUSES, SCHOOLS, GRAFTS } from '../data/index.js';
import { cardLines } from '../engine/text.js';
import { mult, scaleNum } from '../engine/combat.js';
import { OVERLOAD_MULT, TITHE_MULT } from '../engine/cards.js';
import { opText, srcName } from '../engine/text.js';
import { lnw } from '../art/linework.js';

const K = (color, glyph, text) => ({ color, glyph, text });
export const KEYWORDS = {
  Block: K('#bcd0d8', 'square', 'Absorbs damage. Yours fades at the start of your next turn.'),
  Vulnerable: K('#e0a050', 'tri', 'Takes 50% more attack damage.'),
  Weak: K('#9aa8b0', 'tri', 'Deals 25% less attack damage.'),
  Frail: K('#c9b07a', 'tri', 'Gains 25% less Block.'),
  Burn: K('#ff6a2b', 'diamond', 'Damage at turn start, then Burn halves (rounded up). Ignores Block.'),
  Bleed: K('#d12a44', 'circle', 'Lose HP at turn start, then Bleed drops by 1. Ignores Block.'),
  Poison: K('#8fd14f', 'circle', 'Lose HP at turn start (ignores Block), then Poison rises by 1 up to its cap.'),
  Brittle: K('#cfa3a3', 'tri', 'Block you gain shatters: when an attack empties it, you take 25% of the broken amount.'),
  Tithe: K('#b3263a', 'cross', 'A Bare card taken by Strain. It fights at 75% numbers this combat.'),
  Strain: K('#ff7a7a', 'cross', 'Graft Weight over your Budget. Each point lands one Tithe on a Bare card.'),
  Backfire: K('#c0713a', 'cross', 'Strain with no Bare card left to take it. Every 2 overflow jams a grafted card in your opening hand.'),
  Overload: K('#f2c14e', 'star', 'A third graft. Damage and Block x1.5, and 25% to Shatter on its first play each combat.'),
  Shatter: K('#f2c14e', 'star', 'The card resolves, then is destroyed for the run.'),
  Temper: K('#e8dcc4', 'hex', 'Forge: fuses a card\'s patches into it for good. Boons and prices stay, the slots empty.'),
  Echo: K('#7fd1e0', 'diamond', 'Your next card is played twice. Draw, energy and gold do not repeat.'),
  Exhaust: K('#a79bb5', 'hex', 'Removed for the rest of this combat once played.'),
  Retain: K('#7fcf8a', 'hex', 'Stays in your hand at end of turn.'),
  Innate: K('#7fcf8a', 'hex', 'Starts in your opening hand.'),
  Ethereal: K('#a79bb5', 'hex', 'Exhausts if it is still in your hand at end of turn.'),
  Unplayable: K('#9aa0a6', 'cross', 'Cannot be played.'),
  Thread: K('#e8dcc4', 'diamond', 'Your hand is a thread. Cards that share a school extend the Line. Break the Line to cash it in.'),
  Line: K('#e8dcc4', 'diamond', 'The chain of cards played this turn that share a school. Max 5 knots. It cashes in when cut or at turn end.'),
  Knot: K('#e8dcc4', 'circle', 'One link in the Line. Some cards and grafts scale per knot.'),
  Stitch: K('#e8dcc4', 'circle', 'What a cut pays out: knots minus 1, up to 4. Each stitch pays in the Line\'s top school.'),
  Cut: K('#e8dcc4', 'tri', 'A card of a new school ends the Line and pays its stitches. A new Line starts at 1 knot.'),
  Slack: K('#b9b09a', 'square', 'A card with no school. It changes nothing: the Line neither grows nor breaks.'),
  Tied: K('#e8dcc4', 'hex', 'A Tied Line carries over to the next turn at full value. A Tempered card is Tied: it acts as Slack and never cuts.'),
  Frayed: K('#d8a066', 'cross', 'A jammed card is Frayed. It acts as Slack this turn.'),
  Claim: K('#c0713a', 'cross', 'The Matron takes your most grafted card for the fight: it fights at -25%, like a Tithe. A Tempered card cannot be Claimed.'),
  Ringing: K('#a79bb5', 'hex', 'A junk card. Unplayable and Ethereal: it clogs your hand, then fades if it is still there at end of turn.'),
  Weight: K('#d6c7a6', 'square', 'What a graft counts against your Budget (1 to 3).'),
  Budget: K('#d6c7a6', 'square', 'How much graft Weight the deck carries without Strain.'),
  Resonance: K('#7fd1e0', 'star', 'A bonus for playing cards of matching schools together.'),
  Strength: K('#ff9a6a', 'tri', 'Attacks deal this much extra damage.'),
  Dexterity: K('#7fd1e0', 'tri', 'Block gained is increased by this much.'),
  Thorns: K('#c9a227', 'tri', 'Attackers take this much damage.'),
};
// Rules words that are not statuses: types, schools, tiers and the loose words of the rules text.
KEYWORDS.Jam = K('#d8a066', 'cross', 'A jammed card costs 1 more and acts as Slack (Frayed) this turn. It clears at end of turn.');
KEYWORDS.Bare = K('#d6c7a6', 'square', 'A card with no grafts (junk does not count). Strain lands its Tithe on the cheapest, oldest Bare card.');
KEYWORDS.Pierce = K('#bcd0d8', 'tri', 'Damage that ignores Block and goes straight to HP.');
KEYWORDS['X cost'] = K('#7fd1e0', 'diamond', 'Spends all your remaining Energy when played. The effect repeats or scales with the Energy spent.');
KEYWORDS.Attack = K('#e0a050', 'tri', 'A card that deals damage. Strength adds to it, Weak cuts it, Vulnerable raises it.');
KEYWORDS.Skill = K('#8fb4d1', 'square', 'A card that defends or sets something up (Block, draw, buffs).');
KEYWORDS.Power = K('#c58bff', 'star', 'Played once, then stays out of your deck for the rest of the combat.');
KEYWORDS.Junk = K('#a79bb5', 'hex', 'A clog card added by a Price. Most are Unplayable and fade at end of turn. Rust grafts turn them into fuel.');
KEYWORDS.Safe = K('#8fd18f', 'diamond', 'Safe patch: Weight 1, a small Boon and a simple Price.');
KEYWORDS.Greedy = K('#e0a050', 'tri', 'Greedy patch: Weight 2 or 3, a big Boon. It pushes you toward Strain.');
KEYWORDS.Weird = K('#c58bff', 'star', 'Weird patch: it changes how the card works, with a Price to match.');
KEYWORDS.After = K('#f2c14e', 'square', 'The deck as it will be if you sew this graft: Weight, Budget, Strain and who gets Tithed.');
for (const sc of Object.values(SCHOOLS)) {
  if (KEYWORDS[sc.name]) continue; // Echo is a status too: the status text wins, the school is named by o.school
  KEYWORDS[sc.name] = K(sc.color, 'diamond', `${sc.name} school. ${sc.blurb} At 3 grafts of it: ${sc.resonance[3]} At 6: ${sc.resonance[6]}`);
}
// Every status (player afflictions included) is a glossary word too, so card text and tooltips can name it.
export const THREAD_TERMS = ['Thread', 'Line', 'Knot', 'Stitch', 'Cut', 'Slack', 'Tied', 'Frayed'];
// A number that prints as 'N' but still counts as 2 in comparisons: desc(NUM) reads 'Gain N gold at the end of combat.'
const NUM = Object.assign(Object.create(Number.prototype), { valueOf: () => 2, toString: () => 'N', [Symbol.toPrimitive]: (h) => (h === 'number' ? 2 : 'N') });
const STATUS_BY_NAME = {};
const generic = (d) => { try { return String(d.desc(NUM)); } catch (e) { try { return String(d.desc(2)); } catch (e2) { return ''; } } };
for (const d of Object.values(STATUSES)) {
  if (!d || !d.name) continue;
  STATUS_BY_NAME[d.name] = d;
  if (KEYWORDS[d.name]) continue;
  KEYWORDS[d.name] = K(d.good === false ? '#ff9a8a' : '#8fd18f', d.good === false ? 'tri' : 'diamond', generic(d));
}
KEYWORDS.Charge.text = 'Stored by Static cards. Every 2 Charge adds 1 to each hit you deal (max +3). Static cards spend it.';
// glossaryEntry(term): { title, text, color, glyph } for a Thread word, keyword, status name or status id; null if unknown.
export function glossaryEntry(term) {
  const name = Object.keys(KEYWORDS).find((n) => n.toLowerCase() === String(term).toLowerCase());
  if (name) { const k = KEYWORDS[name]; return { title: name, text: k.text, color: k.color, glyph: k.glyph }; }
  const d = STATUSES[term]; if (!d) return null;
  return { title: d.name, text: KEYWORDS[d.name] ? KEYWORDS[d.name].text : generic(d), color: d.good === false ? '#ff9a8a' : '#8fd18f', glyph: d.good === false ? 'tri' : 'diamond' };
}
// 'knot' and 'knots' are written in lower case in boon text ("counts as 2 knots"): they find the Knot entry too
const canon = (w) => (w === 'knot' ? 'Knot' : w);
// Loose words are matched in any case, the CAPS tags (tier tags, weight pills, the AFTER panel) only in capitals.
const LOOSE = { jam: 'Jam', jams: 'Jam', jammed: 'Jam', bare: 'Bare', pierce: 'Pierce', pierces: 'Pierce', piercing: 'Pierce', 'x cost': 'X cost', 'cost x': 'X cost' };
const CAPS = { SAFE: 'Safe', GREEDY: 'Greedy', WEIRD: 'Weird', AFTER: 'After', W1: 'Weight', W2: 'Weight', W3: 'Weight' };
const NOT_PLAIN = new Set(['Jam', 'Bare', 'Pierce', 'X cost', 'Safe', 'Greedy', 'Weird', 'After']);
const NAMES = [...Object.keys(KEYWORDS).filter((n) => !NOT_PLAIN.has(n)), 'knot'].sort((a, b) => b.length - a.length);
const KW_RE = new RegExp('\\b(' + NAMES.join('|') + ')(?:s|ed)?\\b', 'g');
const LOOSE_RE = /\b(jam(?:s|med)?|bare|pierc(?:e|es|ing)|x cost|cost x)\b/gi;
const CAPS_RE = /\b(SAFE|GREEDY|WEIRD|AFTER|W[123])\b/g;
// scan(line): every keyword hit in a string, in order, without overlaps: [{ i, len, name, caps }]
function scan(line) {
  const hits = []; line = String(line || '');
  KW_RE.lastIndex = 0; let m;
  while ((m = KW_RE.exec(line))) hits.push({ i: m.index, len: m[0].length, name: canon(m[1]) });
  LOOSE_RE.lastIndex = 0;
  while ((m = LOOSE_RE.exec(line))) hits.push({ i: m.index, len: m[0].length, name: LOOSE[m[1].toLowerCase()] });
  CAPS_RE.lastIndex = 0;
  while ((m = CAPS_RE.exec(line))) hits.push({ i: m.index, len: m[0].length, name: CAPS[m[1]], caps: m[1] });
  hits.sort((a, b) => a.i - b.i || b.len - a.len);
  const out = []; let end = -1;
  for (const h of hits) if (h.i >= end) { out.push(h); end = h.i + h.len; }
  return out;
}

export function keywordsIn(lines) {
  const out = [];
  const arr = Array.isArray(lines) ? lines : [String(lines || '')];
  for (const ln of arr) for (const h of scan(ln)) if (!out.includes(h.name)) out.push(h.name);
  return out;
}

// ---- glossaryFor: the one resolver every tooltip, info card and tip panel uses ----
// glossaryFor(text | [texts], { max = 3, skip: Set of names, school, ids: [status ids], types }) -> [{ term, title, definition, text, color, glyph, n }]
// 'Gain 4 Gilt' resolves with the live number (4): "Gain 4 gold at the end of combat." Most important first: statuses and rules words,
// then schools, then card types and basics (Block, Attack...). Each term once.
const BASIC = new Set(['Block', 'Attack', 'Skill', 'Power', 'Junk', 'Energy']);
const TAGS = new Set(['Safe', 'Greedy', 'Weird', 'After']);
const rank = (name) => (BASIC.has(name) ? 3 : SCHOOLS_BY_NAME[name] ? 2 : TAGS.has(name) ? 1 : 0);
const SCHOOLS_BY_NAME = {}; for (const sc of Object.values(SCHOOLS)) SCHOOLS_BY_NAME[sc.name] = sc;
export function defineTerm(name, n) {
  const k = KEYWORDS[name], d = STATUS_BY_NAME[name];
  if (name === 'Weight' && n >= 1 && n <= 3) return `Weight ${n}: this patch counts ${n} against your Budget. Over the Budget is Strain.`;
  if (d && typeof n === 'number' && Number.isFinite(n)) {
    try { let t = String(d.desc(n)); if (k && /Ignores Block/.test(k.text) && !/Block/.test(t)) t += ' Ignores Block.'; return t; } catch (e) { /* fall through */ }
  }
  return k ? k.text : '';
}
function numAround(line, h) {
  const before = line.slice(Math.max(0, h.i - 12), h.i).match(/([+-]?\d+)\s*(?:x\s*)?$/);
  if (before && !/per\s+\d+\s*$/.test(line.slice(Math.max(0, h.i - 12), h.i))) return +before[1];
  const after = line.slice(h.i + h.len, h.i + h.len + 6).match(/^\s+(\d+)\b/);
  if (after) return +after[1];
  if (h.caps && /^W[123]$/.test(h.caps)) return +h.caps[1];
  return undefined;
}
const flatStrings = (v, out = []) => { if (v === null || v === undefined) return out; if (Array.isArray(v)) v.forEach((x) => flatStrings(x, out)); else if (typeof v === 'string') out.push(v); return out; };
export function glossaryFor(input, o = {}) {
  const max = o.max === undefined ? 3 : o.max, skip = o.skip || new Set();
  const found = new Map(); let order = 0;
  const add = (name, n) => { const f = found.get(name); if (f) { if (f.n === undefined && n !== undefined) f.n = n; return; } found.set(name, { name, n, order: order++ }); };
  for (const ln of flatStrings(input)) for (const h of scan(ln)) add(h.name, numAround(ln, h));
  for (const id of o.ids || []) { const d = STATUSES[id]; if (d) add(d.name, undefined); }
  if (o.types) for (const t of [].concat(o.types)) { const nm = String(t)[0].toUpperCase() + String(t).slice(1); if (KEYWORDS[nm]) add(nm, undefined); }
  if (o.school && SCHOOLS[o.school]) add(SCHOOLS[o.school].name === 'Echo' ? 'Echo' : SCHOOLS[o.school].name, undefined);
  const list = [...found.values()].filter((f) => !skip.has(f.name)).sort((a, b) => rank(a.name) - rank(b.name) || a.order - b.order);
  return list.slice(0, max).map((f) => {
    const k = KEYWORDS[f.name], d = STATUS_BY_NAME[f.name];
    const definition = defineTerm(f.name, f.n);
    return { term: f.name, title: d && f.n !== undefined && f.name !== 'Weight' ? `${f.name} ${f.n}` : f.name, definition, text: definition, color: k.color, glyph: k.glyph, n: f.n };
  });
}
// text + the definitions of its rules words, for the phone info card ("Gilt 4: Gain 4 gold at the end of combat.")
export function withGloss(text, o = {}) { const g = glossaryText([text, o.gloss || []], o); return g ? `${text}\n\n${g}` : text; }
// Plain-text form for the touch info card: "Gilt 4: Gain 4 gold at the end of combat."
export function glossaryText(input, o = {}) { return glossaryFor(input, o).map((g) => `${g.title}: ${g.definition}`).join('\n'); }
// Everything a card face says in rules words: its lines, the Boon and Price of every graft on it, X cost, Overload.
export function specGloss(spec) {
  if (!spec) return [];
  const gs = [...(spec.fused || []), ...(spec.grafts || [])].map((id) => (GRAFTS[id] ? [GRAFTS[id].boon, GRAFTS[id].price] : []));
  return [cardLines(spec), gs, spec.cost === 'X' ? 'X cost' : '', spec.overload ? 'Overload' : ''];
}
// glossary-only hover tip for a card face (picker grids, deck view, codex, rewards)
export function cardGlossTip(app, spec, anchor, o = {}) { if (spec) glossTip(app, o.title || '', [specGloss(spec), o.extra || []], anchor, { types: spec.type, school: spec.school }); }
// A hover target that has no tip of its own: a tip made only of definitions. anchor may carry a band.
export function glossTip(app, title, texts, anchor, o = {}) { app.tooltip(title || '', '', { glossOnly: true, gloss: texts, anchor, color: o.color, school: o.school, types: o.types, ids: o.ids }); }

export function drawGlyph(ctx, kind, x, y, s, color) {
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = color; ctx.strokeStyle = '#0e0e0e'; ctx.lineWidth = lnw(1); ctx.beginPath();
  const r = s / 2;
  if (kind === 'square') ctx.rect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6);
  else if (kind === 'tri') { ctx.moveTo(0, -r); ctx.lineTo(r, r * 0.8); ctx.lineTo(-r, r * 0.8); ctx.closePath(); }
  else if (kind === 'diamond') { ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0); ctx.closePath(); }
  else if (kind === 'cross') { const t = r * 0.35; ctx.rect(-t, -r, t * 2, r * 2); ctx.rect(-r, -t, r * 2, t * 2); }
  else if (kind === 'star') { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); }
  else if (kind === 'hex') { for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); }
  else ctx.arc(0, 0, r * 0.85, 0, 6.283);
  ctx.fill(); ctx.stroke(); ctx.restore();
}

// ---- card text with keyword underlines ----
const tokens = (line) => {
  const out = []; let last = 0;
  for (const h of scan(line)) { if (h.i > last) out.push({ t: line.slice(last, h.i) }); out.push({ t: line.slice(h.i, h.i + h.len), kw: h.name }); last = h.i + h.len; }
  if (last < line.length) out.push({ t: line.slice(last) });
  return out;
};
export function drawCardText(app, ctx, lines, x, y, w, size = 15, o = {}) {
  const lh = Math.round(size * 1.25), sz = Math.round(size * (o.fixed ? 1 : app.textScale || 1));
  let yy = y;
  for (const ln of lines) {
    let cx = x;
    const words = [];
    for (const tk of tokens(ln)) for (const part of tk.t.split(/(\s+)/)) if (part) words.push({ t: part, kw: tk.kw });
    for (const wd of words) {
      const ww = app.measure(wd.t, sz, { ui: true, bold: !!wd.kw });
      if (cx + ww > x + w && cx > x && wd.t.trim()) { cx = x; yy += lh; }
      if (!wd.t.trim() && cx === x) continue;
      const col = wd.kw ? KEYWORDS[wd.kw].color : (o.color || COL.vellum);
      app.text(wd.t, cx, yy, { size, ui: true, bold: !!wd.kw, color: col, fixed: o.fixed, stroke: o.stroke, strokeW: o.strokeW });
      if (wd.kw) {
        ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = lnw(1.5); ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(cx, yy + sz * 1.12); ctx.lineTo(cx + ww, yy + sz * 1.12); ctx.stroke(); ctx.restore();
      }
      cx += ww;
    }
    yy += lh;
  }
  return yy - y;
}

// ---- 'why' lines: every number explained from the real modifiers ----
const fmt = (v) => (Math.round(v * 100) / 100).toString();
function playerMods(ent, kind) {
  const parts = []; let add = 0, mul = 1;
  if (!ent || !ent.st) return { parts, add, mul };
  for (const s of Object.keys(ent.st)) {
    const d = STATUSES[s], v = ent.st[s]; if (!d || !d.mod || !v) continue;
    if (kind === 'dmg' && d.mod.outAdd) { const a = d.mod.outAdd(v); add += a; parts.push({ k: 'add', t: `${a >= 0 ? '+' : ''}${a} ${d.name}` }); }
    if (kind === 'block' && d.mod.blockAdd) { const a = d.mod.blockAdd(v); add += a; parts.push({ k: 'add', t: `${a >= 0 ? '+' : ''}${a} ${d.name}` }); }
  }
  for (const s of Object.keys(ent.st)) {
    const d = STATUSES[s], v = ent.st[s]; if (!d || !d.mod || !v) continue;
    if (kind === 'dmg' && d.mod.outMul) { const m = d.mod.outMul(v); mul *= m; parts.push({ k: 'mul', t: `x${fmt(m)} ${d.name}` }); }
    if (kind === 'block' && d.mod.blockMul) { const m = d.mod.blockMul(v); mul *= m; parts.push({ k: 'mul', t: `x${fmt(m)} ${d.name}` }); }
  }
  return { parts, add, mul };
}
function targetMods(tgt) {
  const parts = []; let mul = 1;
  if (tgt && tgt.st) for (const s of Object.keys(tgt.st)) {
    const d = STATUSES[s], v = tgt.st[s]; if (!d || !d.mod || !d.mod.inMul || !v) continue;
    const m = d.mod.inMul(v); mul *= m; parts.push(`x${fmt(m)} ${d.name}`);
  }
  return { parts, mul };
}
function walkOps(fx, f) { for (const op of fx || []) { f(op); if (op.then) walkOps(op.then, f); if (op.else) walkOps(op.else, f); if (op.fx) walkOps(op.fx, f); } }

// o: { tithed, target (enemy entity, for Vulnerable) }. Returns ['Damage: Base 6, +3 Strength, x1.5 Overload = 13', ...]
export function explainNumber(spec, c, o = {}) {
  const out = [];
  if (!spec) return out;
  const player = c && c.player;
  walkOps(spec.fx, (op) => {
    if (op.op !== 'dmg' && op.op !== 'block') return;
    const kind = op.op, v = op.n;
    const base = typeof v === 'number' ? v : (v && v.base) || 0;
    const parts = [`Base ${base}` + (typeof v === 'object' && v && v.per ? ` (+ per ${srcName(v.per)})` : '')];
    let n = base;
    if (spec.pct) parts.push(`${spec.pct > 0 ? '+' : ''}${spec.pct}% graft`);
    if (spec.overload) parts.push(`x${OVERLOAD_MULT} Overload`);
    if (o.tithed) parts.push(`x${TITHE_MULT} Tithe`);
    n = scaleNum(base, mult(spec, !!o.tithed));
    const pm = playerMods(player, kind);
    n += pm.add; for (const p of pm.parts) parts.push(p.t);
    n *= pm.mul;
    if (kind === 'dmg') { const tm = targetMods(o.target); for (const t of tm.parts) parts.push(t); n *= tm.mul; }
    n = Math.max(0, Math.floor(n));
    const hits = op.hits && typeof op.hits === 'number' ? ` x${op.hits} hits` : '';
    out.push(`${kind === 'dmg' ? 'Damage' : 'Block'}: ${parts.join(', ')} = ${n}${hits}`);
  });
  return out;
}

// Enemy move: every op in words (conditional bonuses included) plus the damage arithmetic.
export function explainIntent(c, e, info) {
  const lines = [], why = [];
  if (!e || !e.move || !e.def.moves[e.move]) return { lines, why };
  const mv = e.def.moves[e.move];
  for (const op of mv.fx || []) { let t = ''; try { t = opText(op, 0); } catch (err) { t = ''; } if (t) lines.push(t.replace(/^Deal (\d+) damage/, 'Hits you for $1').replace(/^Deal /, 'Hits you for ')); }
  walkOps(mv.fx, (op) => {
    if (op.op !== 'dmg') return;
    const base = typeof op.n === 'number' ? op.n : (op.n && op.n.base) || 0;
    const parts = [`Base ${base}`]; let n = base;
    const pm = playerMods(e, 'dmg'); n += pm.add; for (const p of pm.parts) parts.push(p.t); n *= pm.mul;
    if (e.dmgMul && e.dmgMul !== 1) { parts.push(`x${fmt(e.dmgMul)} rage`); n *= e.dmgMul; }
    const tm = targetMods(c && c.player); for (const t of tm.parts) parts.push(t); n *= tm.mul;
    n = Math.max(0, Math.floor(n));
    why.push(`${parts.join(', ')} = ${n}` + (info && info.hits > 1 ? ` per hit, ${info.hits} hits` : ''));
  });
  return { lines, why };
}

// ---- section builders ----
export function keywordSection(name) { const k = KEYWORDS[name]; return k ? { title: name, text: k.text, color: k.color, glyph: k.glyph } : null; }
export function statusSection(id, n, ent) {
  const d = STATUSES[id]; if (!d) return { title: id, text: '' };
  const col = d.good === false ? '#ff9a8a' : COL.good;
  const why = [];
  if (d.stack === 'dur') why.push(`Lasts ${n} more turn${n === 1 ? '' : 's'}; counts down at the end of its owner's turn.`);
  else if (n !== undefined) why.push(`Stacks add up${d.cap ? ` (max ${d.cap})` : ''}. Now ${n}.`);
  if (d.mod) {
    if (d.mod.outAdd) why.push(`${d.mod.outAdd(n) >= 0 ? '+' : ''}${d.mod.outAdd(n)} to each hit it deals.`);
    if (d.mod.outMul) why.push(`x${fmt(d.mod.outMul(n))} damage it deals.`);
    if (d.mod.inMul) why.push(`x${fmt(d.mod.inMul(n))} damage it takes.`);
    if (d.mod.blockAdd) why.push(`${d.mod.blockAdd(n) >= 0 ? '+' : ''}${d.mod.blockAdd(n)} to Block it gains.`);
    if (d.mod.blockMul) why.push(`x${fmt(d.mod.blockMul(n))} Block it gains.`);
  }
  return { title: `${d.name} ${n === undefined ? '' : n}`.trim(), text: d.desc(n || 1), color: col, glyph: KEYWORDS[d.name] ? KEYWORDS[d.name].glyph : (d.good === false ? 'tri' : 'diamond'), why };
}
// Panels for a card: [keywords on the card] then [number 'why' lines + statuses it applies]
export function cardTipStack(spec, c, o = {}) {
  if (!spec) return [];
  const lines = cardLines(spec, !!o.tithed);
  const extra = [];
  if (spec.overload) extra.push('Overload');
  if (o.tithed) extra.push('Tithe');
  if (spec.cost === 'X') extra.push('X cost');
  const gl = glossaryFor([lines, extra], { max: GLOSS_MAX, school: spec.school, types: spec.type });
  const kws = gl.map((g) => g.term);
  const p1 = gl.map((g) => ({ title: g.title, text: g.definition, color: g.color, glyph: g.glyph }));
  const p2 = [];
  const why = explainNumber(spec, c, o);
  if (why.length) p2.push({ title: 'The numbers', color: COL.lamp, glyph: 'square', text: '', why });
  const seen = new Set();
  walkOps(spec.fx, (op) => { if (op.s && STATUSES[op.s] && !seen.has(op.s) && !kws.includes(STATUSES[op.s].name)) { seen.add(op.s); p2.push(statusSection(op.s, typeof op.n === 'number' ? op.n : undefined)); } });
  const out = [];
  if (p1.length) out.push(p1);
  if (p2.length) out.push(p2.slice(0, 4));
  return out;
}

// ---- rendering ----
const MAXW = 320, PAD = 12, TI = 19, BO = 16;
let key0 = '', t0 = 0, f0 = -9, pin = null, queued = null;
// resetTips(): drop every pinned / queued / hover-delay tip (core's app.go calls it on each screen change, so a stale tip never follows you).
export function resetTips() { key0 = ''; t0 = 0; f0 = -9; pin = null; queued = null; }
const sc = (app, n) => Math.round(n * (app.textScale || 1));
function measurePanel(app, sections) {
  const bw = MAXW - PAD * 2; let h = PAD * 2;
  const lay = sections.map((s) => {
    const body = s.text ? app.wrap(s.text, bw, sc(app, BO), { ui: true }) : [];
    const why = (s.why || []).map((w) => app.wrap(w, bw, sc(app, 15), { ui: true }));
    const sh = sc(app, TI) + 5 + body.length * Math.round(sc(app, BO) * 1.25) + why.reduce((a, l) => a + l.length * Math.round(sc(app, 15) * 1.25) + 3, 0) + 8;
    h += sh; return { s, body, why, sh };
  });
  return { lay, h: h - 8 };
}
// Every plain or single-panel tip appends a glossary panel: one short definition per rules word the item names (max 3, most important first,
// live numbers where the text has them). Sources: the tip's own text and lines, plus tip.o.gloss (strings the tile shows but the tip does not repeat,
// such as a graft's Boon and Price). Words already titled in the tip are not repeated. tip.o.glossOnly: the glossary IS the tip.
const GLOSS_MAX = 3;
function sectionsText(stack) { const out = []; for (const p of stack) for (const s of p) { out.push(s.text || ''); for (const w of s.why || []) out.push(w); } return out; }
function titleNames(stack) { const sk = new Set(); for (const p of stack) for (const s of p) for (const h of scan(s.title || '')) sk.add(h.name); return sk; }
function glossPanel(stack, tip) {
  const o = tip.o || tip;
  const gl = glossaryFor([sectionsText(stack), o.gloss || []], { max: GLOSS_MAX, skip: titleNames(stack), school: o.school, types: o.types, ids: o.ids });
  return gl.map((g) => ({ title: g.title, text: g.definition, color: g.color, glyph: g.glyph }));
}
function toStack(tip) {
  const o = tip.o || tip;
  if (o.glossOnly && !tip.stack) {
    const gl = glossPanel([[]], tip);
    const sec = (tip.title ? [{ title: tip.title, text: tip.text || '', color: tip.color }] : []).concat(gl);
    return sec.length ? [sec] : [];
  }
  const text = tip.lines ? tip.lines.join('\n') : (tip.text || '');
  const stack = tip.stack || [[{ title: tip.title, text, color: tip.color }]];
  if (stack.length !== 1) return stack;
  const gl = glossPanel(stack, tip);
  return gl.length ? [stack[0], gl] : stack;
}
function place(app, a, w, h, prevBottomY) {
  // right of the item, else left, else below/above; never under the pointer, always on screen
  const m = app.mouse;
  const cands = [
    { x: a.x + a.w + 10, y: a.y }, { x: a.x - w - 10, y: a.y },
    { x: a.x + a.w / 2 - w / 2, y: a.y + a.h + 10 }, { x: a.x + a.w / 2 - w / 2, y: a.y - h - 10 },
  ];
  let best = null;
  for (const c of cands) {
    const x = Math.max(6, Math.min(1274 - w, c.x)), y = Math.max(6, Math.min(714 - h, c.y));
    const under = m.x >= x - 4 && m.x <= x + w + 4 && m.y >= y - 4 && m.y <= y + h + 4;
    const clipped = c.x < 6 || c.x + w > 1274;
    if (!under && !clipped) { best = { x, y }; break; }
    if (!best && !under) best = { x, y };
  }
  return best || { x: Math.max(6, Math.min(1274 - w, a.x + a.w + 10)), y: Math.max(6, Math.min(714 - h, a.y)) };
}
function drawStack(app, stack, anchor) {
  const ctx = app.ctx;
  const panels = stack.slice(0, 2).map((p) => measurePanel(app, p));
  if (stack.length > 2) { const extra = stack.slice(2).flat().map((s) => s.title).join(', '); panels[1] = measurePanel(app, [...stack[1], { title: 'Also', text: extra, color: COL.vellum2 }]); }
  const totalH = panels.reduce((a, p) => a + p.h, 0) + (panels.length - 1) * 8;
  // anchor.band = { x, y, bottom, dir }: panels fill a fixed band (column by column, dir +1 right / -1 left of x) instead of the usual placement
  const band = anchor.band;
  const pos = band ? { x: band.x, y: band.y } : place(app, anchor, MAXW, Math.min(totalH, 700));
  let y = band ? Math.min(band.y, Math.max(6, 714 - panels[0].h)) : Math.max(6, Math.min(714 - totalH, pos.y));
  let col = 0;
  panels.forEach((p, i) => {
    if (band && i > 0 && y + p.h > band.bottom) { col++; y = band.y; }
    pos.x = band ? band.x + col * (MAXW + 8) * band.dir - (band.dir < 0 ? MAXW : 0) : pos.x;
    const first = p.lay[0] && p.lay[0].s;
    app.panel(pos.x, y, MAXW, p.h, { fill: 'rgba(14,12,10,.97)', stroke: (first && first.color) || COL.lamp });
    app.reg('tip' + i, pos.x, y, MAXW, p.h, { layer: 'overlay', overlay: true, group: 'tip' });
    let yy = y + PAD;
    for (const L of p.lay) {
      const s = L.s, gx = s.glyph ? 18 : 0;
      if (s.glyph) drawGlyph(ctx, s.glyph, pos.x + PAD + 7, yy + sc(app, TI) * 0.55, 13, s.color || COL.lamp);
      app.text(s.title || '', pos.x + PAD + gx, yy, { size: TI, bold: true, color: s.color || COL.lamp });
      yy += sc(app, TI) + 5;
      if (L.body.length) { app.text(s.text, pos.x + PAD, yy, { size: BO, ui: true, maxW: MAXW - PAD * 2, lineH: Math.round(sc(app, BO) * 1.25), color: COL.vellum }); yy += L.body.length * Math.round(sc(app, BO) * 1.25); }
      for (const wl of L.why) { app.text(wl.join(' '), pos.x + PAD, yy + 3, { size: 15, ui: true, maxW: MAXW - PAD * 2, lineH: Math.round(sc(app, 15) * 1.25), color: COL.lamp }); yy += wl.length * Math.round(sc(app, 15) * 1.25) + 3; }
      yy += 8;
    }
    y += p.h + 8;
  });
}
// Core hook: returns true when it drew the tip. A plain tip anchors on the pointer.
export function renderTip(app, tip) {
  if (!tip) return false;
  const stack = toStack(tip);
  if (!stack.length) return true;
  const k = tip.key || JSON.stringify(stack).slice(0, 200);
  if (app.frame - f0 > 1 || k !== key0) { key0 = k; t0 = app.t; }
  f0 = app.frame;
  const mo = app.mouse;
  if (mo.down && app.t - t0 > 0.35 && mo.touchUp !== undefined) pin = { stack, anchor: tip.anchor || { x: mo.x - 8, y: mo.y - 8, w: 16, h: 30 } };
  if (app.t - t0 < 0.15 && !pin) return true; // hover delay: swallow the default tip too
  drawStack(app, stack, tip.anchor || { x: mo.x - 8, y: mo.y - 6, w: 16, h: 28 });
  return true;
}
// HUD tips: call from anywhere while hovering; flushTips draws the last one at the end of the frame.
export function queueTip(app, key, stack, anchor) { queued = { key, stack, anchor, frame: app.frame }; }
// A tip held with a finger stays after the finger lifts, until the next tap. core.js calls this on frames with no live tip.
let pinFrame = -1;
export function drawPinnedTip(app) {
  if (pin && app.mouse.pressed && !(app.mouse.touchUp)) pin = null;
  if (pin && pinFrame !== app.frame) { pinFrame = app.frame; drawStack(app, pin.stack, pin.anchor); }
}
export function flushTips(app) {
  drawPinnedTip(app);
  const q = queued; queued = null;
  if (!q || q.frame !== app.frame) return false;
  return renderTip(app, { stack: q.stack, anchor: q.anchor, key: q.key });
}
