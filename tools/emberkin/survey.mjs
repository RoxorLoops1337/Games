// A SURVEY, not a test: it asserts nothing. Walk every panel at two window
// sizes and report any text wider than the box it is drawn in with nothing
// above it clipping — text that is, in other words, painting over its
// neighbour. 164 found the box card this way after a screenshot had pointed at
// the wrong element entirely; a shot shows you where you aimed it, and this
// asks all ten screens at once.
//
//   node tools/emberkin/survey.mjs
//
// First real run (165) walked 1901 elements and found two, neither of which any
// shot had shown: a dex cell's VERDANT+GLOOM chips 8px over, and the Prism
// chest's odds 13px over — only that chest, only near 980px, because it has the
// dearest price and so the narrowest description column. Both were rows told
// not to wrap and given nowhere to go.
import pw from 'playwright-core';
const { chromium } = pw;

const SETUPS = {
  party:   `EK.openScreen('party')`,
  box:     `EK.openScreen('box')`,
  dex:     `EK.openScreen('dex')`,
  deck:    `EK.openScreen('deck')`,
  bag:     `EK.openScreen('bag')`,
  shop:    `EK.openScreen('shop', { shop: 1 })`,
  chests:  `EK.openScreen('chests')`,
  profile: `EK.openScreen('profile', { mon: EK.G.party[0] })`,
  reward:  `EK.openScreen('reward', { offer: EK.rollReward(null) || ['edge','guard','focus'] })`,
  menu:    `EK.pressKey('x'); EK.step(.02); EK.releaseKey('x'); EK.fired.clear();`,
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const rows = [];
let seenTotal = 0;
for (const [size, w, h, touch] of [['desktop', 980, 1000, false], ['phone', 390, 760, true]]) {
  for (const [name, open] of Object.entries(SETUPS)) {
    const page = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1,
      hasTouch: touch, isMobile: touch });
    await page.goto('file:///home/user/Games/emberkin/index.html');
    await page.waitForFunction(() => !!window.EK);
    const err = await page.evaluate(`(() => {
      try {
        for (let i = 0; i < 40 && EK.G.dialogue; i++) { EK.G.dialogue.hold = 0; EK.advanceDialogue(); }
        EK.takeStarter('cindercub');
        EK.G.dialogue = null; EK.G.gotcha = null; EK.G.mode = 'world';
        EK.G.money = 500; EK.G.gems = 260;
        EK.G.party = ['pyrelynx','brookite','bramblor','gargolem','frillamb','kindlark']
          .map((id, i) => { const m = EK.mkMon(id, 22 + i * 2); m.nick = 'MMMMMMMMMMMM'; return m; });
        EK.G.box = EK.DEX_ORDER.map((id, i) => EK.mkMon(id, 12 + (i % 9) * 2));
        EK.DEX_ORDER.forEach((id) => EK.catchMon(id));
        EK.G.cards = []; EK.G.deck = []; EK.G.nextUid = 0;
        EK.CARD_IDS.slice(0, 14).forEach((id) => EK.grantCard(id, true));
        EK.G.bag = { bloomorb: 9, gleamorb: 4, prismorb: 2, salve: 9, greatsalve: 3, revive: 1, elixir: 2 };
        ${open};
        EK.renderScreen && EK.renderScreen();
        return '';
      } catch (e) { return String(e && e.message || e); }
    })()`);
    if (err) { rows.push({ size, name, el: '(setup failed)', note: err.slice(0, 60) }); await page.close(); continue; }
    await page.waitForTimeout(350);
    const bad = await page.evaluate(() => {
      const root = document.getElementById('screen') || document.body;
      const out = [];
      const seen = new Set();
      let walked = 0;
      for (const el of root.querySelectorAll('*')) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        walked++;
        // Content wider than its own box, and the box is not a scroller.
        const scrolls = cs.overflowX === 'auto' || cs.overflowX === 'scroll'
          || cs.overflowY === 'auto' || cs.overflowY === 'scroll';
        const clipped = cs.overflow === 'hidden' || cs.overflowX === 'hidden'
          || cs.textOverflow === 'ellipsis';
        // The subject is TEXT painting past an edge. A decoration with no words
        // in it is allowed to overhang on purpose — the chest's metal strap is
        // `left:-2px; right:-2px` because a strap that stops at the box is not a
        // strap — and reporting it every run only teaches you to skip the
        // output. Nothing is lost: an element whose CHILDREN overflow gets its
        // children reported on their own account.
        if (!(el.textContent || '').trim()) continue;
        const over = el.scrollWidth - el.clientWidth;
        // Overflowing TEXT does not extend an element's bounding rect — the
        // box stays at its containing width and the glyphs paint outside it.
        // So getBoundingClientRect cannot see this at all; the first version of
        // this survey "tightened" itself into asking a question whose answer is
        // always no, walked 1902 elements and reported clean with a KNOWN fault
        // in place. scrollWidth vs clientWidth is the detector. What decides
        // whether it is VISIBLE is whether anything above it clips.
        // …and the walk STOPS AT THE CARD. #screen is overflow:auto, so every
        // element in the game has a clipping ancestor and a naive walk to the
        // body disqualifies everything — the second way this survey talked
        // itself into reporting clean. What matters is whether the text is
        // caught before it paints over its own card's neighbours.
        const card = el.closest('.panel, .card, .dexcell, .item, .kinrow, .movecard');
        let clippedBy = null;
        for (let a = el; a; a = a.parentElement) {
          const acs = getComputedStyle(a);
          if (/hidden|clip/.test(acs.overflowX + acs.overflowY) || acs.textOverflow === 'ellipsis') { clippedBy = a; break; }
          if (a === card) break;
        }
        if (over > 1 && !scrolls && !clipped && !clippedBy) {
          const key = el.className + '|' + over;
          if (!seen.has(key)) {
            seen.add(key);
            out.push({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 34),
              over, escapes: 0, clipped, text: (el.textContent || '').trim().slice(0, 26) });
          }
        }
      }
      return { out, walked };
    });
    seenTotal += bad.walked;
    for (const x of bad.out) rows.push({ size, name, ...x });
    await page.close();
  }
}
await b.close();

if (!rows.length) { console.log(`clean: ${seenTotal} visible elements walked across 10 screens x 2 sizes, none crossing a card edge`); }
else {
  console.log('size     screen    over  past-edge  element                          text');
  for (const r of rows) {
    console.log(`${(r.size||'').padEnd(8)} ${(r.name||'').padEnd(9)} ${String(r.over ?? '').padStart(4)}  ${String(r.escapes ?? '').padStart(9)}  ${(r.tag ? r.tag + '.' + r.cls : r.el).padEnd(36)} ${r.text || r.note || ''}`);
  }
  console.log(`\n${rows.length} finding(s) out of ${seenTotal} elements walked`);
}
