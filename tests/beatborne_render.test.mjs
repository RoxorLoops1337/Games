// BEATBORNE -- rendering, layout and reach.
//
// The logic suite can pass on a game nobody can see. This one drives the real
// draw path at five device shapes with a canvas context that reports back, and
// it fails on the three things that actually go wrong in a canvas game:
// a NaN coordinate (draws nothing, silently), a recipe that paints nothing at
// all, and anything the player has to touch that is off the stage or too small.
import { load, ok, eq, between, done } from './beatborne_lib.mjs';

const BB = load();

/* A context that watches. Every numeric argument is checked for NaN, because a
   single NaN makes the whole path vanish with no error anywhere. */
function watchCtx() {
  const stat = { fill: 0, stroke: 0, text: 0, nan: [], gradient: 0, ops: 0 };
  const noop = () => {};
  const check = (name, args) => {
    stat.ops++;
    for (let i = 0; i < args.length; i++) {
      const v = args[i];
      if (typeof v === 'number' && !Number.isFinite(v)) stat.nan.push(name + ' arg' + i + '=' + v);
    }
  };
  const handler = {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'createLinearGradient' || k === 'createRadialGradient') {
        return (...a) => { check(k, a); stat.gradient++; return { addColorStop: (...b) => check('addColorStop', b) }; };
      }
      if (k === 'measureText') return s => ({ width: String(s).length * 6 });
      if (k === 'fill') return (...a) => { check(k, a); stat.fill++; };
      if (k === 'stroke') return (...a) => { check(k, a); stat.stroke++; };
      if (k === 'fillText' || k === 'strokeText') return (...a) => { check(k, a.slice(1)); stat.text++; };
      return (...a) => { check(k, a); };
    },
    set(t, k, v) {
      if (typeof v === 'number' && !Number.isFinite(v)) stat.nan.push('set ' + k + '=' + v);
      t[k] = v; return true;
    },
  };
  const ctx = new Proxy({ canvas: { width: 960, height: 540 }, stat }, handler);
  return { ctx, stat };
}

const SHAPES = [
  ['iphone 14 landscape', 844, 390],
  ['pixel landscape', 915, 412],
  ['tall phone 20:9', 2400, 1080],
  ['ipad landscape', 1024, 768],
  ['small phone', 800, 360],
];
// the same width fitCanvas would compute for a viewport
const widthFor = (vw, vh) => Math.max(880, Math.min(1500, Math.round(540 * (vw / vh))));

/* --------------------------------------------------- every recipe paints */
{
  for (const name of Object.keys(BB.ART)) {
    const { ctx, stat } = watchCtx();
    BB.drawUnit(ctx, name, '#ff2e88', 78, 1.7);
    ok(stat.fill + stat.stroke > 1, 'recipe ' + name + ' actually paints something');
    eq(stat.nan.length, 0, 'recipe ' + name + ' has no NaN: ' + stat.nan.slice(0, 3).join(', '));
  }
  // and at the size it is really seen at on a phone board
  for (const name of Object.keys(BB.ART)) {
    const { ctx, stat } = watchCtx();
    BB.drawUnit(ctx, name, '#2ee6d6', 44, 0);
    eq(stat.nan.length, 0, 'recipe ' + name + ' survives 44 units');
  }
  // an unknown recipe must fall back, never throw -- art is graceful everywhere
  const { ctx } = watchCtx();
  BB.drawUnit(ctx, 'no_such_recipe', '#fff', 60, 0);
  ok(true, 'an unknown recipe falls back instead of throwing');
  done('recipes');
}

/* ------------------------------------------------------ every card face */
{
  for (const c of BB.CREW) {
    const { ctx, stat } = watchCtx();
    BB.drawCard(ctx, 10, 10, 96, 128, { k: 'x', id: c.id, cost: c.cost, plus: 0 }, '');
    ok(stat.fill > 3, c.id + ' card face paints');
    ok(stat.text > 2, c.id + ' card face has its numbers on it');
    eq(stat.nan.length, 0, c.id + ' card face has no NaN: ' + stat.nan.slice(0, 3).join(', '));
  }
  // a card whose id no longer exists must not take the hand down with it
  const { ctx } = watchCtx();
  BB.drawCard(ctx, 0, 0, 96, 128, { k: 'x', id: 'gone', cost: 1, plus: 0 }, '');
  ok(true, 'a card with a dead id draws nothing rather than throwing');
  done('card faces');
}

/* ------------------------------------------- the whole screen, five shapes */
{
  for (const [name, vw, vh] of SHAPES) {
    const W = widthFor(vw, vh);
    BB.setScreen(W, 540);
    const { ctx, stat } = watchCtx();
    BB.mountTest({ width: W, height: 540, getBoundingClientRect: () => ({ left: 0, top: 0, width: W, height: 540 }) }, ctx);
    BB.newRun(3);
    const S = BB.startFight();
    BB.G.scr = 'run';
    // a board with something on it, mid-fight, mid-drop, with effects flying
    BB.playCard(S, 0, 0, 0); BB.playCard(S, 0, 1, 1); BB.playCard(S, 0, 2, 0);
    S.crowd = 82; S.drop = 3;
    for (let i = 0; i < 6; i++) BB.beatStep(S, null);
    BB.G.shake = 6; BB.G.flash = 0.5;
    BB.render();
    ok(stat.ops > 200, name + ': the frame actually draws (' + stat.ops + ' ops)');
    eq(stat.nan.length, 0, name + ': no NaN in the frame -- ' + stat.nan.slice(0, 4).join(', '));

    // and the title screen, which draws a different path entirely
    BB.G.scr = 'title';
    const t2 = watchCtx();
    BB.mountTest({ width: W, height: 540 }, t2.ctx);
    BB.render();
    eq(t2.stat.nan.length, 0, name + ': no NaN on the title screen');
    ok(t2.stat.ops > 40, name + ': the title screen draws');
  }
  done('frames');
}

/* ------------------------------------------- nothing off stage, nothing tiny */
{
  const MIN_TOUCH = 40;
  for (const [name, vw, vh] of SHAPES) {
    const W = widthFor(vw, vh);
    BB.setScreen(W, 540);
    const L = BB.layout();
    eq(L.W, W, name + ': layout uses the fitted width');

    // every board slot, both sides
    for (const side of ['us', 'them']) {
      for (let r = 0; r < BB.ROWS; r++) for (let c = 0; c < BB.COLS; c++) {
        const s = L.slot(side, c, r);
        ok(s.x - s.w / 2 >= 0, name + ': ' + side + ' slot ' + c + ',' + r + ' left edge is on stage (' + Math.round(s.x - s.w / 2) + ')');
        ok(s.x + s.w / 2 <= L.W, name + ': ' + side + ' slot ' + c + ',' + r + ' right edge is on stage');
        ok(s.y <= L.H, name + ': ' + side + ' slot ' + c + ',' + r + ' sits above the bottom');
        ok(s.w >= MIN_TOUCH && s.h >= MIN_TOUCH, name + ': slot is big enough to hit (' + s.w + 'x' + s.h + ')');
      }
    }
    // the hand, at its widest
    for (const n of [1, 3, 5, 8]) {
      for (let i = 0; i < n; i++) {
        const r = L.handRect(i, n);
        ok(r.x >= 0, name + ': hand card ' + i + '/' + n + ' left edge is on stage (' + Math.round(r.x) + ')');
        ok(r.x + r.w <= L.W, name + ': hand card ' + i + '/' + n + ' right edge is on stage');
        ok(r.y + r.h <= L.H, name + ': hand card ' + i + '/' + n + ' fits above the bottom (' + Math.round(r.y + r.h) + ' of ' + L.H + ')');
        ok(r.w >= MIN_TOUCH, name + ': hand card is wide enough to hit');
      }
    }
    // the HUD and the crowd meter
    ok(L.crowd.x >= 12 && L.crowd.x + L.crowd.w <= L.W - 12, name + ': the crowd meter is inset from both edges');
    ok(L.board.y1 < L.hand.y, name + ': the board does not overlap the hand');
    ok(L.beat.y > L.board.y1 - 20 && L.beat.y < L.hand.y, name + ': the beat rail sits between the board and the hand');
  }
  done('reach');
}

/* -------------------------------------------------------- the DOM screens */
{
  BB.newRun(9);
  BB.G.run.charms = ['preamp', 'goldmic'];
  BB.rollOffer(); BB.rollShop();
  for (const scr of ['title', 'how', 'collection', 'map', 'deck', 'reward', 'shop', 'purge', 'over', 'win']) {
    BB.G.scr = scr;
    const html = BB.screenHTML();
    ok(typeof html === 'string' && html.length > 40, scr + ' screen renders markup (' + html.length + ' chars)');
    ok(html.indexOf('undefined') < 0, scr + ' screen has no undefined in it');
    ok(html.indexOf('NaN') < 0, scr + ' screen has no NaN in it');
    ok((html.match(/</g) || []).length === (html.match(/>/g) || []).length, scr + ' screen tags balance');
  }
  // the run screen deliberately draws nothing in the DOM -- the canvas has it
  BB.G.scr = 'run';
  eq(BB.screenHTML(), '', 'the fight screen is canvas only');
  done('screens');
}

/* ------------------------------------------------- the stylesheet's promises */
{
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../beatborne/index.html', import.meta.url), 'utf8');
  ok(/\.btn\{[^}]*min-height:44px/.test(css.replace(/\s+/g, '')) || /min-height:44px/.test(css),
    'buttons carry the 44px minimum touch height');
  ok(/viewport-fit=cover/.test(css), 'the viewport opts into the safe area');
  ok(/safe-area-inset/.test(css), 'and something actually reads the safe insets');
  ok(/user-scalable=no/.test(css), 'pinch zoom is off, because this is a game not a page');
  ok(!/<img/i.test(css), 'the game loads no images -- every pixel is drawn');
  ok(!/\.(png|jpg|jpeg|gif|webp|mp3|ogg|wav)["'\)]/i.test(css), 'and references no asset files at all');
  done('shell');
}

console.log('beatborne render: all suites green');
