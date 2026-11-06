// HUD grid gate: the real combat screen with 1..6 enemies x 0..10 cards (plus long status lists, 12 relics, 3 potions)
// must register zero overlapping HUD rects, nothing out of bounds, nothing in the reserved top-right zone, text >= 14 px.
import assert from 'node:assert/strict';
import { makeApp, frames } from './graftwork_lib.mjs';
import * as RUN from '../graftwork/engine/run.js';
import * as audio from '../graftwork/ui/audio.js';
import { ENEMIES, RELICS, POTIONS, STATUSES } from '../graftwork/data/index.js';
import combat from '../graftwork/ui/combat.js';
import * as L from '../graftwork/ui/combat_layout.js';
import { statusSizes } from '../graftwork/ui/combat_hud.js';
import { CARD_W, CARD_H } from '../graftwork/art/cards.js';
import { keywordsIn, KEYWORDS, explainNumber, renderTip, drawCardText } from '../graftwork/ui/tooltips.js';
import { cardSpec } from '../graftwork/engine/cards.js';
import { cardLines } from '../graftwork/engine/text.js';

const normals = Object.values(ENEMIES).filter((e) => e.act === 1 && e.kind === 'normal').map((e) => e.id);
const longNames = normals.slice().sort((a, b) => ENEMIES[b].name.length - ENEMIES[a].name.length);
const fails = [], warns = new Set();
const foreign = (id) => /^(hand_|seam|preview|end_confirm|pause|fs|fullscreen|cannot)/.test(id); // owned by other builders: warn, do not fail

async function scene({ pscale = 0, n, hand, relics = 0, potions = 0, statuses = 0, hover = null, eAll = 0, hp = 0, heroSt = null }) {
  const run = RUN.newRun({ hero: 'marrow', seed: 'lay' + n + hand });
  run.phase = 'combat';
  run.pending = { kind: 'combat', fightKind: 'normal', enemies: longNames.slice(0, n) };
  if (relics) run.relics = Object.keys(RELICS).slice(0, relics);
  if (potions) run.potions = Object.keys(POTIONS).slice(0, potions);
  const flow = { RUN, route() {}, openDeck() {}, openSettings() {} };
  const app = await makeApp({ run, audio, flow, meta: { settings: { colorblind: true } } });
  if (pscale) { // phone stage scale: the text floor inflates labels, with proportional fake metrics so fitting is meaningful
    app.scale = pscale; app.minPx = 11;
    app.ctx.measureText = (q) => { const f = String(app.ctx.font || ''), m = /(\d+(?:\.\d+)?)px/.exec(f), sz = m ? +m[1] : 16; return { width: String(q).length * sz * (/bold/.test(f) ? 0.56 : 0.52) }; };
  }
  const texts = [];
  const orig = app.text;
  app.text = (str, x, y, o = {}) => { const L = pscale && str !== '' ? app.layoutText(String(str), o) : null; texts.push({ str: String(str), x, y, o, L, w: L ? L.w : 0, h: L ? L.h : 0, al: o.align || 'left' }); return orig(str, x, y, o); };
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
  if (eAll) { // every enemy carries `eAll` statuses (the crowded 4-enemy lane)
    const ids = Object.keys(STATUSES).slice(0, eAll);
    for (const e of c.enemies) for (const sid of ids) { e.st[sid] = 2; st.edBy.get(e.uid).st[sid] = 2; }
  }
  if (heroSt) for (const sid of heroSt) { c.player.st[sid] = 2; st.P.st[sid] = 2; }
  if (hp) c.player.hp = hp;
  frames(app, 90);
  if (hover === 'hero-status') { const r = app.layout.getAll().find((q) => q.id === 'status:hero'); app.mouse.x = r.x + 14; app.mouse.y = r.y + 14; frames(app, 40); }
  if (hover === 'enemy') { const ed = st.eds[0]; app.mouse.x = ed.x; app.mouse.y = L.ENEMY_FOOT - ed.h / 2; }
  texts.length = 0;
  frames(app, 12);
  return { app, st, texts, c, pscale };
}

function check(label, { app, st, texts, pscale }) {
  if (pscale) { // phones: no label ends in an ellipsis, no two labels share pixels
    const box = (t) => ({ x: t.al === 'center' ? t.x - t.w / 2 : t.al === 'right' ? t.x - t.w : t.x, y: t.y, w: t.w, h: t.h });
    for (const t of texts) if (t.L && t.L.trunc && !t.L.soft && !t.o.decor) fails.push(`${label} truncated: "${t.str}"`);
    const named = texts.filter((t) => t.L && t.y > 0 && t.y < 720 && t.str.trim());
    for (let i = 0; i < named.length; i++) for (let j = i + 1; j < named.length; j++) {
      const a = box(named[i]), b = box(named[j]); if (named[i].str === named[j].str) continue;
      const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ix > 3 && iy > 4 && ix * iy > 0.2 * Math.min(a.w * a.h, b.w * b.h) && !/^(hand_|seam|preview)/.test('')) fails.push(`${label} text over text: "${named[i].str}" x "${named[j].str}"`);
    }
  }
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
    if (!pscale && sz < 14 && t.str.trim() && t.str !== 'Click to dismiss' && !t.o.decor && t.y > 0) fails.push(`${label} text under 14px: "${t.str}" ${sz}px`);
  }
}

for (let n = 1; n <= 6; n++) for (const hand of [0, 1, 5, 7, 10]) {
  const s = await scene({ n, hand });
  check(`n=${n} hand=${hand}`, s);
}
for (const pscale of [0.64, 0.54, 0.46]) {
  for (const [n, hand] of [[1, 5], [3, 8], [4, 5]]) check(`phone ${pscale} n=${n} hand=${hand}`, await scene({ pscale, n, hand, eAll: 3, heroSt: ['weak', 'vulnerable', 'strength'] }));
  check(`phone ${pscale} 2 enemies`, await scene({ pscale, n: 2, hand: 7, heroSt: ['weak', 'vulnerable'] }));
}
check('long statuses', await scene({ n: 3, hand: 5, statuses: 14 }));
check('12 relics', await scene({ n: 2, hand: 5, relics: 12 }));
check('3 potions', await scene({ n: 4, hand: 6, potions: 3 }));
check('enemy hover', await scene({ n: 3, hand: 5, hover: 'enemy' }));

// S3: status rows, labels, lethal chip, tip band
{
  const rects = (sc) => sc.app.layout.getAll();
  // hero statuses are at least 26 px, enemy statuses never drop under 22 even with 8 on each of 4 enemies, and no row reaches the Thread rail
  let sc = await scene({ n: 4, hand: 5, eAll: 8, heroSt: ['weak', 'vulnerable', 'strength', 'poison', 'burn', 'bleed'] });
  check('4 enemies x 8 statuses', sc);
  assert.ok(statusSizes.hero >= 26, 'hero status icons >= 26: ' + statusSizes.hero);
  for (const ed of sc.st.eds) assert.ok(statusSizes['en' + ed.id] >= 22, 'enemy status icons >= 22: ' + statusSizes['en' + ed.id]);
  for (const r of rects(sc).filter((q) => /^status:en/.test(q.id))) assert.ok(r.y + r.h <= L.SEAM.y - 2, `${r.id} ends at ${r.y + r.h}, above the Thread rail`);
  const hr = rects(sc).find((q) => q.id === 'status:hero'); assert.ok(hr && hr.y >= L.HERO_PLATE.y && hr.y + hr.h <= L.HERO_PLATE.y + L.HERO_PLATE.h, 'hero row inside the hero plate');
  // names under the icons with 3 or fewer statuses, glyph and number only with more
  sc = await scene({ n: 2, hand: 5, heroSt: ['weak', 'vulnerable'] });
  assert.ok(sc.texts.some((t) => t.str === 'Weak') && sc.texts.some((t) => t.str.startsWith('Vulnera')), 'status names shown for 2 statuses: ' + sc.texts.map((t) => t.str).join('|').slice(0, 200));
  sc = await scene({ n: 2, hand: 5, heroSt: ['weak', 'vulnerable', 'strength', 'poison'] });
  assert.ok(!sc.texts.some((t) => t.str === 'Weak'), 'no names with 4 statuses');
  check('hero 2 statuses', await scene({ n: 3, hand: 7, heroSt: ['weak', 'vulnerable', 'strength'] }));
  // lethal warning: skull chip near the HP plate only when the visible intents reach your HP
  sc = await scene({ n: 3, hand: 5, hp: 1 });
  assert.ok(rects(sc).some((q) => q.id === 'lethalChip'), 'lethal chip registered at 1 HP');
  assert.ok(sc.texts.some((t) => /^Lethal: \d+ incoming$/.test(t.str)), 'chip text');
  check('lethal chip', sc);
  sc = await scene({ n: 3, hand: 5, hp: 999 });
  assert.ok(!rects(sc).some((q) => q.id === 'lethalChip'), 'no chip at 999 HP');
  // tips for hero statuses fill the band above the hero: never the Thread rail or the hand
  sc = await scene({ n: 3, hand: 7, heroSt: ['weak', 'vulnerable'], hover: 'hero-status' });
  const tips = rects(sc).filter((q) => /^tip\d/.test(q.id)); assert.ok(tips.length, 'hero status tip drawn');
  for (const tp of tips) assert.ok(tp.y + tp.h <= L.HERO_TIP_BAND.bottom, `tip ends at ${tp.y + tp.h}, above the Thread rail and the hand`);
}

// presence: a lone enemy / duo stands bigger than a 3+ lane, 3+ keep slots that never overlap
{
  const d = (id) => ENEMIES[id];
  const one = L.enemySlots([d('leech_jar')])[0], three = L.enemySlots(['leech_jar', 'orderly', 'slime_bit'].map(d)), four = L.enemySlots(['leech_jar', 'orderly', 'slime_bit', 'stitch_rat'].map(d));
  assert.ok(one.h >= 190, 'single enemy art height ' + one.h);
  assert.ok(one.scale > 1.2, 'single Leech Jar scaled up: ' + one.scale);
  for (const sl of [three, four]) for (let i = 1; i < sl.length; i++) assert.ok(sl[i].x - sl[i].sw / 2 >= sl[i - 1].x + sl[i - 1].sw / 2 - 0.01, 'slots overlap');
  assert.ok(four[0].h <= L.ENEMY_ART_H + 1, '4+ enemies stay at the clear lane height');
  // lifted hand card: stays below the enemy lane and clear of End Turn and the energy orb at every hand slot
  const ch = CARD_H * L.HOVER_S, cw = CARD_W * L.HOVER_S;
  assert.ok(L.HOVER_Y - ch / 2 >= L.HOVER_TOP - 1 && L.HOVER_Y + ch / 2 <= L.H, 'lifted card top/bottom ' + (L.HOVER_Y - ch / 2));
  assert.ok(L.ENEMY_FOOT + 50 <= L.HOVER_TOP, 'enemy hp bar row stays above the lifted card');
  for (let n = 1; n <= 10; n++) for (let i = 0; i < n; i++) { const x = Math.max(245, Math.min(975, L.handSlot(i, n).x)); assert.ok(x + cw / 2 < L.END_BTN.x && x - cw / 2 > L.ORB.x + L.ORB.size / 2, 'lifted card clear of End Turn/orb'); }
}

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
