// HUD grid gate: the real combat screen with 1..6 enemies x 0..10 cards (plus long status lists, 12 relics, 3 potions)
// must register zero overlapping HUD rects, nothing out of bounds, nothing in the reserved top-right zone, text >= 14 px.
import assert from 'node:assert/strict';
import { makeApp, frames } from './graftwork_lib.mjs';
import * as RUN from '../graftwork/engine/run.js';
import * as audio from '../graftwork/ui/audio.js';
import { ENEMIES, RELICS, POTIONS, STATUSES } from '../graftwork/data/index.js';
import combat from '../graftwork/ui/combat.js';
import * as L from '../graftwork/ui/combat_layout.js';
import { keywordsIn, KEYWORDS, explainNumber, renderTip, drawCardText } from '../graftwork/ui/tooltips.js';
import { cardSpec } from '../graftwork/engine/cards.js';
import { cardLines } from '../graftwork/engine/text.js';

const normals = Object.values(ENEMIES).filter((e) => e.act === 1 && e.kind === 'normal').map((e) => e.id);
const longNames = normals.slice().sort((a, b) => ENEMIES[b].name.length - ENEMIES[a].name.length);
const fails = [], warns = new Set();
const foreign = (id) => /^(hand_|seam|preview|end_confirm|pause|fs|fullscreen|cannot)/.test(id); // owned by other builders: warn, do not fail

async function scene({ n, hand, relics = 0, potions = 0, statuses = 0, hover = null }) {
  const run = RUN.newRun({ hero: 'marrow', seed: 'lay' + n + hand });
  run.phase = 'combat';
  run.pending = { kind: 'combat', fightKind: 'normal', enemies: longNames.slice(0, n) };
  if (relics) run.relics = Object.keys(RELICS).slice(0, relics);
  if (potions) run.potions = Object.keys(POTIONS).slice(0, potions);
  const flow = { RUN, route() {}, openDeck() {}, openSettings() {} };
  const app = await makeApp({ run, audio, flow, meta: { settings: { colorblind: true } } });
  const texts = [];
  const orig = app.text;
  app.text = (str, x, y, o = {}) => { texts.push({ str: String(str), x, y, o }); return orig(str, x, y, o); };
  app.register('combat', combat);
  app.go('combat', { run });
  frames(app, 200);
  const st = combat.api().state(), c = st.c;
  // set the hand to exactly `hand` cards
  const pool = [...c.hand, ...c.drawPile, ...c.discard];
  c.hand.length = 0; c.drawPile.length = 0; c.discard.length = 0;
  pool.forEach((w, i) => (i < hand ? c.hand : c.drawPile).push(w));
  st.idleSynced = false;
  if (statuses) {
    const ids = Object.keys(STATUSES).slice(0, statuses);
    for (const e of c.enemies.slice(0, 1)) for (const s of ids) { e.st[s] = 2; st.edBy.get(e.uid).st[s] = 2; }
    for (const s of ids) { c.player.st[s] = 3; st.P.st[s] = 3; }
  }
  frames(app, 90);
  if (hover === 'enemy') { const ed = st.eds[0]; app.mouse.x = ed.x; app.mouse.y = L.ENEMY_FOOT - ed.h / 2; }
  texts.length = 0;
  frames(app, 12);
  return { app, st, texts, c };
}

function check(label, { app, st, texts }) {
  const all = app.layout.getAll();
  const ovAll = app.layout.findOverlaps().filter((o) => !(o.a.startsWith('hand_') && o.b.startsWith('hand_')));
  for (const o of ovAll) if (foreign(o.a) || foreign(o.b)) warns.add(`${o.a} x ${o.b}`);
  const ov = ovAll.filter((o) => !foreign(o.a) && !foreign(o.b));
  const oob = app.layout.findOutOfBounds();
  if (ov.length) fails.push(`${label} overlaps ${JSON.stringify(ov.slice(0, 4))}`);
  if (oob.length) fails.push(`${label} out of bounds ${oob.slice(0, 5)}`);
  const R = L.RESERVED_TR;
  for (const r of all) if (r.layer === 'hud' && !/pause|fullscreen|^fs/.test(r.id) && r.x < R.x + R.w && r.x + r.w > R.x && r.y < R.y + R.h && r.y + r.h > R.y) fails.push(`${label} ${r.id} enters the reserved top-right zone`);
  // enemy groups stay inside the lane, text rects fit their slot
  for (const ed of st.eds) {
    if (!ed.visible || ed.e.dead) continue;
    const g = all.filter((r) => r.group === 'en' + ed.id), left = ed.x - ed.sw / 2 - 1, right = ed.x + ed.sw / 2 + 1;
    for (const r of g) if (r.x < left - 1 || r.x + r.w > right + 1) fails.push(`${label} ${r.id} wider than its slot (${Math.round(r.x)}..${Math.round(r.x + r.w)} vs ${Math.round(left)}..${Math.round(right)})`);
    if (ed.sw < 110) fails.push(`${label} slot < 110`);
  }
  const skip = all.filter((r) => /^(seam|hand_|preview)/.test(r.id));
  for (const t of texts) {
    if (skip.some((r) => t.x >= r.x - 2 && t.x <= r.x + r.w + 2 && t.y >= r.y - 2 && t.y <= r.y + r.h + 2)) continue;
    const sz = (t.o.size || 18) * (t.o.fixed ? 1 : app.textScale);
    if (sz < 14 && t.str.trim() && t.str !== 'Click to dismiss' && !t.o.decor && t.y > 0) fails.push(`${label} text under 14px: "${t.str}" ${sz}px`);
  }
}

for (let n = 1; n <= 6; n++) for (const hand of [0, 1, 5, 7, 10]) {
  const s = await scene({ n, hand });
  check(`n=${n} hand=${hand}`, s);
}
check('long statuses', await scene({ n: 3, hand: 5, statuses: 14 }));
check('12 relics', await scene({ n: 2, hand: 5, relics: 12 }));
check('3 potions', await scene({ n: 4, hand: 6, potions: 3 }));
check('enemy hover', await scene({ n: 3, hand: 5, hover: 'enemy' }));

// glossary and explanations
assert.ok(['Block', 'Vulnerable', 'Weak', 'Frail', 'Burn', 'Bleed', 'Poison', 'Brittle', 'Tithe', 'Strain', 'Backfire', 'Overload', 'Shatter', 'Temper', 'Echo', 'Exhaust', 'Retain', 'Innate', 'Ethereal', 'Thread', 'Knot', 'Cut', 'Weight', 'Budget', 'Resonance'].every((k) => KEYWORDS[k] && KEYWORDS[k].glyph && KEYWORDS[k].color && KEYWORDS[k].text));
assert.deepEqual(keywordsIn(['Deal 6 damage. Apply 2 Vulnerable.', 'Exhaust.']), ['Vulnerable', 'Exhaust']);
const run = RUN.newRun({ hero: 'marrow', seed: 'x' });
const inst = run.deck.find((d) => /strike/i.test(d.id)) || run.deck[0];
const spec = cardSpec(inst);
const why = explainNumber(spec, { player: { st: { strength: 3 } } }, { target: { st: { vulnerable: 2 } } });
if (spec.fx.some((o) => o.op === 'dmg')) assert.match(why[0], /Base \d+, \+3 Strength, x1\.5 Vulnerable = \d+/, why[0]);
assert.ok(cardLines(spec).length > 0);

if (warns.size) console.log('WARN (other owners):', [...warns].join('; '));
if (fails.length) { console.log([...new Set(fails)].slice(0, 40).join('\n')); console.log(`${fails.length} layout failures`); process.exit(1); }
console.log('graftwork_ui_combat_layout ok');
