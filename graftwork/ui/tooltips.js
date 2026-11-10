// Keyword glossary and the ONE tooltip system (design/UX_SPEC.md section 2).
//   KEYWORDS / WARD_GLOSSARY  one short definition per rules word; glossaryFor() resolves text to definitions (never the hovered thing's own type or school)
//   cardTipStack(spec, c, o)  model for a card: graft Boon / Price blocks, totals only when they differ from the face, terms, hold-details
//   explainNumber / numberNow / explainIntent  the arithmetic ('Base 6, +3 Strength = 9') and the 'now' line
//   queueTip(app, key, stack, anchor, { gloss:false })  HUD tips from anywhere in a frame;  app.tooltip() from core is the other source
//   renderTip(app)  core.js calls it once per frame: the lifecycle (delay, fade, dismiss on press / Esc / blur / app.tipBlock / screen change,
//                   touch tips live only while the finger is down, Shift or a long press HOLDS open the details) and the compact panel
//                   (one panel, width <= 38% of the stage, placed beside the anchor and clear of the HUD, with an arrow at the anchor)
import { COL } from './core.js';
import { STATUSES, SCHOOLS, GRAFTS } from '../data/index.js';
import { RESONANCE_THREAD } from '../data/schools.js';
import { cardLines } from '../engine/text.js';
import { mult, scaleNum } from '../engine/combat.js';
import { OVERLOAD_MULT, TITHE_MULT } from '../engine/cards.js';
import { opText, srcName } from '../engine/text.js';
import { lnw } from '../art/linework.js';
import { getAll } from './layout_registry.js';
import { FX_OPTS } from './fx.js';

const K = (color, glyph, text) => ({ color, glyph, text });
export const KEYWORDS = {
  Block: K('#bcd0d8', 'square', 'Absorbs damage. Yours fades next turn.'),
  Vulnerable: K('#e0a050', 'tri', 'Takes 50% more attack damage.'),
  Weak: K('#9aa8b0', 'tri', 'Deals 25% less attack damage.'),
  Frail: K('#c9b07a', 'tri', 'Gains 25% less Block.'),
  Burn: K('#ff6a2b', 'diamond', 'Damage at turn start, then halves. Ignores Block.'),
  Bleed: K('#d12a44', 'circle', 'HP loss at turn start, then drops by 1. Ignores Block.'),
  Poison: K('#8fd14f', 'circle', 'HP loss at turn start, then grows by 1 (capped). Ignores Block.'),
  Brittle: K('#cfa3a3', 'tri', 'Block shatters: when an attack empties it, you take 25% of that amount.'),
  Tithe: K('#b3263a', 'cross', 'A Bare card taken by Strain: fights at -25% this combat.'),
  Strain: K('#ff7a7a', 'cross', 'Graft Weight over Budget. Each point Tithes a Bare card.'),
  Backfire: K('#c0713a', 'cross', 'Strain with no Bare card left. Every 2 overflow jams a card in your opening hand.'),
  Overload: K('#f2c14e', 'star', 'A third graft: Damage and Block x1.5, 25% to Shatter on its first play.'),
  Shatter: K('#f2c14e', 'star', 'The card resolves, then is destroyed for the run.'),
  Temper: K('#e8dcc4', 'hex', 'Forge: fuses a card\'s patches into it for good. Boons and prices stay.'),
  Echo: K('#7fd1e0', 'diamond', 'Your next cards play twice. Draw, energy and gold do not repeat.'),
  Exhaust: K('#a79bb5', 'hex', 'Removed from this combat once played.'),
  Retain: K('#7fcf8a', 'hex', 'Stays in your hand at end of turn.'),
  Innate: K('#7fcf8a', 'hex', 'Starts in your opening hand.'),
  Ethereal: K('#a79bb5', 'hex', 'Exhausts if still in hand at end of turn.'),
  Unplayable: K('#9aa0a6', 'cross', 'Cannot be played.'),
  Thread: K('#e8dcc4', 'diamond', 'Your hand is a thread: same-school cards extend the Line.'),
  Line: K('#e8dcc4', 'diamond', 'Same-school cards played in a row, one Knot each (max 5). Pays when cut or at turn end.'),
  Knot: K('#e8dcc4', 'circle', 'One card in the Line. Longer Lines pay more.'),
  Stitch: K('#e8dcc4', 'circle', 'What a Cut pays: Knots minus 1 (max 4), each giving the top school\'s bonus.'),
  Cut: K('#e8dcc4', 'tri', 'A different school ends the Line and pays its Stitches. That card starts a new Line.'),
  Slack: K('#b9b09a', 'square', 'No school: the Line neither grows nor breaks.'),
  Tied: K('#e8dcc4', 'hex', 'Carried to next turn at full value. Tempered cards are Tied and never cut.'),
  Frayed: K('#d8a066', 'cross', 'A jammed card is Frayed: Slack this turn.'),
  Claim: K('#c0713a', 'cross', 'The Matron takes your most grafted card: it fights at -25%. Tempered cards are safe.'),
  Ringing: K('#a79bb5', 'hex', 'Junk. Unplayable and Ethereal: clogs your hand, then fades.'),
  Weight: K('#d6c7a6', 'square', 'What a graft counts against your Budget (1 to 3).'),
  Budget: K('#d6c7a6', 'square', 'Graft Weight the deck carries free of Strain.'),
  Resonance: K('#7fd1e0', 'star', 'Deck bonus at 3 and 6 grafts of one school. ' + RESONANCE_THREAD.rule),
  Strength: K('#ff9a6a', 'tri', 'Attacks deal this much extra damage.'),
  Dexterity: K('#7fd1e0', 'tri', 'Block gained is increased by this much.'),
  Thorns: K('#c9a227', 'tri', 'Attackers take this much damage.'),
};
// Rules words that are not statuses: types, schools, tiers and the loose words of the rules text.
KEYWORDS.Jam = K('#d8a066', 'cross', 'Costs 1 more and counts as Slack (Frayed) until end of turn.');
KEYWORDS.Bare = K('#d6c7a6', 'square', 'A card with no grafts (junk excluded). Strain Tithes the cheapest, oldest.');
KEYWORDS.Pierce = K('#bcd0d8', 'tri', 'Ignores Block.');
KEYWORDS['X cost'] = K('#7fd1e0', 'diamond', 'Spends all your Energy. Scales with the Energy spent.');
KEYWORDS.Attack = K('#e0a050', 'tri', 'Deals damage.');
KEYWORDS.Skill = K('#8fb4d1', 'square', 'Defends or sets something up.');
KEYWORDS.Power = K('#c58bff', 'star', 'Played once, then stays out of your deck this combat.');
KEYWORDS.Junk = K('#a79bb5', 'hex', 'A clog card from a Price. Most are Unplayable and fade at end of turn.');
KEYWORDS.Safe = K('#8fd18f', 'diamond', 'Weight 1, a small Boon, a simple Price.');
KEYWORDS.Greedy = K('#e0a050', 'tri', 'Weight 2 or 3, a big Boon. Pushes you toward Strain.');
KEYWORDS.Weird = K('#c58bff', 'star', 'Changes how the card works, with a Price to match.');
KEYWORDS.After = K('#f2c14e', 'square', 'The deck if you sew this graft: Weight, Budget, Strain, Tithes.');
for (const sc of Object.values(SCHOOLS)) {
  if (KEYWORDS[sc.name]) continue; // Echo is a status too: the status text wins, the school is named by o.school
  KEYWORDS[sc.name] = K(sc.color, 'diamond', `${sc.name} school. ${sc.blurb} Resonance at 3 and 6 grafts.`);
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
// THE WARD terms (design/WARD.md). Kept apart from KEYWORDS so card and event text never pick them up by accident ('Power' the card type,
// 'night' in an event): a tip names them explicitly with o.terms (ui/ward.js, ui/ward_kit.js). glossaryEntry resolves them after KEYWORDS.
export const WARD_GLOSSARY = {
  Wood: K('#b07a44', 'square', 'Building resource. Sawmills make 2 each morning. Half carries to the next floor.'),
  Stone: K('#a8a198', 'square', 'Building resource. Quarries make 2 each morning. Half carries to the next floor.'),
  Power: K('#FFE9A0', 'circle', 'Capacity, not spent. Each lit room uses its power; Generators add 2. Switch a room off in the morning to free it.'),
  Morning: K('#F2C14E', 'diamond', 'Build stage: timers tick, rooms produce, you draw 5 building plans. No walking.'),
  Midday: K('#F5E6A8', 'diamond', 'One walk. Fights pay +10% gold. Chapel events lean to gold and healing.'),
  Evening: K('#e0a050', 'diamond', 'One walk. Dinner: draw 1 more card on the first turn of every fight.'),
  Night: K('#8fb4d1', 'diamond', 'One walk. Monsters +1 Strength, elites +2, one more relic. Fights pay +25% gold. Events turn strange.'),
  Ward: K('#B3263A', 'tri', 'Fight room. A monster checks in each day (max 5). Walk in to fight 3 at once; the rest are Reinforcements.'),
  Isolation: K('#C9A227', 'tri', 'Elite room. An elite every 2 days. Left 3 days it becomes a Level 2 elite.'),
  Chapel: K('#3E7C74', 'diamond', 'Event room. An event every 4 days. The phase you walk in at changes its lean.'),
  Dispensary: K('#5a8fd8', 'square', 'The shop as a room. Restocks every 3 days. Sells building plans and strikes one for 50 gold.'),
  Workshop: K('#E8571F', 'hex', 'The forge as a room. Recharges every 3 days.'),
  'Linen Room': K('#6a9a6a', 'circle', 'Clean sheets every 2 days: walk in to heal 30% of max HP.'),
  Sawmill: K('#8F4A2A', 'square', '+2 wood each morning while lit.'),
  Quarry: K('#6f6a60', 'square', '+2 stone each morning while lit.'),
  'Counting House': K('#B8922A', 'square', '+15 gold each morning while lit.'),
  Generator: K('#b8c23a', 'star', '+2 power capacity. Uses none.'),
  Corridor: K('#8a7a5c', 'square', 'A cheap connector. Never spawns anything, never goes dark.'),
  Pharmacy: K('#5a8fd8', 'circle', 'Service room. Every 3 days while lit it brews a potion (15 gold if your belt is full).'),
  Library: K('#3E7C74', 'diamond', 'Service room. Each morning while lit, 25% to upgrade a random card.'),
  Morgue: K('#6f6a60', 'square', 'While lit, every monster you fight leaves 1 more stone.'),
  Kitchen: K('#e0a050', 'circle', 'While lit, dinner draws 2 more cards on the first turn of evening fights instead of 1.'),
  Boiler: K('#b8c23a', 'star', 'Uses no power. Adds 1 power capacity for every two lit Wards.'),
  Laundry: K('#6a9a6a', 'circle', 'Service room. Every 2 days while lit it washes one junk card out of your deck.'),
  'Isolation Ward II': K('#C9A227', 'tri', 'Elite room. An elite every 3 days, always Level 2. Uses 2 power.'),
  Quarantine: K('#9aa0a6', 'cross', 'The room is cleared and stops spawning for 2 days.'),
  Fumigate: K('#9aa0a6', 'cross', 'Kills every monster waiting in a Ward. They pay nothing.'),
  'Double Doors': K('#8a7a5c', 'square', 'Walking through costs no MOVE. Stopping in it still counts.'),
  Soundproofing: K('#8fb4d1', 'diamond', 'No night modifiers in the room.'),
  'Fire Door': K('#E8571F', 'tri', 'This Ward holds at most 3 monsters and leaves double wood and stone.'),
  Floodlights: K('#FFE9A0', 'circle', 'No night modifiers anywhere today.'),
  Reinforcements: K('#ff9a8a', 'tri', 'Only 3 monsters fight at once. When one dies, the next steps in.'),
  'Level 2 elite': K('#F2C14E', 'star', 'An Isolation elite left 3 days: +30% HP, +2 Strength, one more relic to choose from.'),
  Die: K('#e0c27a', 'square', 'Each walk phase you roll your die (D4 to start). Loaded Dice and Bone Dice add sides.'),
  Roll: K('#e0c27a', 'square', 'The longest route you can plan this phase. Morning Rounds, Weighted Die and the Noon Dial add to it.'),
  Route: K('#B3263A', 'tri', 'Click neighbouring rooms one by one, up to your roll, never the same room twice. Click the last step to undo, then Go.'),
  Expand: K('#8a5fb0', 'hex', 'A plan that grows a Ward, Chapel, Workshop, Library or Kitchen into a free cell beside it. Pay that room\'s Expand cost; it then uses 2 power.'),
  'Big room': K('#8a5fb0', 'hex', 'A room of 2 cells (the Theatre is 2 x 2). It touches neighbours along its whole edge, and a route still enters it in ONE step.'),
  'Dark room': K('#9aa0a6', 'cross', 'A room switched off: timers pause and what is inside sleeps. Walking through costs 3 HP (Lamp Oil saves it). Corridors never go dark.'),
};
// glossaryEntry(term): { title, text, color, glyph } for a Thread word, keyword, status name or status id; null if unknown.
export function glossaryEntry(term) {
  const name = Object.keys(KEYWORDS).find((n) => n.toLowerCase() === String(term).toLowerCase());
  if (name) { const k = KEYWORDS[name]; return { title: name, text: k.text, color: k.color, glyph: k.glyph }; }
  const wn = Object.keys(WARD_GLOSSARY).find((n) => n.toLowerCase() === String(term).toLowerCase());
  if (wn) { const k = WARD_GLOSSARY[wn]; return { title: wn, text: k.text, color: k.color, glyph: k.glyph }; }
  const d = STATUSES[term]; if (!d) return null;
  return { title: d.name, text: KEYWORDS[d.name] ? KEYWORDS[d.name].text : generic(d), color: d.good === false ? '#ff9a8a' : '#8fd18f', glyph: d.good === false ? 'tri' : 'diamond' };
}
// 'knot' and 'knots' are written in lower case in boon text ("counts as 2 knots"): they find the Knot entry too
const canon = (w) => (w === 'knot' ? 'Knot' : w);
// Loose words are matched in any case, the CAPS tags (tier tags, weight pills, the AFTER panel) only in capitals.
const LOOSE = { cut: 'Cut', cuts: 'Cut', cutting: 'Cut', jam: 'Jam', jams: 'Jam', jammed: 'Jam', bare: 'Bare', pierce: 'Pierce', pierces: 'Pierce', piercing: 'Pierce', 'x cost': 'X cost', 'cost x': 'X cost' };
const CAPS = { SAFE: 'Safe', GREEDY: 'Greedy', WEIRD: 'Weird', AFTER: 'After', W1: 'Weight', W2: 'Weight', W3: 'Weight' };
const NOT_PLAIN = new Set(['Jam', 'Bare', 'Pierce', 'X cost', 'Safe', 'Greedy', 'Weird', 'After']);
const NAMES = [...Object.keys(KEYWORDS).filter((n) => !NOT_PLAIN.has(n)), 'knot'].sort((a, b) => b.length - a.length);
const KW_RE = new RegExp('\\b(' + NAMES.join('|') + ')(?:s|ed|d|ing)?\\b', 'g');
const LOOSE_RE = /\b(cut(?:s|ting)?|jam(?:s|med)?|bare|pierc(?:e|es|ing)|x cost|cost x)\b/gi;
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
const TAGS = new Set(['Safe', 'Greedy', 'Weird', 'After', 'Weight', 'Budget']);
const rank = (name) => (TAGS.has(name) ? 4 : BASIC.has(name) ? 3 : SCHOOLS_BY_NAME[name] ? 2 : 0); // statuses and rules words, then schools, basics, and last the tier tag and weight
const SCHOOLS_BY_NAME = {}; for (const sc of Object.values(SCHOOLS)) SCHOOLS_BY_NAME[sc.name] = sc;
export function defineTerm(name, n) {
  const k = KEYWORDS[name], d = STATUS_BY_NAME[name];
  if (name === 'Echo' && n >= 1) return `Your next ${n === 1 ? 'card plays' : n + ' cards play'} twice. Draw, energy and gold do not repeat.`;
  if (name === 'Weight' && n >= 1 && n <= 3) return `This patch counts ${n} against your Budget. Over it is Strain.`;
  if (d && typeof n === 'number' && Number.isFinite(n)) {
    try { let t = String(d.desc(n)); if (k && /Ignores Block/.test(k.text) && !/Block/.test(t)) t += ' Ignores Block.'; return t; } catch (e) { /* fall through */ }
  }
  return k ? k.text : '';
}
function numAround(line, h) {
  const before = line.slice(Math.max(0, h.i - 12), h.i).match(/(?<![\d.])([+-]?\d+)\s*(?:x\s*)?$/); // not the tail of a multiplier: 'x0.75 Weak' is no 75
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
  for (const ln of flatStrings(o.weak)) for (const h of scan(ln)) add(h.name, numAround(ln, h)); // the tip's own prose: its rules words need a definition too (Weight and Budget included)
  for (const id of o.ids || []) { const d = STATUSES[id]; if (d) add(d.name, undefined); }
  // o.types / o.school name what the hovered thing IS (a card's own type, a graft's school): its face already says so, so they are never defined
  // (a word the text itself uses, such as 'Echo' the status, still is).
  const self = new Set();
  if (o.types) for (const t of [].concat(o.types)) if (t) self.add(String(t)[0].toUpperCase() + String(t).slice(1));
  if (o.school && SCHOOLS[o.school] && !STATUS_BY_NAME[SCHOOLS[o.school].name]) self.add(SCHOOLS[o.school].name);
  for (const t of o.terms || []) if (WARD_GLOSSARY[t] && !found.has('ward:' + t)) found.set('ward:' + t, { name: t, ward: true, order: -100 + order++ }); // explicit Ward terms come first
  const list = [...found.values()].filter((f) => !skip.has(f.name) && !self.has(f.name)).sort((a, b) => (b.ward ? 1 : 0) - (a.ward ? 1 : 0) || rank(a.name) - rank(b.name) || a.order - b.order);
  return list.slice(0, max).map((f) => {
    if (f.ward) { const k = WARD_GLOSSARY[f.name]; return { term: f.name, title: f.name, definition: k.text, text: k.text, color: k.color, glyph: k.glyph, n: undefined }; }
    const k = KEYWORDS[f.name], d = STATUS_BY_NAME[f.name];
    const definition = defineTerm(f.name, f.n);
    return { term: f.name, title: d && f.n !== undefined && f.name !== 'Weight' ? `${f.name} ${f.n}` : f.name, definition, text: definition, color: k.color, glyph: k.glyph, n: f.n };
  });
}
// text + the definitions of its rules words, for the phone info card ("Gilt 4: Gain 4 gold at the end of combat.")
export function withGloss(text, o = {}) { const g = glossaryText([text, o.gloss || []], o); return g ? `${text}\n\n${g}` : text; }
// Plain-text form for the touch info card: "Gilt 4: Gain 4 gold at the end of combat."
export function glossaryText(input, o = {}) { return glossaryFor(input, { max: GLOSS_MAX, ...o }).map((g) => `${g.title}: ${g.definition}`).join('\n'); }
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

// ---- the compact card model ----
// A tip is ONE panel: { groups: [{ title, color, glyph, lines: [{ label, text, color }] }], terms: [{ title, text, color, glyph }], details: [string] }.
//   groups   what the thing itself says (its title row, then its own lines; a card's graft Boon / Price blocks; the computed totals)
//   terms    one short definition per rules word, most important first (statuses and rules words, then basics, then tags)
//   details  the arithmetic and stacking rules, shown only while the player HOLDS (Shift on desktop, press and hold on touch)
// A card never defines its own type or school (the face says it), and the totals line appears only when it differs from the face.
const BOON_COL = '#8fd18f', PRICE_COL = '#ff9a8a';
const LABEL_RE = /^([A-Z][A-Za-z]+(?: [a-z]+)?):\s+(?=\S)/;
function toLines(text, color) {
  const out = [];
  for (const raw of String(text || '').split('\n')) {
    const ln = raw.trim(); if (!ln) continue;
    const m = LABEL_RE.exec(ln);
    if (m) out.push({ label: m[1] + ':', text: ln.slice(m[0].length), color, lc: m[1] === 'Boon' ? BOON_COL : m[1] === 'Price' ? PRICE_COL : undefined });
    else out.push({ text: ln, color });
  }
  return out;
}
const GLOSS_MAX = 14; // the model carries every rules word the item names; the layout decides how many fit and says how many are behind 'hold'
function sectionsText(secs) { const out = []; for (const s of secs) out.push(s.text || ''); return out; }
function titleNames(secs) { const sk = new Set(); for (const s of secs) for (const h of scan(s.title || '')) if (h.i === 0 && /^\s*[+-]?\d*\s*$/.test(String(s.title).slice(h.len))) sk.add(h.name); return sk; } // only a title that IS the word ('Burn 3'); 'Leaf Gilt' names a graft, not Gilt
const asTerm = (g) => ({ title: g.title, text: g.definition, color: g.color, glyph: g.glyph });
// the numbers the card prints versus the numbers it deals right now (Strength, Weak, Vulnerable...): only lines where they differ
export function numberNow(spec, c, o = {}) {
  const out = [];
  if (!spec) return out;
  walkOps(spec.fx, (op) => {
    if (op.op !== 'dmg' && op.op !== 'block') return;
    const kind = op.op, v = op.n, base = typeof v === 'number' ? v : (v && v.base) || 0;
    if (typeof v === 'object' && v && v.per) return; // scales with something live: the arithmetic is in the details
    const face = scaleNum(base, mult(spec, !!o.tithed));
    const pm = playerMods(c && c.player, kind), parts = [];
    let n = face + pm.add; for (const p of pm.parts) parts.push(p.t);
    n *= pm.mul;
    if (kind === 'dmg') { const tm = targetMods(o.target); for (const t of tm.parts) parts.push(t); n *= tm.mul; }
    n = Math.max(0, Math.floor(n));
    if (n === face || !parts.length) return;
    const hits = op.hits && typeof op.hits === 'number' && op.hits > 1 ? ` x${op.hits}` : '';
    out.push(`${kind === 'dmg' ? 'Damage' : 'Block'} ${n}${hits} now (${face} ${parts.join(' ')})`);
  });
  return out;
}
// Model for a card (hand, shop, deck...): groups = the graft / price blocks, then terms. o: { tithed, target, groups: [{ title, color, text }] }
export function cardTipStack(spec, c, o = {}) {
  if (!spec) return null;
  const extra = [];
  if (spec.overload) extra.push('Overload');
  if (o.tithed) extra.push('Tithe');
  if (spec.cost === 'X') extra.push('X cost');
  const groups = (o.groups || []).map((x) => ({ title: x.title, color: x.color, glyph: x.glyph || 'hex', lines: toLines(x.text, undefined) }));
  const now = numberNow(spec, c, o);
  if (now.length) groups.push({ title: '', color: COL.lamp, lines: now.map((t) => ({ text: t, color: COL.lamp })) });
  const gl = glossaryFor([specGloss(spec), extra], { max: GLOSS_MAX, school: spec.school, types: spec.type, skip: titleNames(groups) });
  const terms = gl.map(asTerm), kws = gl.map((g) => g.term);
  const seen = new Set();
  walkOps(spec.fx, (op) => { if (op.s && STATUSES[op.s] && !seen.has(op.s) && !kws.includes(STATUSES[op.s].name)) { seen.add(op.s); const ss = statusSection(op.s, typeof op.n === 'number' ? op.n : undefined); terms.push({ title: ss.title, text: ss.text, color: ss.color, glyph: ss.glyph }); } });
  if (!groups.length && !terms.length) return null;
  return { __model: true, groups, terms, details: explainNumber(spec, c, o), gloss: false };
}

// ---- the tip model of every tip surface ----
// tip: core's app.tip { title, text, lines, color, anchor, o:{ gloss, glossOnly, school, types, ids, terms } } or a queued { stack, anchor, o:{ gloss:false } }.
// A stack is [[section]] (the first section is the thing, the rest are definitions) or a ready model from cardTipStack.
function modelOf(tip) {
  const o = tip.o || {};
  if (tip.stack && tip.stack.__model) return tip.stack;
  const flat = tip.stack ? tip.stack.flat() : (o.glossOnly ? [] : [{ title: tip.title, text: tip.lines ? tip.lines.join('\n') : (tip.text || ''), color: tip.color }]);
  const head = flat[0], rest = flat.slice(1);
  const groups = head && (head.title || head.text) ? [{ title: head.title || '', color: head.color, glyph: head.glyph, lines: toLines(head.text, undefined) }] : [];
  if (o.glossOnly && tip.title) groups.push({ title: tip.title, color: tip.color, lines: toLines(tip.text, undefined) });
  const terms = rest.filter((s) => s.title || s.text).map((s) => ({ title: s.title, text: s.text, color: s.color, glyph: s.glyph }));
  const details = []; for (const s of flat) for (const w of s.why || []) details.push(w);
  const single = !tip.stack || tip.stack.length === 1;
  if (single && o.gloss !== false) {
    const gl = glossaryFor(o.gloss || [], { weak: sectionsText(flat), max: GLOSS_MAX, skip: titleNames(flat), school: o.school, types: o.types, ids: o.ids, terms: o.terms });
    const said = (term) => flat.some((x) => new RegExp('^' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b[^:\\n]{0,10}:', 'm').test(String(x.text || ''))); // a word the text already explains as a 'Term: ...' line is not defined twice
    for (const g of gl) if (!terms.some((t) => String(t.title).startsWith(g.term)) && !said(g.term)) terms.push(asTerm(g));
  }
  return { groups, terms, details };
}
// tests: the sections (title + text) a tip would show, as [[...]]
export function tipSections(tip) {
  const m = modelOf(tip);
  const out = m.groups.map((g) => ({ title: g.title, text: g.lines.map((l) => (l.label ? l.label + ' ' : '') + l.text).join('\n') }));
  for (const t of m.terms) out.push({ title: t.title, text: t.text });
  return out.length ? [out] : [];
}

// ---- lifecycle ----
// A tip exists only while its anchor is hovered (held, or focused) THIS frame. The state machine runs once per frame from core.js (renderTip):
//   - it shows after SHOW_DELAY of steady hover (TOUCH_DELAY of a steady press), at once while Shift is down or when it follows a visible tip (GRACE),
//   - it fades in and out (FADE_IN / FADE_OUT; instantly with reduced motion),
//   - it is dropped at once on a press, Esc, a screen change, window blur, or when the screen sets app.tipBlock (enemy turn, drag...): and the
//     same anchor stays quiet until the pointer has left it, so a click never leaves its tip behind,
//   - touch tips live only while the finger is down; keeping it down (HOLD_TOUCH) is the 'hold' that opens the details.
export const TIP_TIMING = { SHOW_DELAY: 0.25, TOUCH_DELAY: 0.3, GRACE: 0.2, GRACE_DELAY: 0.05, FADE_IN: 0.12, FADE_OUT: 0.09, HOLD_TOUCH: 0.9 };
const TS = (app) => app._ts || (app._ts = { key: '', since: 0, alpha: 0, shown: false, last: null, ghost: null, suppress: '', lastShown: -9, cache: null, hold: false });
let SEQ = 0;
// resetTips(app): drop every tip, queued, fading or suppressed (core's app.go and app.blur call it).
export function resetTips(app) { if (!app) return; app._queued = null; app._ts = null; app.tipLayout = null; }
export function unqueueTips(app) { app._queued = null; } // core.js: a frozen screen painted under a modal never raises a tip
export function dismissTips(app) { const S = TS(app); S.shown = false; S.ghost = null; S.last = null; S.alpha = 0; S.key = ''; S.cache = null; }
export function nextTipSeq() { return ++SEQ; }
// queueTip(app, key, stack, anchor, o): HUD tips from anywhere in a frame; core draws the newest tip last. o: { gloss: false } for tips that carry their own definitions.
export function queueTip(app, key, stack, anchor, o) { app._queued = { key, stack, anchor, o: o || {}, frame: app.frame, seq: ++SEQ }; }
export function flushTips() { return false; } // kept for old callers: core.js draws every tip now
export function drawPinnedTip() { /* tips are never pinned any more */ }
// the tip candidate of this frame: the newest of app.tip and the queued one
function candidate(app) {
  const q = app._queued && app._queued.frame === app.frame ? app._queued : null, t = app.tip;
  if (t && (!q || (t.seq || 0) > q.seq)) {
    const a = t.anchor;
    return { tip: t, anchor: a, key: t.key || `${t.title}|${a ? [a.x, a.y, a.w, a.h].map(Math.round).join(',') : ''}` };
  }
  return q ? { tip: q, anchor: q.anchor, key: q.key } : null;
}
const reduced = (app) => { const st = app.shared && app.shared.meta && app.shared.meta.settings; return !!(FX_OPTS.reduced || (st && (st.reducedMotion || st.reduceMotion))); };

// ---- layout ----
const EDGE = 8, PAD = 9, RESERVED = { x: 1128, y: 0, w: 144, h: 56 }, TAIL = 7, STAGE = { w: 1280, h: 720 };
const EX = { exact: true, ui: true };
// flow(app, parts, size, maxW): inline text with mixed styles, word-wrapped. parts: [{ t, bold, color }] -> { lines: [[{ t, x, bold, color }]], lh, w }
function flow(app, parts, size, maxW) {
  const lh = Math.round(size * 1.22), sp = app.measure(' ', size, EX), lines = []; let cur = [], cx = 0, w = 0;
  for (const p of parts) {
    for (const wd of String(p.t).split(/\s+/)) {
      if (!wd) continue;
      const ww = app.measure(wd, size, p.bold ? { ...EX, bold: true } : EX);
      if (cx > 0 && cx + ww > maxW) { lines.push(cur); cur = []; cx = 0; }
      const last = cur[cur.length - 1];
      if (last && !!last.bold === !!p.bold && last.color === p.color) { last.t += ' ' + wd; } else cur.push({ t: wd, x: cx, bold: !!p.bold, color: p.color });
      cx += ww + sp; w = Math.max(w, cx - sp);
    }
  }
  if (cur.length) lines.push(cur);
  return { lines, lh, w };
}
// build the panel for a model at width W with n terms: ops are relative to the panel origin
function layout(app, M, W, n, hold, sz) {
  const cw = W - PAD * 2, ops = [], secs = [];
  let y = PAD, right = 0;
  const hasTitle = M.groups.length && M.groups[0].title;
  M.groups.forEach((g, gi) => {
    const s0 = y, texts = [];
    const first = gi === 0 && g.title, tsz = first ? sz.ti : sz.bo, gx = g.glyph && g.title ? Math.round(tsz * 0.9) : 0;
    if (g.title) {
      const L = app.layoutText(g.title, { size: tsz, bold: true, ui: true, exact: true, maxW: cw - gx });
      if (g.glyph) ops.push({ k: 'glyph', g: g.glyph, x: PAD + gx / 2 - 1, y: y + L.lineH / 2, s: Math.round(tsz * 0.62), color: g.color || COL.lamp });
      ops.push({ k: 'text', t: g.title, x: PAD + gx, y, size: tsz, bold: true, color: g.color || COL.lamp, maxW: cw - gx, lh: L.lineH });
      y += L.lines.length * L.lineH; right = Math.max(right, PAD + gx + L.w); texts.push(g.title);
    }
    for (const ln of g.lines) {
      const parts = []; if (ln.label) parts.push({ t: ln.label, bold: true, color: ln.lc || COL.lamp }); parts.push({ t: ln.text, color: ln.color || COL.vellum });
      const F = flow(app, parts, sz.bo, cw);
      F.lines.forEach((segs, i) => { for (const sg of segs) ops.push({ k: 'text', t: sg.t, x: PAD + sg.x, y: y + i * F.lh, size: sz.bo, bold: sg.bold, color: sg.color }); });
      y += F.lines.length * F.lh; right = Math.max(right, PAD + F.w); texts.push((ln.label ? ln.label + ' ' : '') + ln.text);
    }
    secs.push({ x: PAD, y: s0, w: cw, h: y - s0, title: g.title || '', text: texts.slice(g.title ? 1 : 0).join('\n'), why: [] });
    y += 5;
  });
  if (M.groups.length) y -= 5;
  const shown = M.terms.slice(0, n), hidden = M.terms.length - shown.length;
  if (shown.length) {
    if (M.groups.length) { y += 4; ops.push({ k: 'rule', x1: PAD, x2: W - PAD, y }); y += 5; }
    const gi = Math.round(sz.bo * 0.9);
    shown.forEach((t, i) => {
      const F = flow(app, [{ t: t.title, bold: true, color: t.color || COL.lamp }, { t: t.text, color: 'rgba(232,220,196,.88)' }], sz.bo, cw - gi), s0 = y;
      if (t.glyph) ops.push({ k: 'glyph', g: t.glyph, x: PAD + gi / 2 - 1, y: y + F.lh / 2, s: Math.round(sz.bo * 0.62), color: t.color || COL.lamp });
      F.lines.forEach((segs, li) => { for (const sg of segs) ops.push({ k: 'text', t: sg.t, x: PAD + gi + sg.x, y: y + li * F.lh, size: sz.bo, bold: sg.bold, color: sg.color }); });
      y += F.lines.length * F.lh; right = Math.max(right, PAD + gi + F.w);
      secs.push({ x: PAD, y: s0, w: cw, h: y - s0, title: t.title, text: t.text, why: [] });
      y += i < shown.length - 1 ? 3 : 0;
    });
  }
  if (hold && M.details.length) {
    y += 4; ops.push({ k: 'rule', x1: PAD, x2: W - PAD, y }); y += 5;
    for (const d of M.details) {
      const F = flow(app, [{ t: d, color: COL.lamp }], sz.bo, cw), s0 = y;
      F.lines.forEach((segs, li) => { for (const sg of segs) ops.push({ k: 'text', t: sg.t, x: PAD + sg.x, y: y + li * F.lh, size: sz.bo, bold: false, color: sg.color }); });
      y += F.lines.length * F.lh; right = Math.max(right, PAD + F.w);
      secs.push({ x: PAD, y: s0, w: cw, h: y - s0, title: 'Detail', text: d, why: [] }); y += 2;
    }
    y -= 2;
  }
  if (hidden > 0) {
    y += shown.length || M.groups.length ? 4 : 0;
    const t = `+${hidden} more (hold)`, tw = app.measure(t, sz.sm, EX);
    ops.push({ k: 'text', t, x: PAD, y, size: sz.sm, bold: false, color: 'rgba(242,193,78,.85)' });
    secs.push({ x: PAD, y, w: cw, h: Math.round(sz.sm * 1.22), title: t, text: '', why: [] });
    y += Math.round(sz.sm * 1.22); right = Math.max(right, PAD + tw);
  }
  y += PAD;
  const w = Math.max(Math.min(W, Math.ceil(right + PAD)), hasTitle ? 120 : 0);
  return { w, h: y, ops, secs, hidden, shown: shown.length, W };
}
// the width ladder: narrow first; never wider than 38% of the stage unless the player holds
function fit(app, M, availW, availH, hold) {
  const phone = app.scale < 0.95, sz = phone ? { ti: app.sz(16), bo: app.sz(14), sm: app.sz(14) } : { ti: app.sz(15), bo: app.sz(13), sm: app.sz(12) }; // phones: the core floor boosts text at most 1.5x, so start a little higher
  const maxH = hold ? availH : Math.min(availH, phone ? 260 : 200);
  const ladder = hold ? [420, 520, 600] : [300, 360, 420, Math.round(0.38 * STAGE.w)];
  const Ws = ladder.map((w) => Math.min(w, Math.floor(availW))).filter((w, i, a) => w >= 200 && a.indexOf(w) === i);
  if (!Ws.length) return null;
  const nAll = M.terms.length; let R = null;
  for (const W of Ws) { R = layout(app, M, W, nAll, hold, sz); if (R.h <= maxH + 0.5) return R; }
  if (!hold) for (let n = nAll - 1; n >= 0; n--) { R = layout(app, M, Ws[Ws.length - 1], n, hold, sz); if (R.h <= maxH + 0.5) return R; }
  R.big = true; return R;
}
const ovl = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
export function tipBounds(app) { const s = app.safe || { l: 0, t: 0, r: 0, b: 0 }; return { x0: EDGE + s.l, y0: EDGE + s.t, x1: 1280 - EDGE - s.r, y1: 720 - EDGE - s.b }; }
// what a tip should stay off: the HUD widgets of this frame (hand cards, the Thread rail, intents, buttons...), not the containers and not other tips
function avoidList(app, anchor) {
  const m = app.mouse, anchors = [anchor], avoid = [];
  for (const r of getAll()) {
    if (r.group === 'tip' || /^tip\d/.test(r.id) || r.w < 6 || r.h < 6 || r.w * r.h > 250000 || (r.w > 1000 && r.h > 90)) continue;
    const world = r.layer === 'world', box = { x: r.x - 3, y: r.y - 3, w: r.w + 6, h: r.h + 6, wt: world ? 160 : 1500 }; // the actors (hero, enemies) are worth keeping clear too, less than the HUD
    if (!world && m.x >= r.x && m.x <= r.x + r.w && m.y >= r.y && m.y <= r.y + r.h && r.w * r.h < 120000) anchors.push(box); // the widget under the pointer is the thing being described
    else if (ovl(box, anchor) / Math.min(box.w * box.h, anchor.w * anchor.h) < 0.6) avoid.push(box);
  }
  return { anchors, avoid };
}
// candidate search: the free spot nearest to the anchor (gap about 8px) that covers the least of the anchor and of the other widgets, inside the region when given
function search(app, a, w, h, Rg, B, A, touch) {
  const m = app.mouse, pr = touch ? 40 : 8, ptr = { x: m.x - pr, y: m.y - pr, w: pr * 2, h: pr * 2 };
  const x0 = Math.max(B.x0, Rg.x0), x1 = Math.min(B.x1, Rg.x1) - w, y0 = Math.max(B.y0, Rg.y0), y1 = Math.min(B.y1, Rg.y1) - h;
  if (x1 < x0 - 0.5 || y1 < y0 - 0.5) return null;
  const cands = [], push = (x, y) => cands.push({ x: Math.max(x0, Math.min(x1, x)), y: Math.max(y0, Math.min(y1, y)) });
  const acx = a.x + a.w / 2, acy = a.y + a.h / 2, G = 8 + TAIL;
  push(a.x + a.w + G, acy - h / 2); push(a.x - w - G, acy - h / 2); push(acx - w / 2, a.y - h - G); push(acx - w / 2, a.y + a.h + G);
  push(a.x + a.w + G, a.y); push(a.x - w - G, a.y); push(a.x, a.y - h - G); push(a.x, a.y + a.h + G);
  push(a.x + a.w - w, a.y - h - G); push(a.x + a.w - w, a.y + a.h + G);
  for (let x = x0; x <= x1 + 0.5; x += 16) for (let y = y0; y <= y1 + 0.5; y += 16) push(x, y);
  let best = null;
  for (const c of cands) {
    const r = { x: c.x, y: c.y, w, h };
    const dx = Math.max(0, a.x - (r.x + w), r.x - (a.x + a.w)), dy = Math.max(0, a.y - (r.y + h), r.y - (a.y + a.h));
    const gd = Math.hypot(dx, dy); let cost = (gd < G ? (G - gd) * 1.2 : (gd - G) * 3) + Math.hypot(r.x + w / 2 - acx, r.y + h / 2 - acy) * 0.12;
    for (const b of A.anchors) cost += 12000 * ovl(r, b) / Math.min(w * h, b.w * b.h);
    for (const b of A.avoid) { const o = ovl(r, b); if (o) cost += b.wt * o / Math.min(w * h, b.w * b.h); }
    if (ovl(r, ptr)) cost += 4000;
    cost += 8000 * ovl(r, RESERVED) / (w * h);
    if (!best || cost < best.cost) best = { cost, r };
  }
  return best;
}
function place(app, anchor, w, h, B, region, touch) {
  const A = avoidList(app, anchor);
  let best = null;
  if (region) best = search(app, anchor, w, h, region, B, A, touch);
  if (!best || best.cost >= 10000) { const all = search(app, anchor, w, h, { x0: -1e9, y0: -1e9, x1: 1e9, y1: 1e9 }, B, A, touch); if (all && (!best || all.cost < best.cost)) best = all; }
  return best ? best.r : { x: B.x0, y: B.y0, w, h };
}
// anchor.region = { x0, y0, x1, y1 } is where the panel should live (a screen keeps it off its button column); anchor.band = { x, y, bottom, dir } the older form of it
function regionOf(anchor, B) {
  if (anchor.region) return anchor.region;
  const b = anchor.band; if (!b) return null;
  return b.dir > 0 ? { x0: b.x, y0: Math.max(B.y0, b.y), x1: B.x1, y1: Math.min(B.y1, b.bottom) } : { x0: B.x0, y0: Math.max(B.y0, b.y), x1: b.x, y1: Math.min(B.y1, b.bottom) };
}
function arrange(app, M, anchor, hold, touch) {
  const B = tipBounds(app), Rg = hold ? null : regionOf(anchor, B);
  let R = null, region = null;
  if (Rg) { const rw = Math.min(B.x1, Rg.x1) - Math.max(B.x0, Rg.x0), rh = Math.min(B.y1, Rg.y1) - Math.max(B.y0, Rg.y0); if (rw >= 200 && rh >= 60) { R = fit(app, M, rw, rh, hold); if (R && !R.big) region = Rg; else R = null; } }
  if (!R) R = fit(app, M, B.x1 - B.x0, B.y1 - B.y0, hold);
  if (!R) return null;
  const rect = place(app, anchor, R.w, R.h, B, region, touch);
  return { R, rect };
}

// ---- drawing ----
function paint(app, L, alpha) {
  const ctx = app.ctx, { rect, R } = L, col = L.color || COL.lamp;
  ctx.save(); ctx.globalAlpha *= alpha;
  const a = L.anchor, tail = L.tail;
  if (tail) { // a small arrow on the edge facing the anchor
    ctx.beginPath();
    if (tail.side === 'b') { ctx.moveTo(tail.p - TAIL, rect.y + rect.h - 0.5); ctx.lineTo(tail.p, rect.y + rect.h + TAIL); ctx.lineTo(tail.p + TAIL, rect.y + rect.h - 0.5); }
    else if (tail.side === 't') { ctx.moveTo(tail.p - TAIL, rect.y + 0.5); ctx.lineTo(tail.p, rect.y - TAIL); ctx.lineTo(tail.p + TAIL, rect.y + 0.5); }
    else if (tail.side === 'r') { ctx.moveTo(rect.x + rect.w - 0.5, tail.p - TAIL); ctx.lineTo(rect.x + rect.w + TAIL, tail.p); ctx.lineTo(rect.x + rect.w - 0.5, tail.p + TAIL); }
    else { ctx.moveTo(rect.x + 0.5, tail.p - TAIL); ctx.lineTo(rect.x - TAIL, tail.p); ctx.lineTo(rect.x + 0.5, tail.p + TAIL); }
    ctx.closePath(); ctx.fillStyle = 'rgba(17,14,11,.97)'; ctx.fill(); ctx.strokeStyle = col; ctx.globalAlpha *= 0.7; ctx.lineWidth = lnw(1.5); ctx.stroke(); ctx.globalAlpha /= 0.7;
  }
  ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 3;
  app.rr(rect.x, rect.y, rect.w, rect.h, 8); ctx.fillStyle = 'rgba(17,14,11,.97)'; ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.save(); ctx.globalAlpha *= 0.7; ctx.strokeStyle = col; ctx.lineWidth = lnw(1.5); app.rr(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1, 8); ctx.stroke(); ctx.restore();
  if (tail) { ctx.save(); ctx.fillStyle = 'rgba(17,14,11,.97)'; ctx.beginPath(); // hide the border where the arrow joins
    if (tail.side === 'b') ctx.rect(tail.p - TAIL + 1, rect.y + rect.h - 2, TAIL * 2 - 2, 3); else if (tail.side === 't') ctx.rect(tail.p - TAIL + 1, rect.y - 1, TAIL * 2 - 2, 3);
    else if (tail.side === 'r') ctx.rect(rect.x + rect.w - 2, tail.p - TAIL + 1, 3, TAIL * 2 - 2); else ctx.rect(rect.x - 1, tail.p - TAIL + 1, 3, TAIL * 2 - 2);
    ctx.fill(); ctx.restore(); }
  void a;
  app._tipDraw = true;
  for (const op of R.ops) {
    if (op.k === 'text') app.text(op.t, rect.x + op.x, rect.y + op.y, { size: op.size, bold: op.bold, color: op.color, ui: true, exact: true, maxW: op.maxW, lineH: op.lh });
    else if (op.k === 'glyph') drawGlyph(ctx, op.g, rect.x + op.x, rect.y + op.y, op.s, op.color);
    else if (op.k === 'rule') { ctx.fillStyle = 'rgba(232,220,196,.16)'; ctx.fillRect(rect.x + op.x1, rect.y + op.y, op.x2 - op.x1, 1); }
  }
  app._tipDraw = false;
  ctx.restore();
}
function finish(app, M, c, S, hold, touch) {
  const anchor = c.anchor || { x: app.mouse.x - 8, y: app.mouse.y - 6, w: 16, h: 28 };
  const m = app.mouse;
  const sig = [c.key, hold ? 1 : 0, touch ? 1 : 0, app.scale, app.textScale, JSON.stringify(M), [anchor.x, anchor.y, anchor.w, anchor.h].map(Math.round).join(','), anchor.region ? JSON.stringify(anchor.region) : (anchor.band ? JSON.stringify(anchor.band) : ''), c.anchor ? '' : Math.round(m.x) + ',' + Math.round(m.y), getAll().length].join('|');
  if (S.cache && S.cache.sig === sig) return S.cache.L;
  const A = arrange(app, M, anchor, hold, touch); if (!A) return null;
  const { R, rect } = A, a = anchor, acx = a.x + a.w / 2, acy = a.y + a.h / 2;
  let tail = null;
  const gx = Math.max(0, a.x - (rect.x + rect.w), rect.x - (a.x + a.w)), gy = Math.max(0, a.y - (rect.y + rect.h), rect.y - (a.y + a.h));
  if (Math.hypot(gx, gy) < 420) { // the arrow sits on the edge that faces the anchor
    const cl = (v, lo, hi) => Math.max(lo + 14, Math.min(hi - 14, v));
    if (gy >= gx) tail = rect.y + rect.h <= a.y + a.h / 2 ? { side: 'b', p: cl(acx, rect.x, rect.x + rect.w) } : { side: 't', p: cl(acx, rect.x, rect.x + rect.w) };
    else tail = rect.x + rect.w <= a.x + a.w / 2 ? { side: 'r', p: cl(acy, rect.y, rect.y + rect.h) } : { side: 'l', p: cl(acy, rect.y, rect.y + rect.h) };
  }
  const first = M.groups[0] || M.terms[0];
  const L = { rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: R.w, h: R.h }, R, anchor, tail, color: (first && first.color) || COL.lamp, hold, hidden: R.hidden, panels: [], frame: app.frame, sig };
  L.panels.push({ x: L.rect.x, y: L.rect.y, w: R.w, h: R.h, secs: R.secs.map((s) => ({ ...s, x: s.x + L.rect.x, y: s.y + L.rect.y })) });
  S.cache = { sig, L };
  return L;
}
// the one entry point (core.js, every frame): c is the frame's candidate or null
export function renderTip(app, tip) {
  const S = TS(app), t = app.t, dt = Math.min(app.dt || 0.016, 0.05), m = app.mouse, T = TIP_TIMING, rm = reduced(app), touch = !!m.touch;
  const c = tip ? candidateOf(app, tip) : candidate(app);
  const shift = !!(app.keys && app.keys.has && app.keys.has('Shift'));
  let cur = c;
  // events that drop the tip at once; the same anchor stays quiet until the pointer has left it
  if (S.suppress) { if (cur && cur.key === S.suppress) cur = null; else S.suppress = ''; }
  const esc = app.pressedKeys && app.pressedKeys.some((e) => e && e.key === 'Escape');
  if ((esc || (m.pressed && !touch)) && (cur || S.shown)) { if (cur) S.suppress = cur.key; else if (S.key) S.suppress = S.key; dismissTips(app); cur = null; }
  if (cur && app.tipBlock && !shift) { dismissTips(app); cur = null; }
  if (cur && touch && !m.down) cur = null; // touch: the tip lives while the finger is down
  if (!cur) {
    if (S.shown && S.last) { S.ghost = { L: S.last, alpha: S.alpha }; }
    S.shown = false; S.key = ''; S.alpha = 0;
  } else {
    if (cur.key !== S.key) {
      S.grace = !!((S.shown && S.last) || S.ghost || t - S.lastShown <= T.GRACE); // moving from one visible tip to the next shows it at once; the old one is dropped, never crossfaded
      S.shown = false; S.ghost = null; S.key = cur.key; S.since = t; S.cache = null;
    }
    const delay = shift ? 0 : S.grace ? T.GRACE_DELAY : touch ? T.TOUCH_DELAY : T.SHOW_DELAY;
    if (t - S.since >= delay) {
      S.shown = true; S.lastShown = t;
      S.hold = shift || (touch && m.down && t - S.since >= T.HOLD_TOUCH);
      const M = modelOf(cur.tip);
      const L = (M.groups.length || M.terms.length) ? finish(app, M, cur, S, S.hold, touch) : null;
      if (L) {
        S.last = L; S.alpha = rm ? 1 : Math.min(1, S.alpha + dt / T.FADE_IN);
      } else S.shown = false;
    }
  }
  if (S.ghost) {
    S.ghost.alpha -= rm ? 1 : dt / T.FADE_OUT;
    if (S.ghost.alpha <= 0) S.ghost = null; else { paint(app, S.ghost.L, S.ghost.alpha); }
  }
  if (S.shown && S.last) {
    const L = S.last; paint(app, L, S.alpha);
    app.reg('tip0', L.rect.x, L.rect.y, L.rect.w, L.rect.h, { layer: 'overlay', overlay: true, group: 'tip' });
    L.frame = app.frame; app.tipLayout = L;
  }
  return true;
}
function candidateOf(app, tip) { const a = tip.anchor; return { __cand: true, tip, anchor: a, key: tip.key || `${tip.title}|${a ? [a.x, a.y, a.w, a.h].map(Math.round).join(',') : ''}` }; }
