// GRAFTWORK art lab: every painted UI part (assets/ui, built by tools/graftwork_ui_build.py) on one page, so the look can be judged without playing.
// Nothing is re-implemented: cards are real cards of the game data drawn by art/cards.js, panels and buttons by ui/chrome.js, the HUD pieces by
// art/icons.js and ui/combat_hud.js, the parts themselves by ui/skin.js. Wherever a procedural look exists it stands next to the painted one
// (the same call with the art switch of ui/templates.js forced off). Works on a phone in landscape: the page scrolls, every canvas fits the width.
// URL: ?only=cards|states|panels|buttons|hud|icons|title (one block)  &bg=mid (grey backdrop)
import { templates } from '../ui/templates.js';
import * as SK from '../ui/skin.js';
import * as CH from '../ui/chrome.js';
import { drawCard, drawCardBack, CARD_W, CARD_H } from '../art/cards.js';
import { drawStatus, drawIntent, drawEnergyOrb, drawShield, drawBudgetGauge, drawPileIcon, INTENT_ART } from '../art/icons.js';
import { drawBar, drawIntentBubble } from '../ui/combat_hud.js';
import { CARD_LIST, GRAFT_LIST, STATUSES } from '../data/index.js';
import { cardSpec, canGraft } from '../engine/cards.js';

const Q = new URLSearchParams(location.search);
const W = 1180; // logical width of every canvas
const INK = '#eadfc6', DIM = '#a8977a';
let backdrop = Q.get('bg') === 'mid' ? '#5a5650' : '#191411';
templates.configure({ base: '../assets/ui/', art: true });

// ---------------- the app stub the game's drawing code expects ----------------
function makeApp(g) {
  const font = (o) => `${o.bold ? 'bold ' : ''}${o.size || 14}px ${o.ui ? 'Trebuchet MS, sans-serif' : 'Georgia, serif'}`;
  return {
    ctx: g, px: 2, scale: 1, frame: 0, t: 0, dt: 0, mouse: { x: -999, y: -999 }, shared: {},
    rr(x, y, w, h, r) { g.beginPath(); const q = Math.max(0, Math.min(r, w / 2, h / 2)); if (g.roundRect) g.roundRect(x, y, w, h, q); else g.rect(x, y, w, h); },
    measure(s, size, o = {}) { g.save(); g.font = font({ ...o, size }); const w = g.measureText(String(s)).width; g.restore(); return w; },
    text(s, x, y, o = {}) {
      g.save(); g.font = font(o); g.textAlign = o.align || 'left'; g.textBaseline = 'top';
      if (o.stroke) { g.lineJoin = 'round'; g.lineWidth = o.strokeW || 3; g.strokeStyle = o.stroke; g.strokeText(String(s), x, y); }
      g.fillStyle = o.color || INK; g.fillText(String(s), x, y); g.restore();
    },
  };
}
const label = (g, s, x, y, o = {}) => { g.save(); g.font = `${o.bold ? 'bold ' : ''}${o.size || 12}px Trebuchet MS, sans-serif`; g.textAlign = o.align || 'left'; g.textBaseline = 'top'; g.fillStyle = o.color || DIM; g.fillText(String(s), x, y); g.restore(); };
// run a draw with the painted art off: the procedural look of the same call
const procedural = (fn) => { templates.force(false); try { fn(); } finally { templates.force(true); } };

// ---------------- blocks ----------------
const BLOCKS = [];
function block(id, title, note, h, draw) { BLOCKS.push({ id, title, note, h, draw }); }

// real cards: the first card of the data with that type and rarity
const cardOf = (type, rarity) => CARD_LIST.find((c) => c.type === type && c.rarity === rarity) || CARD_LIST.find((c) => c.type === type && c.rarity !== 'starter') || CARD_LIST.find((c) => c.type === type);
const specOf = (c, o = {}) => cardSpec({ uid: 1, id: c.id, grafts: o.grafts || [], fused: o.fused || [], up: o.up ? 1 : 0, waived: o.waived || [] });
const graftsFor = (c, n) => { const inst = { uid: 1, id: c.id, grafts: [], up: 0 }, out = []; for (const gr of GRAFT_LIST) { if (out.length >= n) break; if (canGraft(inst, gr.id)) { out.push(gr.id); inst.grafts.push(gr.id); } } return out; };
const HAND = 0.74, BIG = 1.22;

const FRAMES = [];
for (const t of ['attack', 'skill', 'power']) for (const r of ['common', 'uncommon', 'rare']) FRAMES.push([t, r]);
FRAMES.push(['junk', 'junk']);
for (const [type, rarity] of FRAMES) {
  const c = cardOf(type, rarity), own = c && c.rarity === rarity;
  const fid = type === 'junk' ? 'card_front.junk' : `card_front.${type}.${rarity}`;
  block('cards', fid, `${c ? c.name : '?'} (${c ? c.id : ''})${own ? '' : `: the data has no ${rarity} ${type} card, this one is drawn in that frame`}. Hand size and inspect size, painted then procedural.`, 400, (g) => {
    if (!c) return;
    const spec = specOf(c), o = { t: 1, still: true, rarity };
    const cols = [[110, HAND, true, 'hand, painted'], [300, HAND, false, 'hand, procedural'], [560, BIG, true, 'inspect, painted'], [880, BIG, false, 'inspect, procedural']];
    for (const [x, sc, painted, text] of cols) {
      const run = () => drawCard(g, spec, x + 40, 205, { ...o, scale: sc, compact: sc === HAND });
      if (painted) run(); else procedural(run);
      label(g, text, x + 40, 384, { align: 'center' });
    }
  });
}
block('cards', 'card_back.plain', 'The equipped back, painted then procedural. Other backs (ledger, bone, ...) have no painting yet and stay procedural.', 300, (g) => {
  drawCardBack(g, 150, 150, { t: 1, back: 'plain', scale: HAND }); label(g, 'hand, painted', 150, 284, { align: 'center' });
  procedural(() => drawCardBack(g, 340, 150, { t: 1, back: 'plain', scale: HAND })); label(g, 'hand, procedural', 340, 284, { align: 'center' });
  drawCardBack(g, 560, 150, { t: 1, back: 'plain', scale: 0.92 }); label(g, 'larger, painted', 560, 284, { align: 'center' });
  procedural(() => drawCardBack(g, 800, 150, { t: 1, back: 'plain', scale: 0.92 })); label(g, 'larger, procedural', 800, 284, { align: 'center' });
});

// states: what a card can look like in play
const STATES = [
  ['upgraded', (c) => [specOf(c, { up: true }), {}]],
  ['1 graft', (c) => [specOf(c, { grafts: graftsFor(c, 1) }), {}]],
  ['2 grafts', (c) => [specOf(c, { grafts: graftsFor(c, 2) }), {}]],
  ['Price waived (Free Sample)', (c) => { const g = graftsFor(c, 2); return [specOf(c, { grafts: g, waived: g }), {}]; }],
  ['3 grafts (Overload)', (c) => [specOf(c, { grafts: graftsFor(c, 3) }), {}]],
  ['fused (Tempered)', (c) => [specOf(c, { fused: graftsFor(c, 2) }), {}]],
  ['tithed', (c) => [specOf(c), { tithed: true }]],
  ['jammed, cost up', (c) => { const s = specOf(c); return [s, { jam: true, cost: (typeof s.cost === 'number' ? s.cost : 0) + 1 }]; }],
  ['cost down', (c) => { const s = specOf(c, { up: true }); return [s, { cost: Math.max(0, (typeof s.cost === 'number' ? s.cost : 1) - 1) }]; }],
  ['playable (glow)', (c) => [specOf(c), { glow: 0.8 }]],
  ['unplayable (dim)', (c) => [specOf(c), { dim: 0.8 }]],
  ['selected', (c) => [specOf(c), { selected: true }]],
];
for (const [mode, sc, compact] of [['hand size', HAND, true], ['inspect size', 0.98, false]]) {
  for (let part = 0; part < 2; part++) {
    const list = STATES.slice(part ? 6 : 0, part ? 12 : 6);
    block('states', `Card states, ${mode} (${part + 1} of 2)`, 'Top row painted, bottom row procedural. The card is a two cost attack with room for three grafts; a waived Price is not on the card at all.', compact ? 520 : 680, (g) => {
      const c = CARD_LIST.find((q) => q.type === 'attack' && q.rarity === 'uncommon' && q.cost === 2) || cardOf('attack', 'uncommon');
      const cw = CARD_W * sc + (compact ? 30 : 16), rowH = CARD_H * sc + 26;
      list.forEach(([name, mk], i) => {
        const [spec, o] = mk(c), x = 26 + cw / 2 + i * cw;
        const run = (y) => drawCard(g, spec, x, y, { t: 1, still: true, scale: sc, compact, ...o });
        run(20 + (CARD_H * sc) / 2); procedural(() => run(20 + rowH + (CARD_H * sc) / 2));
        label(g, name, x, 20 + rowH * 2 - 8, { align: 'center' });
      });
    });
  }
}

// panels and the modal at three sizes
const PANELS = [['panel', 'leather border over the dark slab (the vellum centre of the raw art is removed)'], ['panel.parchment', 'torn vellum sheet, for ink on paper'], ['modal', 'dark field, engraved brass corners']];
for (const [id, what] of PANELS) {
  block('panels', id, `${what}. Three sizes; the corner pieces never stretch, the edges repeat. Right: the procedural panel.`, 330, (g) => {
    const app = makeApp(g), fill = 'rgba(26,22,20,.92)';
    const sizes = [[20, 14, 170, 120], [210, 14, 300, 190], [530, 14, 420, 300]];
    for (const [x, y, w, h] of sizes) {
      CH.panel(app, x, y, w, h, { frame: id, fill, r: 12 });
      const dark = id !== 'panel.parchment';
      app.text(`${w} x ${h}`, x + w / 2, y + h / 2 - 16, { size: 15, bold: true, align: 'center', color: dark ? INK : '#2b1e1a' });
      app.text(dark ? 'light text on the slab' : 'ink on the sheet', x + w / 2, y + h / 2 + 4, { size: 13, ui: true, align: 'center', color: dark ? 'rgba(232,220,196,.75)' : 'rgba(43,30,26,.8)' });
    }
    procedural(() => CH.panel(app, 970, 14, 190, 190, { fill, r: 12 }));
    app.text('procedural', 1065, 100, { size: 13, ui: true, align: 'center' });
    if (!SK.has(id)) label(g, 'the part is not loaded', 20, 310, { color: '#e06a5a' });
  });
}

// buttons
block('buttons', 'button.normal / hover / down / disabled', 'The leather pill at four sizes, the four states left to right, then the procedural button. A pill keeps its round caps at every height.', 380, (g) => {
  const app = makeApp(g), names = ['normal', 'hover', 'down', 'disabled'];
  [[200, 44], [150, 38], [210, 60], [120, 40]].forEach(([w, h], r) => {
    let x = 20; const y = 16 + r * 86;
    names.forEach((nm, st) => {
      const dy = CH.button(app, x, y, w, h, {}, st);
      app.text(nm[0].toUpperCase() + nm.slice(1), x + w / 2, y + dy + h / 2 - 10, { size: Math.min(20, h * 0.42), bold: true, align: 'center', color: st === 3 ? 'rgba(232,220,196,.4)' : INK, stroke: 'rgba(0,0,0,.35)', strokeW: 2 });
      x += w + 14;
    });
    procedural(() => { const dy = CH.button(app, x + 20, y, w, h, {}, 0); app.text('Procedural', x + 20 + w / 2, y + dy + h / 2 - 10, { size: Math.min(20, h * 0.42), bold: true, align: 'center' }); });
    label(g, `${w} x ${h}`, 20, y + h + 6);
  });
});
block('buttons', 'button tints and rims', 'A call that passes a fill gets leather of that hue (gold: the main action, green), its stroke becomes the rim (lamp: chosen, red: dangerous). Plain, gold, green, chosen, dangerous; second row: the same hovered.', 190, (g) => {
  const app = makeApp(g), kinds = [['Plain', {}], ['Main action', { fill: '#5a4720' }], ['Go', { fill: '#2f5a2a' }], ['Chosen', { fill: '#5a4720', stroke: '#F2C14E' }], ['Abandon run', { fill: '#4a2323', stroke: '#B3263A' }]];
  for (let row = 0; row < 2; row++) kinds.forEach(([text, o], i) => {
    const x = 20 + i * 228, y = 16 + row * 70, dy = CH.button(app, x, y, 210, 48, o, row);
    app.text(text, x + 105, y + dy + 13, { size: 19, bold: true, align: 'center', stroke: 'rgba(0,0,0,.35)', strokeW: 2 });
  });
});
block('buttons', 'button.small', 'One painting, used for buttons 34 px high and lower: hover, pressed and disabled are washes over it. Tabs: off, on (gold fill and lamp stroke), then the procedural tab.', 150, (g) => {
  const app = makeApp(g), names = ['normal', 'hover', 'down', 'disabled'];
  names.forEach((nm, st) => { const x = 20 + st * 150, dy = CH.button(app, x, 16, 134, 34, {}, st); app.text(nm, x + 67, 16 + dy + 8, { size: 15, ui: true, bold: true, align: 'center', color: st === 3 ? 'rgba(232,220,196,.4)' : INK }); });
  [['Cards', false], ['Grafts', true], ['Relics', false]].forEach(([text, on], i) => {
    const x = 20 + i * 126, dy = CH.button(app, x, 76, 116, 32, { fill: on ? '#5a4720' : '#26201c', stroke: on ? '#F2C14E' : 'rgba(232,220,196,.4)' }, 0);
    app.text(text, x + 58, 76 + dy + 7, { size: 15, ui: true, bold: true, align: 'center', color: on ? '#F2C14E' : INK });
  });
  procedural(() => { const dy = CH.button(app, 420, 76, 116, 32, { fill: '#5a4720', stroke: '#F2C14E' }, 0); app.text('Procedural', 478, 76 + dy + 7, { size: 15, ui: true, bold: true, align: 'center', color: '#F2C14E' }); });
  for (const s of [28, 40]) { const x = 640 + (s === 40 ? 60 : 0), dy = CH.button(app, x, 16, s === 40 ? 44 : 28, s === 40 ? 38 : 28, {}, 0); app.text('?', x + (s === 40 ? 22 : 14), 16 + dy + (s === 40 ? 8 : 5), { size: s === 40 ? 20 : 15, bold: true, align: 'center' }); }
  label(g, 'icon buttons', 640, 62);
});

// HUD
block('hud', 'bar.hp.frame + bar.hp.fill', 'The glass tube at several fills (the liquid is one strip, mirrored tile by tile), with a damage trail on the third. Right column: the procedural bar.', 200, (g) => {
  const app = makeApp(g);
  [[1, 1, '44/44'], [0.72, 0.72, '32/44'], [0.4, 0.62, '18/44'], [0.08, 0.08, '4/44'], [0, 0, '0/44']].forEach(([p, tr, text], i) => {
    const y = 18 + i * 34;
    drawBar(app, 30, y, 300, 16, p * 44, tr * 44, 44, '#a8412f', text);
    drawBar(app, 380, y, 150, 16, p * 44, tr * 44, 44, '#a8412f', text);
    procedural(() => drawBar(app, 600, y, 300, 16, p * 44, tr * 44, 44, '#a8412f', text));
  });
  label(g, '300 wide', 30, 186); label(g, '150 wide', 380, 186); label(g, 'procedural', 600, 186);
});
block('hud', 'dial.energy, plate.block', 'Energy 3 of 3, 2 of 3, 1 of 3, none; Block 12, 7, 120. Second row: procedural.', 230, (g) => {
  for (let row = 0; row < 2; row++) {
    const y = 60 + row * 108, run = () => {
      [3, 2, 1, 0].forEach((n, i) => drawEnergyOrb(g, 70 + i * 120, y, 88, n, 3));
      [12, 7, 120].forEach((n, i) => drawShield(g, 590 + i * 80, y, i === 2 ? 44 : 32, n));
      drawShield(g, 880, y, 64, 9);
    };
    if (row) procedural(run); else run();
  }
});
block('hud', 'chip.intent, chip.status', 'The intent tag (the shield chip, stretched around its point) with the painted intent icons, and status chips, good and bad. Second row: procedural.', 250, (g) => {
  const app = makeApp(g);
  const intents = [{ kinds: ['attack'], icons: [{ k: 'attack' }], dmg: 9 }, { kinds: ['attack'], icons: [{ k: 'multi', hits: 3 }], dmg: 12, per: 4, hits: 3 }, { kinds: ['attack', 'debuff'], icons: [{ k: 'heavy' }, { k: 'debuff' }], dmg: 22 }, { kinds: ['defend', 'buff'], icons: [{ k: 'defend' }, { k: 'buff' }] }, { kinds: ['unknown'], hidden: true }];
  const sts = Object.keys(STATUSES).slice(0, 7);
  for (let row = 0; row < 2; row++) {
    const y = 44 + row * 118, run = () => {
      intents.forEach((info, i) => drawIntentBubble(app, info, 80 + i * 150, y, 1, 1, 170));
      sts.forEach((id, i) => { const good = STATUSES[id].good !== false; drawStatus(g, id, 800 + i * 44, y - 14, 32, good); drawStatus(g, id, 800 + i * 44, y + 26, 24, good); });
    };
    if (row) procedural(run); else run();
  }
  label(g, '32 and 24 px', 800, 232);
});
block('hud', 'gauge.budget', 'One socket per Budget point (the frame is cap, cell, cap: the cell repeats), a gold pip per Weight point, Strain as red pips past the frame. Budget 6 with 4, Budget 6 with 8 (2 Strain), Budget 8 with 11, Budget 10 with 3 and 2 previewed. Right: procedural.', 210, (g) => {
  [[4, 6, 0], [8, 6, 0], [11, 8, 0], [3, 10, 2]].forEach(([wt, bud, prev], i) => {
    const y = 16 + i * 46;
    drawBudgetGauge(g, 30, y, 380, wt, bud, prev);
    procedural(() => drawBudgetGauge(g, 600, y, 380, wt, bud, prev));
    label(g, `Weight ${wt} of Budget ${bud}${prev ? `, +${prev}` : ''}`, 430, y + 4);
  });
});

// icon sheets
const RULE_IDS = ['draw', 'discard', 'exhaust', 'energy', 'cost', 'retain', 'innate', 'ethereal', 'jam', 'upgrade', 'graft', 'tithe', 'strain', 'budget', 'overload', 'temper'];
const INTENT_IDS = ['attack', 'multi', 'block', 'buff', 'debuff', 'heal', 'summon', 'unknown', 'stun', 'escape', 'poison', 'thread'];
function sheet(g, prefix, ids, perRow) {
  ids.forEach((id, i) => {
    const x = 70 + (i % perRow) * 138, y = 54 + Math.floor(i / perRow) * 132;
    if (!SK.icon(g, prefix + id, x, y, 72)) label(g, 'missing', x, y - 6, { align: 'center', color: '#e06a5a' });
    SK.icon(g, prefix + id, x + 58, y - 14, 32); SK.icon(g, prefix + id, x + 56, y + 24, 22);
    label(g, prefix + id, x + 20, y + 44, { align: 'center', color: INK });
  });
}
block('icons', 'sheet.rules: 16 icons', 'Each at 72, 32 and 22 px with its manifest id. In the game today: draw, discard and exhaust mark the three piles in a fight (and drawPileIcon).', 290, (g) => sheet(g, 'rules.', RULE_IDS, 8));
block('icons', 'sheet.intent: 12 icons', 'Each at 72, 32 and 22 px with its manifest id. The row under them: the intent kinds of the game drawn by drawIntent (a kind without a painting keeps its glyph).', 400, (g) => {
  sheet(g, 'intent.', INTENT_IDS, 8);
  const kinds = ['attack', 'heavy', 'multi', 'sweep', 'defend', 'buff', 'debuff', 'poison', 'heal', 'summon', 'junk', 'special', 'stun', 'sleep', 'flee', 'unknown'];
  kinds.forEach((k, i) => { const x = 46 + i * 70; drawIntent(g, k, x, 328, 40, { hits: k === 'multi' ? 3 : 0, heavy: k === 'heavy' }); label(g, k, x, 356, { align: 'center', color: INTENT_ART[k] ? INK : '#e0a050' }); });
  label(g, 'the game\'s intent kinds (amber: no painted icon, the glyph stays)', 20, 380);
  ['draw', 'discard', 'exhaust'].forEach((k, i) => drawPileIcon(g, 1000 + i * 54, 300, 44, k));
});
block('title', 'bg.title_keyart', 'The title key art as built (1280 x 720 logical). The title screen draws it under the logo and the menu while the preview is on.', 560, (g) => {
  if (!SK.part(g, 'bg.title_keyart', 110, 10, 960, 540)) label(g, 'the part is not loaded', 20, 20, { color: '#e06a5a' });
});

// ---------------- page ----------------
const main = document.getElementById('main'), jump = document.getElementById('jump'), state = document.getElementById('state');
const only = Q.get('only');
const shown = BLOCKS.filter((b) => !only || b.id === only);
const seen = new Set();
for (const b of shown) {
  const sec = document.createElement('section'), h2 = document.createElement('h2'), p = document.createElement('p'), cv = document.createElement('canvas');
  h2.textContent = b.title; p.textContent = b.note; sec.append(h2, p, cv); main.append(sec); b.cv = cv; b.sec = sec;
  if (!seen.has(b.id)) { seen.add(b.id); const bt = document.createElement('button'); bt.textContent = b.id; bt.addEventListener('click', () => sec.scrollIntoView({ behavior: 'smooth', block: 'start' })); jump.append(bt); }
}
function paint() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  for (const b of shown) {
    const cssW = Math.min(W, b.cv.parentElement.clientWidth - 16), k = (cssW / W) * dpr;
    b.cv.width = Math.round(W * k); b.cv.height = Math.round(b.h * k); b.cv.style.aspectRatio = `${W} / ${b.h}`;
    const g = b.cv.getContext('2d');
    g.setTransform(k, 0, 0, k, 0, 0); g.fillStyle = backdrop; g.fillRect(0, 0, W, b.h);
    try { b.draw(g); } catch (e) { label(g, String(e && e.message ? e.message : e), 12, 12, { color: '#e06a5a', size: 13 }); }
  }
  const pr = templates.progress();
  state.textContent = templates.state === 'ready' ? `${pr.loaded} of ${pr.total} images` + (pr.failed ? `, ${pr.failed} failed` : '') : templates.state === 'none' ? 'assets/ui not found' : 'loading';
  state.dataset.ready = templates.state === 'ready' && pr.total > 0 && pr.loaded === pr.total ? '1' : '0';
}
document.getElementById('bg').addEventListener('click', () => { backdrop = backdrop === '#191411' ? '#5a5650' : '#191411'; paint(); });
window.addEventListener('resize', paint);
// the parts arrive one by one: paint again whenever the loader has something new (its version counts every arrival)
let ver = -1, quiet = 0;
function watch() {
  templates.ensure();
  if (ver !== templates.ver) { ver = templates.ver; quiet = 0; paint(); ver = templates.ver; } else quiet++;
  if (quiet < 600) requestAnimationFrame(watch);
}
watch();
