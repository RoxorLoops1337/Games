// A SURVEY, not a test: it asserts nothing. It opens every screen at two window
// sizes and asks one measurable question of everything on them, because a shot
// only shows you where you aimed it. 164 found a real fault by measuring the DOM
// after the pixels had lied; this asks all ten screens at once.
//
//   node tools/emberkin/survey.mjs            # overflow: text past its own box
//   node tools/emberkin/survey.mjs targets    # touch: how big, and how close
//
// OVERFLOW (165) walked 1901 elements and found two, neither of which any shot
// had shown: a dex cell's VERDANT+GLOOM chips 8px over, and the Prism chest's
// odds 13px over — only that chest, only near 980px, because it has the dearest
// price and so the narrowest description column. Both were rows told not to wrap
// and given nowhere to go.
//
// TARGETS (166) measures every tappable thing against a 44px thumb, and what it
// measures is NOT the border box — it is the region where a tap still resolves
// to the element, found by walking outward from the centre and asking the
// browser's own hit test. Padding, a ::after spacer and a sibling painted on top
// all move that number and none of them move the rect.
//
// Size is only half of it: two targets can each clear 44px and still sit close
// enough that one fingertip covers both, which a size check cannot see at all.
// So it also reports centre-to-centre distance, and asks of every target what a
// tap at its own centre actually hits.
//
// First run found the back chip at 8px on eight screens, the fight's four
// action buttons at 24, and the profile's two at 18.
//
// The tappable set is not a guess. The game binds exactly these: `[data-i]`
// inside #screen and `.menu .row` and `.back` and `.abtn` (the delegated
// document click handler), `.cardel` in the hand (pointerdown), `#btns .rbtn`
// (bindHold), and the title's `[data-act]`. If that list changes in
// index.html it must change here, or this reports clean about the wrong things.
import pw from 'playwright-core';
const { chromium } = pw;

const MODE = (process.argv[2] || 'overflow').toLowerCase();
if (!['overflow', 'targets'].includes(MODE)) {
  console.error(`unknown mode "${MODE}" — try: overflow, targets`);
  process.exit(1);
}

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

// The hand and the two action buttons are the most-tapped things in the game and
// they live on no screen, so a screen walk never sees them. Targets mode adds
// the fight.
const TARGET_SETUPS = Object.assign({
  // `battleMsg` is the intro line, and it holds the screen until dismissed —
  // shot.mjs clears it in every battle scene for the same reason. Without it the
  // hand is never dealt, and the survey walked the fight finding two buttons and
  // no cards: a screen that reports "nothing wrong here" because nothing was
  // there. This is why the per-screen counts are printed.
  battle: `EK.G.mapId = 'emberwood';
    EK.startBattle({ foe: EK.mkMon('kindlark', 12), wild: true });
    EK.G.battleMsg = null;
    for (let i = 0; i < 300; i++) EK.step(.05);`,
}, SETUPS);

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const rows = [];
const per = [];
let seenTotal = 0;
// Targets are a phone question. A 30px button is fine under a mouse pointer and
// a hazard under a thumb, so measuring the desktop layout against 44px would
// produce a page of findings that are not faults — the fastest way to teach
// yourself to stop reading the output.
const SIZES = MODE === 'targets'
  ? [['phone', 390, 760, true]]
  : [['desktop', 980, 1000, false], ['phone', 390, 760, true]];
const SCREENS = MODE === 'targets' ? TARGET_SETUPS : SETUPS;
for (const [size, w, h, touch] of SIZES) {
  for (const [name, open] of Object.entries(SCREENS)) {
    const page = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1,
      hasTouch: touch, isMobile: touch });
    await page.goto('file:///home/user/Games/emberkin/index.html');
    await page.waitForFunction(() => !!window.EK);
    // Past the title the same way a player gets past it — `shot.mjs` does this
    // for the same reason. Driving `takeStarter` from outside starts the game
    // without ever hiding the title, and the title is a full-screen flex layer
    // that stays laid out underneath everything: targets mode's first run
    // reported "New journey" as a live 145x38 button on all eleven screens,
    // and `elementFromPoint` confirmed a tap there really would have hit it.
    // The phantom was mine, not the game's.
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button,.btn')].find((e) => /journey/i.test(e.textContent));
      if (b) b.click();
    });
    await page.waitForTimeout(400);
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
    const bad = MODE === 'targets' ? await page.evaluate(() => {
      const MIN = 44;
      // Exactly what index.html binds — see the header. A selector list that
      // drifts from the handlers reports clean about the wrong elements.
      const TAPPABLE = '#screen [data-i], #screen .back, .menu .row, .abtn,'
        + ' #hand .cardel, #btns .rbtn, #title [data-act]';
      const out = [];
      const live = [];
      let walked = 0;
      for (const el of document.querySelectorAll(TAPPABLE)) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        // A target scrolled out of view is not there to be hit — but the bound
        // is the SCROLLER, not the window. On a phone `#screen` is a 310px-tall
        // panel holding 1004px of dex, so a cell scrolled out of it still
        // reports a rect at y=500, inside a 760px window, where a tap lands on
        // the stage behind. Checking against `innerHeight` therefore called 21
        // perfectly ordinary list rows unreachable. Clip against every
        // scrolling ancestor and the window, then ask.
        let vx0 = 0, vy0 = 0, vx1 = innerWidth, vy1 = innerHeight;
        for (let a = el.parentElement; a; a = a.parentElement) {
          const acs = getComputedStyle(a);
          if (!/auto|scroll|hidden|clip/.test(acs.overflowX + acs.overflowY)) continue;
          const ar = a.getBoundingClientRect();
          vx0 = Math.max(vx0, ar.left); vy0 = Math.max(vy0, ar.top);
          vx1 = Math.min(vx1, ar.right); vy1 = Math.min(vy1, ar.bottom);
        }
        // Clip the target to what is actually showing. A row straddling the
        // panel edge is tappable on the half you can see, so the hit test must
        // aim at the VISIBLE centre — testing the full centre put one party row
        // exactly on the boundary and called it covered. A row more than half
        // gone is one you would scroll to before aiming at, so it is skipped
        // rather than judged. Size is still measured on the FULL rect: how big
        // a row is is a design property, and a sliver at the current scroll
        // position is not evidence about it.
        const vis = { left: Math.max(r.left, vx0), top: Math.max(r.top, vy0),
          right: Math.min(r.right, vx1), bottom: Math.min(r.bottom, vy1) };
        const visArea = Math.max(0, vis.right - vis.left) * Math.max(0, vis.bottom - vis.top);
        if (visArea < r.width * r.height * 0.5) continue;
        walked++;
        // How big a target is cannot be read off one that is half scrolled out
        // of its panel: the last party row measured 30px tall because the probe
        // walked off the panel edge, not because the row is small. Reachability
        // and proximity still apply — those are about right now.
        const whole = visArea > r.width * r.height - 1;
        live.push({ el, r, whole, cx: (vis.left + vis.right) / 2, cy: (vis.top + vis.bottom) / 2 });
      }
      const label = (el) => el.tagName.toLowerCase()
        + (String(el.className) ? '.' + String(el.className).trim().split(/\s+/).slice(0, 2).join('.') : '');
      const say = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 18);
      for (let i = 0; i < live.length; i++) {
        const { el, r, whole, cx, cy } = live[i];
        // What would a tap at this target's own centre actually hit? This is
        // the only question here with no heuristic in it — it is the browser's
        // own hit test — and it is what exposed the survey's phantom title
        // button. A target covered at its centre is not small, it is absent.
        // `at === el` is a hit and a DESCENDANT is a hit (the click bubbles up
        // from the dex cell's canvas to the cell). An ANCESTOR is a MISS —
        // landing on #screen does not close the screen — and counting it as a
        // hit made the back chip measure 44px tall when its box is 10px, which
        // is the instrument agreeing with a fix that had not been made yet.
        const at = document.elementFromPoint(cx, cy);
        const reaches = at && (at === el || el.contains(at));
        if (!reaches) {
          out.push({ kind: 'covered', px: 0, tag: label(el),
            text: `${say(el) || '—'}  tap lands on ${at ? label(at) : 'nothing'}` });
          continue;
        }
        // The rect is a PROXY. What a thumb actually gets is the region where a
        // tap still resolves to this element, and that is not the border box:
        // padding counts, a ::after spacer counts, and a sibling painted on top
        // takes it away again. So walk outward from the centre in each
        // direction and ask the browser's own hit test where the target stops.
        // A fix made with a pseudo-element would be invisible to a rect check —
        // measuring the proxy would have made one of the two repairs below
        // unverifiable, and an unverifiable repair is a guess.
        // 1px steps, and the centre pixel counts. A 44px-tall box spans 44
        // integer rows, so its centre reaches 22 one way and 21 the other:
        // stepping in 2s reported 40 for a box that is exactly 44, and a
        // threshold nudged down to swallow that would be the 164 mistake in a
        // new costume. Measure precisely; leave 44 alone.
        const reach = (dx, dy) => {
          let far = 0;
          for (let d = 1; d <= 48; d++) {
            const h = document.elementFromPoint(cx + dx * d, cy + dy * d);
            if (!h || !(h === el || el.contains(h))) break;
            far = d;
          }
          return far;
        };
        const hw = reach(-1, 0) + reach(1, 0) + 1, hh = reach(0, -1) + reach(0, 1) + 1;
        const small = Math.min(hw, hh);
        if (whole && small < MIN) {
          out.push({ kind: 'size', px: Math.round(small), tag: label(el),
            text: `hit ${Math.round(hw)}x${Math.round(hh)}  (box ${Math.round(r.width)}x${Math.round(r.height)})  ${say(el)}` });
        }
        // The finger is a circle, not a point: if two targets' centres are
        // closer than one fingertip, a single tap covers both and which one
        // fires is a coin toss. Two 44px buttons touching pass a size check and
        // fail this one, which is the whole reason it is here.
        let near = null;
        for (let j = 0; j < live.length; j++) {
          if (j === i) continue;
          const o = live[j].r;
          // Nested targets (a row inside a row) are one thing to the finger.
          if (el.contains(live[j].el) || live[j].el.contains(el)) continue;
          const d = Math.hypot(cx - live[j].cx, cy - live[j].cy);
          if (!near || d < near.d) near = { d, el: live[j].el };
        }
        if (near && near.d < MIN) {
          out.push({ kind: 'near', px: Math.round(near.d), tag: label(el),
            self: `${label(el)} ${say(el)}`, other: `${label(near.el)} ${say(near.el)}`,
            text: `${say(el) || '—'}  <-> ${label(near.el)} ${say(near.el) || '—'}` });
        }
      }
      return { out, walked };
    }) : await page.evaluate(() => {
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
    per.push([size, name, bad.walked]);
    for (const x of bad.out) rows.push({ size, name, ...x });
    await page.close();
  }
}
await b.close();

const N = Object.keys(SCREENS).length;
// A clean run has two explanations and only one of them is good, so the
// coverage is printed whether anything was found or not — twice in 165 this
// survey reported nothing because it had quietly stopped asking.
const coverage = MODE === 'targets'
  ? `${seenTotal} tappable elements across ${N} screens at 390x760`
  : `${seenTotal} visible elements across ${N} screens x ${SIZES.length} sizes`;

if (MODE === 'targets') {
  // Smallest and closest first: the top of this list is where a thumb goes
  // wrong, and the bottom is where it merely might.
  const size = rows.filter((r) => r.kind === 'size').sort((a, c) => a.px - c.px);
  const near = [];
  const pairSeen = new Set();
  for (const r of rows.filter((x) => x.kind === 'near').sort((a, c) => a.px - c.px)) {
    // A is near B and B is near A. One hazard, one line — and the key has to
    // name BOTH ends, because a key built from one end plus the other's text
    // differs depending on which end you start from and dedupes nothing.
    const k = [r.name, r.px, [r.self, r.other].sort().join('|')].join('/');
    if (pairSeen.has(k)) continue;
    pairSeen.add(k); near.push(r);
  }
  const covered = rows.filter((r) => r.kind === 'covered');
  if (!size.length && !near.length && !covered.length) {
    console.log(`clean: ${coverage}, all reachable, none under 44px, none within a fingertip`);
  }
  if (covered.length) {
    console.log(`a tap at their own centre misses them (${covered.length}):`);
    console.log('screen    element                          what the tap hits');
    for (const r of covered) console.log(`${r.name.padEnd(9)} ${r.tag.padEnd(32)} ${r.text}`);
    if (size.length || near.length) console.log('');
  }
  if (size.length) {
    console.log(`under 44px (${size.length}):`);
    console.log('screen    small  element                          size / text');
    for (const r of size) console.log(`${r.name.padEnd(9)} ${String(r.px).padStart(5)}  ${r.tag.padEnd(32)} ${r.text}`);
  }
  if (near.length) {
    console.log(`${size.length ? '\n' : ''}centres within one fingertip (${near.length}):`);
    console.log('screen    apart  element                          neighbour');
    for (const r of near) console.log(`${r.name.padEnd(9)} ${String(r.px).padStart(5)}  ${r.tag.padEnd(32)} ${r.text}`);
  }
  // A screen that contributed nothing is the silent failure this survey has
  // already made twice: a setup that threw, a selector that matched nothing.
  // The per-screen count is the difference between "asked and found none" and
  // "never asked".
  console.log(`\nwalked ${coverage}`);
  console.log('  ' + per.map(([, n, k]) => `${n} ${k}`).join('   '));
  const empty = per.filter(([, , k]) => !k).map(([, n]) => n);
  if (empty.length) console.log(`  !! no targets found at all on: ${empty.join(', ')}`);
} else if (!rows.length) {
  console.log(`clean: ${coverage}, none crossing a card edge`);
} else {
  console.log('size     screen    over  past-edge  element                          text');
  for (const r of rows) {
    console.log(`${(r.size||'').padEnd(8)} ${(r.name||'').padEnd(9)} ${String(r.over ?? '').padStart(4)}  ${String(r.escapes ?? '').padStart(9)}  ${(r.tag ? r.tag + '.' + r.cls : r.el).padEnd(36)} ${r.text || r.note || ''}`);
  }
  console.log(`\n${rows.length} finding(s) out of ${coverage}`);
}
