// Batch 11, 07-cards: late counter cards (Heart Ward, Honey Jar), keyboard card lock (L then a number), pick burst, short phone card layout.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const B = await import(join(root, 'cards_b10.js'));
const I = await import(join(root, 'card_icons.js'));
const U = await import(join(root, 'cards_ui.js'));
const html = readFileSync(join(root, 'index.html'), 'utf8'), mainJs = readFileSync(join(root, 'main.js'), 'utf8');
const tick = (g, n = 1) => { for (let i = 0; i < n; i++) sim.step(g, 1 / 60, { mx: 0 }); };
const skinStage = (skin, min) => { let n = sim.SKINS.indexOf(skin) + 1; while (n < min || sim.isBossStage(n)) n += 10; return n; };

// ---- counter cards
for (const [id, skin, min] of [['hwd', 'love', 41], ['hny', 'mighty', 22]]) {
  const p = sim.PASSIVES.find(u => u.id === id);
  assert.ok(p && p.skin === skin && p.minStage === min && p.vals.length >= 4 && p.cap === 100, id + ' is a species card');
  assert.ok(I.COUNTERS[id] && I.COUNTERS[id].skin === skin && I.kindLabel({ id }) === 'COUNTER');
  const svg = decodeURIComponent(I.capIconURL(id)); assert.ok(svg.includes('<svg') && !/—/.test(svg));
  const nums = [...svg.matchAll(/(?<![#\w])(?:M|L|H|V|Q|q|h|v|l)\s?(-?[\d.]+)/g)].map(m => Math.abs(+m[1])); assert.ok(nums.every(n => n <= 20), id + ' stays inside the frame');
  assert.ok(I.synergyHint({ ups: {}, weap: {} }, { id, kind: 'passive', lvl: 0, max: 4, isNew: true }).startsWith('Beats the'));
  assert.ok(!/—/.test(p.fmt(25) + p.desc + p.name));
}
assert.equal(U.passiveStat({ ups: {}, val: {}, stage: 45 }, { kind: 'passive', id: 'hwd', gain: 25, name: 'Heart Ward' }), 'Heart ward: 100% → 75%');
// only the right species is offered the card, and only from its stage
const offered = (skin, stage) => {
  const g = sim.createGame({ seed: 5, stage }); g.skin = skin; g.level = 6; g.pending = 1; g.rerolls = 500; tick(g); assert.equal(g.phase, 'levelup'); const seen = new Set();
  for (let i = 0; i < 160; i++) { for (const c of g.choices) seen.add(c.id); sim.reroll(g); } return seen;
};
const s41 = skinStage('love', 41);
assert.ok(offered('love', s41).has('hwd') && !offered('love', s41).has('hny'), 'love stage 41+ offers Heart Ward');
assert.ok(!offered('love', skinStage('love', 22)).has('hwd'), 'no Heart Ward before the late trait');
assert.ok(!offered('disco', skinStage('disco', 41)).has('hwd'));
assert.ok(offered('mighty', skinStage('mighty', 22)).has('hny'));
// Heart Ward: the Sweetheart ward on the two cells behind the face shrinks and is gone at 100%
const wardTime = v => {
  const g = sim.createGame({ seed: 4, stage: s41 }), sn = g.snakes[0]; if (v) { g.ups.hwd = 1; g.val = { hwd: v }; }
  tick(g, 5); sn.loveT = 0.01; let n = 0, started = false;
  for (let i = 0; i < 60 * 4; i++) { tick(g, 1); if (sn.cue > 0) started = true; if (sn.segs[1].warded) n++; if (started && sn.loveT < 5) break; }
  return n;
};
const w0 = wardTime(0), w50 = wardTime(50), w100 = wardTime(100);
assert.ok(w0 > w50 && w50 > w100, `ward frames shrink with Heart Ward: ${w0} > ${w50} > ${w100}`);
assert.equal(w100, 0, 'a full Heart Ward leaves no ward behind');
// Honey Jar: Iron Hide slows bite again (the multiplier walks from the shrug back to the plain slow)
{
  const slowed = v => { const g = sim.createGame({ seed: 4, stage: skinStage('mighty', 41) }), sn = g.snakes[0]; if (v) { g.ups.hny = 1; g.val = { hny: v }; } sn.slow = 1; const t1 = sn.tail; tick(g, 30); return sn.tail - t1; };
  const a = slowed(0), b = slowed(50), c = slowed(100);
  assert.ok(a > b && b > c, `Honey Jar slows the Iron Hide snake: ${a} > ${b} > ${c}`);
}

// ---- keyboard lock
const fakeCards = n => { const cl = new Set(); const kids = Array.from({ length: n }, (_, i) => ({ querySelector: q => (q === '.lockb' ? { dataset: { i } } : null) })); return { children: kids, classList: { add: c => cl.add(c), remove: c => cl.delete(c), has: c => cl.has(c) } }; };
{
  const cards = fakeCards(3), t0 = Date.now();
  assert.equal(B.lockKey({ key: '2' }, cards, 3, t0), null, 'a number alone is not ours (it picks)');
  assert.deepEqual(B.lockKey({ key: 'l' }, cards, 3, t0), { armed: true }); assert.ok(cards.classList.has('lockarm') && B.lockArmed());
  assert.deepEqual(B.lockKey({ key: '2' }, cards, 3, t0 + 500), { i: 1 }, 'L then 2 flips the lock on card 2');
  assert.ok(!cards.classList.has('lockarm') && !B.lockArmed(), 'the armed state ends after the number');
  B.lockKey({ key: 'L' }, cards, 3, t0); assert.equal(B.lockKey({ key: '3' }, cards, 3, t0 + 2600), null, 'the arm times out after 2.5 seconds, the number then picks');
  B.lockKey({ key: 'l' }, cards, 3, t0); assert.equal(B.lockKey({ key: 'x' }, cards, 3, t0 + 10), null); assert.ok(!B.lockArmed(), 'any other key disarms');
  assert.deepEqual(B.lockKey({ key: 'l' }, cards, 0, t0), { miss: true }, 'no refreshes left: nothing to lock');
  assert.equal(B.lockKey({ key: 'l', ctrlKey: true }, cards, 3, t0), null, 'Ctrl+L is the browser\'s');
  B.lockKey({ key: 'l' }, cards, 3, t0); assert.deepEqual(B.lockKey({ key: '9' }, cards, 3, t0 + 5), { miss: true }, 'a number with no card swallows the pick');
}
// the lock is a real control: not aria-hidden, labelled, with a pressed state and a key hint
{
  B.lockState.i = -1; const h = B.lockHTML(1);
  assert.ok(!/<span class="lockb[^>]*aria-hidden/.test(h), 'lock is exposed to screen readers');
  assert.ok(h.includes('role="button"') && h.includes('tabindex="0"') && h.includes('aria-pressed="false"') && h.includes('L, then 2'));
  B.lockState.i = 1; assert.ok(B.lockHTML(1).includes('aria-pressed="true"') && B.lockHTML(1).includes('Unlock card 2')); B.lockState.i = -1;
}
assert.ok(/lockKey\(e, \$\('cards'\), g\.rerolls\)/.test(mainJs) && mainJs.indexOf('lockKey(e,') < mainJs.indexOf("'123'.includes(e.key)"), 'the lock key runs before the pick keys');

// ---- pick burst, slow harness: fake document, fake timers, every spark and the ring accounted for
{
  const made = [], timers = []; const realST = globalThis.setTimeout, realDoc = globalThis.document;
  globalThis.setTimeout = (f, ms) => { timers.push([f, ms]); return timers.length; };
  const el = () => ({ style: {}, attrs: {}, innerHTML: '', removed: false, className: '', setAttribute(k, v) { this.attrs[k] = v; }, remove() { this.removed = true; } });
  const ic = { classList: { cl: new Set(), remove(c) { this.cl.delete(c); }, add(c) { this.cl.add(c); } }, offsetWidth: 1, getBoundingClientRect: () => ({ left: 100, top: 200, width: 60, height: 60 }) };
  globalThis.document = { createElement: () => { const e = el(); made.push(e); return e; }, body: { appendChild() {} } };
  try {
    for (const rn of [0, 3, 5]) {
      made.length = 0; timers.length = 0; ic.classList.cl.clear();
      const n = B.pickBurst({ querySelector: () => ic }, '#ffb04d', rn), box = made[0];
      assert.equal(n, 8 + 2 * rn, 'spark count grows with rarity');
      assert.ok(box.style.cssText.includes('left:130px') && box.style.cssText.includes('top:230px') && box.style.cssText.includes('--pc:#ffb04d'), 'centred on the icon');
      assert.equal((box.innerHTML.match(/<s /g) || []).length, n); assert.ok(box.innerHTML.startsWith('<u></u>'), 'ring first');
      const reach = [...box.innerHTML.matchAll(/--dx:(-?\d+)px;--dy:(-?\d+)px/g)].map(m => Math.hypot(+m[1], +m[2]));
      assert.ok(reach.every(r => r >= 40 && r <= 80), 'sparks fly 46 to 78 px out'); assert.equal(box.attrs['aria-hidden'], 'true');
      assert.ok(ic.classList.cl.has('ant'), 'the icon squashes'); assert.ok(timers.some(([, ms]) => ms === 700), 'the layer is removed after 700 ms');
      assert.equal(box.removed, false); timers.find(([, ms]) => ms === 700)[0](); assert.equal(box.removed, true);
    }
  } finally { globalThis.setTimeout = realST; globalThis.document = realDoc; }
}
assert.ok(/@keyframes pburs\{from\{[^}]*\}to\{transform:translate\(var\(--dx\),var\(--dy\)\)/.test(html), 'sparks animate out along their own vector');
assert.ok(/\.pbur\{display:none\}/.test(html), 'reduced motion hides the burst');

// ---- short phones: one name line, link and better marks stay clear of the pips, a gap before Refresh
const css = html.slice(html.indexOf('/* @css:07-cards round 11 */'), html.indexOf('/* end @css:07-cards round 11 */'));
assert.ok(css.length > 500, 'round 11 css block exists');
assert.ok(/@media \(max-height:700px\)\{[^]*\.card\.pick \.nm\{flex-wrap:nowrap/.test(css) && /\.nt\{[^}]*text-overflow:ellipsis/.test(css), 'name and rarity stay on one line');
assert.ok(/\.card\.pick\.linked \.pips\{max-width:52%/.test(css) && /\.card\.pick \.pips\{flex-wrap:nowrap\}/.test(css), 'pips never wrap into a second row');
assert.ok(/#levelup \.lvrow\{margin-top:8px\}/.test(css), 'cards clear the Refresh button');
assert.ok(/focus-visible/.test(css) && /lockarm/.test(css) && !/—/.test(css));
