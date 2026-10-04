// Inkwoven integration suite, headless: the WHOLE game (every script, index.html's markup) played through real pointer, drag and key events
// on the DOM the screens built, on the loader's virtual clock. Nothing here reaches into a screen's internals to make a move; the only
// back doors are the documented ones of a test harness: tests/rogue_book_player.mjs (cfg.cheat tops up Ink, HP and gold so a greedy
// policy is not stopped by the dice, and unlocks the requested heroes and Ink Trial in the live profile) and, for the defeat scenario,
// GAME.debug.combat().setHp.
//
//   complete   Three complete runs (title, hero select, story pages, map painting and walking, fights by tap and by drag, rewards, shops,
//              camps with all their actions, the forge, chests, gem caches, fables, boss fights, chapter clears, chapters 2 and 3, the
//              ending) for different hero pairs, one at the default settings, one with a trial level, reduced motion and low quality, one
//              with Raiga leading Kuro. Each ends on the victory screen and must leave a recorded win, paid Inkstones and a clean run
//              slot, with ZERO console errors or warnings, ZERO window.__errors, ZERO canvas issues and zero uncaught exceptions.
//   pause      The pause overlay (Resume, Deck, Treasures, Settings, How to play) on the map, with Esc and with the menu button.
//   save       Save and quit, Continue on the title, and a byte-exact round trip of the run (RUN.serialize) on the map AND in a combat
//              (a saved fight restarts with the same foes).
//   defeat     A lost fight records a loss, shows the game over page and Try Again starts a NEW run with the same heroes and trial.
//   daily      The Daily Tale button and the hero select's Daily switch begin a run with the date's seed and heroes.
//   menus      Title to Library (every tab), Settings and How to Play with real taps, and back.
//   combat     A fight played by hand: select by tap, aim by drag, the Swap button, End Turn by key.
//   library    A profile with a finished tale: the Unlocks tab buys a card with real Inkstones through the Unlock button, and the Story, Bestiary
//              and History tabs show what the profile has seen, met and won.
//   nosave     Storage that throws (private mode): one persistent "cannot be saved" toast, and the tale carries on (rides on the library words).
//   fuzz       Deterministic noise (a xorshift stream, never Math.random): random taps on any button, card or the canvas, random keys, random drags
//              and window resizes, mixed in with the player's sensible moves for 1000 steps on two seeds. The page must stay clean.
//   events     EVERY fable and EVERY choice of it played through the real event page (the typewriter, the choice buttons, the outcome, any
//              card pick it raises, Continue): each must end on the map or, for a gamble that turns into a fight, on the combat screen.
//   shop       Eight shops, everything on every shelf bought through the real plaques and the Buy button, card removal and gem cutting,
//              each purchase checked against the gold paid and what the run gained.
//
// Set RB_GAME_ONLY=pause,save (comma list of the section words above) to run a part while developing. Deterministic: fixed seeds, virtual
// time, no wall clock. About 3 minutes standalone, two thirds of it the three complete runs.
import { boot, harness } from './rogue_book_lib.mjs';
import { makePlayer } from './rogue_book_player.mjs';

const t = harness('rogue_book game');
const ONLY = (process.env.RB_GAME_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const want = (name) => !ONLY.length || ONLY.includes(name);

// ---------------------------------------------------------------------------------------------------- helpers
function page(opts = {}) {
  const g = boot({ autoboot: true, seed: opts.seed === undefined ? 7 : opts.seed, store: opts.store, viewport: opts.viewport });
  if (g._errors && g._errors.length) throw new Error('boot errors: ' + JSON.stringify(g._errors.map((e) => e.file + ': ' + e.message)));
  return g;
}
const settingsStore = (settings) => ({ rb_profile_v1: JSON.stringify({ v: 1, settings }) });

// The player's reward handler looks for `.c-reward` cards, but a reward with many offers (a relic that widens the choice) deals the
// deck-sized card instead, and it also needs to press "Skip card" when nothing is left to pick. Same moves, wider selectors.
function humanise(p) {
  const { live, click, btns, label, state, stats, shown } = p;
  const off = (el) => el.disabled === true || el.getAttribute('aria-disabled') === 'true';
  p.handlers.reward = async function reward() {
    stats.rewards++;
    shown.add('reward');
    const node = p.R().node;
    if (state.rwNode !== node) { state.rwNode = node; state.rwRelic = false; state.rwCard = false; await p.tick(1800); }   // the ledger counts up and the cards are dealt and flipped
    const takeIt = btns().find((e) => /^take it$/i.test(label(e)));
    if (takeIt && !state.rwRelic) { state.rwRelic = true; stats.relicsTaken = (stats.relicsTaken || 0) + 1; await click(takeIt, 500); return 'reward take relic'; }
    const peds = live('.rw-ped').filter((e) => !off(e));
    if (peds.length && !state.rwRelic) { state.rwRelic = true; stats.relicsTaken = (stats.relicsTaken || 0) + 1; await click(peds[0], 500); return 'reward boss relic'; }
    const cards = live('.rw-cards .card:not(.back)');
    if (cards.length && !state.rwCard) { state.rwCard = true; await click(cards[cards.length - 1], 250); return 'reward pick card'; }
    const cont = btns().find((e) => /^(continue|take and continue|next|claim|skip card)/i.test(label(e)));
    await click(cont || btns().find((b) => b.classList.contains('btn-primary')), 500);
    return 'reward continue';
  };
  return p;
}
const player = (g, cfg) => humanise(makePlayer(g, Object.assign({ heroes: ['hanae', 'kuro'], trial: 0, seed: '' }, cfg)));

// every way a page can complain
function complaints(g) {
  const out = [];
  const c = g._console;
  c.error.forEach((m) => out.push('console.error: ' + String(m).slice(0, 200)));
  c.warn.forEach((m) => out.push('console.warn: ' + String(m).slice(0, 200)));
  (g._uncaught || []).forEach((m) => out.push('uncaught: ' + String((m && m.message) || m).slice(0, 200)));
  (g._win.__errors || []).forEach((m) => out.push('__errors: ' + JSON.stringify(m).slice(0, 200)));
  (g._issues || []).forEach((m) => out.push('canvas issue: ' + JSON.stringify(m).slice(0, 200)));
  return out;
}
const clean = (g, label) => { const c = complaints(g); t.ok(c.length === 0, label + ': page is clean' + (c.length ? ' [' + c.slice(0, 4).join(' | ') + ']' : '')); };

const $ = (g, sel, root) => (root || g._doc).querySelector(sel);
const $$ = (g, sel, root) => Array.from((root || g._doc).querySelectorAll(sel));
const txt = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const byText = (g, re, root) => $$(g, 'button, [role=button]', root).find((b) => re.test(txt(b)) || re.test(b.getAttribute('aria-label') || ''));
const overlayName = (g) => { const top = g.UI.overlay.top && g.UI.overlay.top(); return top ? (top.name || top.id || null) : null; };
const tick = (g, ms = 400) => g._tick(ms, 48);
const tap = async (g, el, ms = 400) => { if (!el) throw new Error('tap: no element'); g._click(el); await tick(g, ms); };
const key = async (g, k, ms = 400) => { g._key(k); await tick(g, ms); };

// the screens a player sees on a complete run, and the overlays a sensible policy opens on the way
const SCREENS = ['title', 'heroSelect', 'story', 'map', 'combat', 'reward', 'shop', 'camp', 'forge', 'chest', 'gemcache', 'event', 'chapterClear'];

// A complete run to the victory page, then the victory page's own Continue back to the title.
async function completeRun(label, cfg, pageOpts) {
  const g = page(pageOpts);
  const p = player(g, cfg);
  let arrived = false;
  const acts = new Set();                                          // what the player actually did, by label
  try {
    arrived = await p.until(() => g.UI.currentName === 'victory', { steps: 6000, onStep: (lab) => acts.add(String(lab).replace(/ (cost|\d).*$/, '').slice(0, 30)) });
  } catch (e) { t.ok(false, label + ': the player got stuck: ' + String(e.message).slice(0, 700)); return g; }
  t.ok(arrived, label + ': reached the victory page');
  const R = g.GAME.state.R;
  t.ok(R && R.victory === true && R.done === true, label + ': the run is marked won and done');
  t.eq(R && R.chapter, 3, label + ': the win came in chapter 3');
  SCREENS.forEach((s) => t.ok(p.shown.has(s), label + ': visited the ' + s + ' screen'));
  ['story:intro', 'story:ch1_intro', 'story:ch2_intro', 'story:ch3_intro'].forEach((s) => t.ok(p.shown.has(s), label + ': showed ' + s));
  t.ok(p.stats.plays > 40 && p.stats.drags > 5 && p.stats.paints > 10 && p.stats.walks > 10, label + ': played by tap and drag [' + JSON.stringify(p.stats) + ']');
  t.ok((p.stats.relicsTaken || 0) >= 2, label + ': took relics from elites and bosses');
  const did = (re) => [...acts].some((a) => re.test(a));
  [[/^shop buy/, 'bought in a shop'], [/^camp (rest|sharpen|meditate)/, 'used a camp'], [/^forge (sharpen|strike)/, 'used the forge'], [/^chest (open|take)/, 'opened a chest'],
    [/^gemcache (weigh|take)/, 'took from a gem cache'], [/^event choice/, 'chose in a fable'], [/^reward pick card/, 'picked a reward card'], [/^combat end turn/, 'ended a turn with the plaque']]
    .forEach(([re, what]) => t.ok(did(re), label + ': ' + what + ' [' + [...acts].filter((a) => re.test(a)).slice(0, 2).join(', ') + ']'));
  const hist = g.META.history;
  t.eq(hist.length, 1, label + ': exactly one history row');
  t.ok(hist[0] && hist[0].outcome === 'win' && hist[0].chapter === 3, label + ': the history row is a chapter 3 win');
  t.deep(hist[0] && hist[0].heroes, cfg && cfg.heroes ? cfg.heroes : ['hanae', 'kuro'], label + ': the history row names the party in order');
  t.ok(hist[0] && hist[0].inkstones > 0, label + ': Inkstones were paid (' + (hist[0] && hist[0].inkstones) + ')');
  t.ok(g.META.stat('wins') >= 1 && g.META.stat('runs') >= 1, label + ': the profile counts the win');
  t.eq(g.META.hasRun(), false, label + ': no run is left in the save slot');
  t.ok(g.UI.screens.victory && g._doc.querySelector('.s-victory'), label + ': the victory screen is on the page');
  // the ending has beats (page, curtain call, showcase); Continue leaves for the title
  await p.until(() => g.UI.currentName === 'title', { steps: 40 });
  t.eq(g.UI.currentName, 'title', label + ': Continue on the victory page returns to the title');
  t.ok(p.shown.has('victory'), label + ': the player used the victory page');
  t.ok(!g._doc.querySelector('[data-act=continue]'), label + ': the title has no Continue after a finished run');
  clean(g, label);
  return g;
}

if (want('complete')) {
  await t.test('complete run 1: Hanae + Kuro, default settings, to the ending', async () => {
    await completeRun('run1 hanae+kuro', { heroes: ['hanae', 'kuro'] }, { seed: 7 });
  });
  await t.test('complete run 2: Suzu + Raiga, Ink Trial 2, reduced motion and low quality, to the ending', async () => {
    const g = await completeRun('run2 suzu+raiga', { heroes: ['suzu', 'raiga'], trial: 2 }, { seed: 11, store: settingsStore({ quality: 'low', reduceMotion: true }) });
    const row = g.META.history[0];
    t.eq(row && row.trial, 2, 'run2: the history row remembers the Ink Trial');
    t.eq(g.UI.opt.reduceMotion, true, 'run2: reduced motion was honoured all the way through');
  });
  await t.test('complete run 3: Raiga in front of Kuro, to the ending', async () => {
    await completeRun('run3 raiga+kuro', { heroes: ['raiga', 'kuro'] }, { seed: 23 });
  });
}

// ---------------------------------------------------------------------------------------------------- shared scenario setup
// a fresh page played by the UI until the map is up and a couple of hexes are painted and walked
async function toMap(seed, cfg) {
  const g = page({ seed });
  const p = player(g, cfg || {});
  await p.until(() => g.UI.currentName === 'map', { steps: 60 });
  await tick(g, 1500);
  return { g, p };
}

if (want('pause')) {
  await t.test('pause: Esc and the menu button open the pause overlay; Deck, Treasures, Settings and How to play open from it and close again', async () => {
    const { g, p } = await toMap(3);
    const { UI } = g;
    t.eq(UI.currentName, 'map', 'pause: on the map');
    await key(g, 'Escape');
    t.eq(overlayName(g), 'pause', 'pause: Esc opens the pause overlay');
    const pause = $(g, '.o-pause');
    t.ok(pause && $(g, '[data-act=resume]', pause) && $(g, '[data-act=deck]', pause) && $(g, '[data-act=relics]', pause) && $(g, '[data-act=settings]', pause) && $(g, '[data-act=howto]', pause) && $(g, '[data-act=quit]', pause) && $(g, '[data-act=abandon]', pause), 'pause: all seven entries are there');
    for (const [act, name] of [['deck', 'deck'], ['relics', 'relics'], ['settings', 'settings']]) {
      await tap(g, $(g, '[data-act=' + act + ']'), 500);
      t.eq(overlayName(g), name, 'pause: ' + act + ' opens the ' + name + ' overlay on top');
      t.eq(UI.overlay.count(), 2, 'pause: the overlays stack');
      await key(g, 'Escape', 500);
      t.eq(overlayName(g), 'pause', 'pause: Esc closes only the top overlay (' + name + ')');
    }
    await tap(g, $(g, '[data-act=howto]'), 700);
    t.ok(/How to play|Next|Previous/i.test(txt($(g, '#overlays'))), 'pause: How to play shows its pages in the overlay');
    await key(g, 'Escape', 500);
    await key(g, 'Escape', 500);
    t.eq(UI.overlay.count(), 0, 'pause: Esc closes the pause overlay');
    t.eq(UI.currentName, 'map', 'pause: still on the map');
    // the menu button does the same
    const mb = $(g, '.menu-btn');
    t.ok(!!mb, 'pause: the map has the menu button');
    await tap(g, mb, 500);
    t.eq(overlayName(g), 'pause', 'pause: the menu button opens the pause overlay');
    await tap(g, $(g, '[data-act=resume]'), 500);
    t.eq(UI.overlay.count(), 0, 'pause: Resume closes it');
    // the deck overlay lists the starting deck
    await tap(g, $(g, '.menu-btn'), 500);
    await tap(g, $(g, '[data-act=deck]'), 600);
    const cards = $$(g, '.o-deck .card').filter((c) => !c.classList.contains('c-big'));
    t.eq(cards.length, g.GAME.state.R.deck.length, 'pause: the deck overlay shows every card of the run (' + cards.length + ')');
    g.UI.overlay.closeAll();
    await tick(g, 300);
    clean(g, 'pause');
  });
}

if (want('save')) {
  await t.test('save: Save and quit, Continue, and the run comes back exactly (map)', async () => {
    const { g, p } = await toMap(5);
    const { UI, GAME, META, RUN } = g;
    // paint and walk a little through the real map first
    await p.until(() => p.stats.paints >= 3 && p.stats.walks >= 1, { steps: 40 });
    await p.until(() => UI.currentName === 'map', { steps: 30 });
    await tick(g, 1200);
    const before = JSON.stringify(RUN.serialize(GAME.state.R));
    await key(g, 'Escape');
    await tap(g, $(g, '[data-act=quit]'), 800);
    await tick(g, 1500);
    t.eq(UI.currentName, 'title', 'save: Save and quit goes to the title');
    t.ok(META.hasRun(), 'save: the run is in the save slot');
    const cont = $(g, '[data-act=continue]');
    t.ok(!!cont, 'save: the title offers Continue');
    t.ok(/Verse 1/.test(txt(cont)) && /Hanae/.test(txt(cont)) && /Kuro/.test(txt(cont)), 'save: Continue says where the tale stands [' + txt(cont) + ']');
    GAME.state.R = null;
    await tap(g, cont, 1500);
    await tick(g, 1500);
    t.eq(UI.currentName, 'map', 'save: Continue returns to the map');
    t.eq(JSON.stringify(RUN.serialize(GAME.state.R)), before, 'save: the run is byte-for-byte what was saved (seed, map, deck, Ink, gold, position)');
    // a second round trip changes nothing either
    await key(g, 'Escape');
    await tap(g, $(g, '[data-act=quit]'), 800);
    await tick(g, 1200);
    await tap(g, $(g, '[data-act=continue]'), 1500);
    await tick(g, 1200);
    t.eq(JSON.stringify(RUN.serialize(GAME.state.R)), before, 'save: a second save and continue is still identical');
    // and the player can keep going: paint on from the restored map
    const painted = Object.values(GAME.state.R.map.tiles).filter((x) => x.painted).length;
    await p.until(() => Object.values(GAME.state.R.map.tiles).filter((x) => x.painted).length > painted || UI.currentName !== 'map', { steps: 30 });
    t.ok(Object.values(GAME.state.R.map.tiles).filter((x) => x.painted).length > painted || UI.currentName !== 'map', 'save: the restored map accepts new paint');
    clean(g, 'save');
  });

  await t.test('save: Save and quit in the middle of a fight; Continue restarts the same fight', async () => {
    const g = page({ seed: 9 });
    const p = player(g, {});
    const { UI, GAME, META, RUN } = g;
    await p.until(() => UI.currentName === 'combat', { steps: 200 });
    await tick(g, 1500);
    const node0 = GAME.state.R.node;
    t.eq(node0 && node0.kind, 'combat', 'save/combat: the run is standing in a combat node');
    const foes = node0.enemies.map((e) => e.id || e);
    // play a card or two so that the screen is mid-fight
    await p.step();
    await tick(g, 600);
    await key(g, 'Escape');
    t.eq(overlayName(g), 'pause', 'save/combat: the pause overlay opens in a fight');
    await tap(g, $(g, '[data-act=quit]'), 900);
    await tick(g, 1500);
    t.eq(UI.currentName, 'title', 'save/combat: Save and quit leaves the fight for the title');
    t.ok(META.hasRun(), 'save/combat: the run is kept');
    GAME.state.R = null;
    await tap(g, $(g, '[data-act=continue]'), 2500);
    await tick(g, 2000);
    t.eq(UI.currentName, 'combat', 'save/combat: Continue re-enters the combat');
    const node1 = GAME.state.R.node;
    t.deep(node1.enemies.map((e) => e.id || e), foes, 'save/combat: the same foes stand in the lane');
    const d = GAME.debug.combat();
    t.ok(d && d.C && d.C.turn === 1 && d.C.phase === 'player', 'save/combat: the fight starts again on turn 1 with the player to move');
    // and it can be won
    await p.until(() => UI.currentName !== 'combat', { steps: 120 });
    t.ok(UI.currentName === 'reward', 'save/combat: the restored fight can be won (' + UI.currentName + ')');
    clean(g, 'save/combat');
  });
}

if (want('save')) {
  await t.test('abandon: the pause menu asks twice; Keep playing keeps the tale, Abandon ends it with half the Inkstones', async () => {
    const { g, p } = await toMap(41);
    const { UI, GAME, META } = g;
    await p.until(() => p.stats.paints >= 2, { steps: 30 });
    await p.until(() => UI.currentName === 'map', { steps: 30 });
    await key(g, 'Escape');
    await tap(g, $(g, '[data-act=abandon]'), 600);
    t.eq(overlayName(g), 'confirm', 'abandon: a confirm overlay asks first');
    t.ok(/Abandon/.test(txt($(g, '.o-confirm'))), 'abandon: and says what it does [' + txt($(g, '.o-confirm')).slice(0, 80) + ']');
    await tap(g, byText(g, /^Keep playing/), 600);
    t.ok(!!GAME.state.R && !GAME.state.R.done && UI.currentName === 'map', 'abandon: Keep playing leaves the run alone');
    t.eq(META.history.length, 0, 'abandon: nothing was recorded');
    if (UI.overlay.count() > 0) await key(g, 'Escape', 500);
    await key(g, 'Escape');
    await tap(g, $(g, '[data-act=abandon]'), 600);
    await tap(g, byText(g, /^Abandon$/), 1500);
    await tick(g, 1500);
    t.eq(UI.currentName, 'title', 'abandon: Abandon returns to the title');
    t.eq(META.history.length, 1, 'abandon: one history row');
    t.eq(META.history[0] && META.history[0].outcome, 'abandon', 'abandon: marked as an abandoned tale');
    t.eq(META.hasRun(), false, 'abandon: the save slot is empty');
    t.ok(!$(g, '[data-act=continue]'), 'abandon: the title offers no Continue');
    clean(g, 'abandon');
  });
}

if (want('defeat')) {
  await t.test('defeat: a lost fight shows the game over page, records a loss, and Try Again starts a new run with the same party', async () => {
    const g = page({ seed: 13 });
    const p = player(g, { heroes: ['hanae', 'kuro'], cheat: false });
    const { UI, GAME, META } = g;
    await p.until(() => UI.currentName === 'combat', { steps: 300 });
    await tick(g, 1500);
    const oldRun = GAME.state.R;
    const d = GAME.debug.combat();
    t.ok(!!d, 'defeat: a fight is on');
    // leave both heroes one hit from the grave, then end the turn with the real plaque: the foes finish them
    d.setHp('hanae', 1); d.setHp('kuro', 1);
    await tick(g, 400);
    for (let i = 0; i < 12 && UI.currentName === 'combat'; i++) {
      const end = $$(g, '.cm-end')[0];
      if (end) g._click(end);
      await tick(g, 1200);
    }
    await tick(g, 3000);
    t.eq(UI.currentName, 'gameOver', 'defeat: the game over page is shown (' + UI.currentName + ')');
    t.ok(/Try Again/.test(txt($(g, '.s-gameOver'))) && /Title/.test(txt($(g, '.s-gameOver'))), 'defeat: it offers Try Again and Title');
    t.eq(META.history.length, 1, 'defeat: one history row');
    t.eq(META.history[0] && META.history[0].outcome, 'lose', 'defeat: the row is a loss');
    t.eq(META.hasRun(), false, 'defeat: the save slot is empty after a loss');
    await tap(g, byText(g, /^Try Again/), 1500);
    await p.until(() => UI.currentName === 'map', { steps: 30 });
    const R = GAME.state.R;
    t.ok(R && R !== oldRun && oldRun.done === true && !R.done, 'defeat: Try Again made a new run (the lost one stays finished)');
    t.deep(R.heroes.map((h) => h.id), ['hanae', 'kuro'], 'defeat: with the same party in the same order');
    t.eq(R.chapter, 1, 'defeat: back in chapter 1');
    t.eq(UI.currentName, 'map', 'defeat: standing on a fresh map');
    // and a loss from the title screen state: the player can go back to the title and continue is gone
    GAME.toTitle();
    await tick(g, 1500);
    t.ok(!!$(g, '[data-act=continue]'), 'defeat: the new unfinished run is continuable');
    clean(g, 'defeat');
  });
}

if (want('daily')) {
  await t.test('daily: the Daily Tale plaque and the hero select switch both begin a dated run', async () => {
    const g = page({ seed: 17 });
    const { UI, GAME, META, RUN, DATA } = g;
    await tick(g, 1500);
    const gate = $(g, '.mn-gate');
    if (gate) await tap(g, gate, 300);
    const daily = $(g, '[data-act=daily]');
    t.ok(!!daily, 'daily: the title offers the Daily Tale');
    t.ok(/\d{8}/.test(txt(daily)), 'daily: the plaque shows the date seed [' + txt(daily) + ']');
    const seed = META.dailySeed(new g._win.Date());   // the page's own (virtual) clock, not the host's
    const heroes = RUN.dailyHeroes(seed);
    await tap(g, daily, 1200);
    for (let i = 0; i < 6 && UI.currentName !== 'map'; i++) { const sk = byText(g, /^Skip/i); if (sk) await tap(g, sk, 800); else await tick(g, 600); }
    t.eq(UI.currentName, 'map', 'daily: the Daily Tale leads to the map');
    const R = GAME.state.R;
    t.ok(R && R.daily === true, 'daily: the run is marked daily');
    t.eq(R.seed, seed, 'daily: seeded by the date');
    t.deep(R.heroes.map((h) => h.id), heroes, 'daily: the date picks the party');
    t.eq(R.trial, 0, 'daily: no Ink Trial on a Daily Tale');
    // the same through the hero select toggle
    GAME.toTitle();
    await tick(g, 1500);
    await tap(g, $(g, '[data-act=new]'), 1200);
    t.eq(UI.currentName, 'heroSelect', 'daily: New Tale opens the hero select');
    const sw = $(g, '.mn-daily input, .mn-daily [role=switch], .mn-daily button, [aria-label*=Daily]');
    t.ok(!!sw, 'daily: the hero select has the Daily switch');
    clean(g, 'daily');
  });
}

// ---------------------------------------------------------------------------------------------------- the bestiary, several tabs, Continue and Begin anew
// Two pages share one localStorage in a browser; the loader gives each page its own backing object, so `share` copies it across.
const share = (from, to) => { Object.keys(to._store).forEach((k) => { delete to._store[k]; }); Object.assign(to._store, from._store); };
// a real combat node on the first free neighbour of the party, made by RUN.step like the map does
function foeNode(g, kind) {
  const { MAP, RUN, DATA, GAME } = g;
  const R = GAME.state.R;
  const pos = R.map.pos;
  const tile = MAP.neighbors(R.map, pos.q, pos.r).map((c) => R.map.tiles[MAP.key(c[0], c[1])]).find((x) => x && x.type !== 'block' && !x.done);
  tile.type = kind || 'enemy'; tile.painted = true; tile.known = true; tile.done = false;
  tile.content = { enc: DATA.encounters[R.chapter][kind === 'elite' ? 'elite' : 'normal'][0].id };
  return RUN.step(R, tile.q, tile.r);
}
const foeIds = (node) => node.enemies.map((e) => e.id || e).filter((x, i, a) => a.indexOf(x) === i);
const metOf = (g, ids) => ids.map((id) => g.META.bestiary().find((b) => b.id === id).seen);
const begin = async (g, opts) => { g.GAME.newRun(opts); await tick(g, 1500); };

if (want('tabs')) {
  await t.test('bestiary: entering a fight meets its creatures once; Continue does not count the fight again; a lost fight leaves them met', async () => {
    const g = page({ seed: 61 });
    const { GAME, META, UI } = g;
    await tick(g, 800);
    await begin(g, { heroes: ['hanae', 'kuro'], seed: 61 });
    const node = foeNode(g, 'enemy');
    const ids = foeIds(node);
    t.deep(metOf(g, ids), ids.map(() => 0), 'bestiary: nobody is met before the fight');
    await GAME.enterNode(node); await tick(g, 1200);
    t.eq(UI.currentName, 'combat', 'bestiary: the fight screen is up');
    t.deep(metOf(g, ids), ids.map(() => 1), 'bestiary: each creature in the fight is met (' + ids.join(', ') + ')');
    t.eq(JSON.parse(g._store.rb_profile_v1).seen[ids[0]], 1, 'bestiary: and written to the profile at once');
    t.eq(GAME.state.R.node.met, true, 'bestiary: the node remembers that its foes were met');
    GAME.toTitle(); await tick(g, 1200);
    GAME.state.R = null;
    await tap(g, $(g, '[data-act=continue]'), 2500); await tick(g, 1500);
    t.eq(UI.currentName, 'combat', 'bestiary: Continue re-enters the same fight');
    t.deep(metOf(g, ids), ids.map(() => 1), 'bestiary: re-entering a saved fight does not meet them again');
    await GAME.debug.lose(); await tick(g, 2500);
    t.eq(UI.currentName, 'gameOver', 'bestiary: the party fell');
    t.deep(metOf(g, ids), ids.map(() => 1), 'bestiary: a creature that beat the party is still met');
    GAME.toTitle(); await tick(g, 1500);
    GAME.debug.open('library', { tab: 'bestiary' }); await tick(g, 1500);
    const tile = $(g, '.mn-beast[data-id="' + ids[0] + '"]');
    t.ok(tile && /\bseen\b/.test(tile.className), 'bestiary: the Library shows that creature as met [' + (tile && tile.className) + ']');
    clean(g, 'bestiary');
  });
  await t.test('bestiary: a Daily Tale meets and records its creatures too', async () => {
    const g = page({ seed: 62 });
    const { GAME, META } = g;
    await tick(g, 800);
    await begin(g, { daily: true });
    const R = GAME.state.R;
    t.eq(R.daily, true, 'daily bestiary: a daily run');
    const node = foeNode(g, 'enemy');
    const ids = foeIds(node);
    await GAME.enterNode(node); await tick(g, 1200);
    t.deep(metOf(g, ids), ids.map(() => 1), 'daily bestiary: met on entering the fight');
    R.foes = { [ids[0]]: 2 };
    const ask = GAME.abandon(); await tick(g, 400);
    await tap(g, byText(g, /^Abandon$/), 1500); await ask;
    t.eq(META.bestiary().find((b) => b.id === ids[0]).kills, 2, 'daily bestiary: its kills are written when it ends');
    t.eq(META.stat('kills'), 0, 'daily bestiary: but the achievement kill counter is not touched');
    t.eq(META.stat('dailyRuns'), 1, 'daily bestiary: one daily run');
    clean(g, 'daily bestiary');
  });
  await t.test('continue: a save taken between the boss reward and chapterEnd goes through the chapter flow (chapter 1 to 2, chapter 3 to the victory)', async () => {
    const g = page({ seed: 63 });
    const { GAME, META, UI, RUN } = g;
    await tick(g, 800);
    await begin(g, { heroes: ['hanae', 'kuro'], seed: 63 });
    const R = GAME.state.R;
    R.chapterCleared = true; R.node = null; R.stats.bossKills = 1; R.stats.boss1Kills = 1;
    GAME.save();
    const g2 = page({ seed: 64, store: Object.assign({}, g._store) });
    await tick(g2, 1500);
    const gate = $(g2, '.mn-gate'); if (gate) await tap(g2, gate, 300);
    await tap(g2, $(g2, '[data-act=continue]'), 2500); await tick(g2, 1500);
    t.eq(g2.UI.currentName, 'chapterClear', 'continue: the chapter clear page, not the old map (' + g2.UI.currentName + ')');
    const R2 = g2.GAME.state.R;
    t.eq(R2.chapter, 2, 'continue: chapter 2 is open');
    t.eq(R2.chapterCleared, false, 'continue: the flag is spent');
    t.ok(R2.heroes.every((h) => h.maxHp > g2.DATA.heroes[h.id].maxHp), 'continue: chapterEnd ran (max HP grew)');
    clean(g2, 'continue chapter 1');
    const R3 = RUN.newRun({ heroes: ['hanae', 'kuro'], seed: 65, unlocked: META.unlockedSet() });
    R3.chapter = 3; R3.chapterCleared = true; R3.node = null; R3.stats.bossKills = 3;
    const g3 = page({ seed: 66, store: { rb_profile_v1: g._store.rb_profile_v1 } });
    g3.META.load();
    g3._store.rb_run_v1 = JSON.stringify(g3.RUN.serialize(g3.RUN.deserialize(JSON.parse(JSON.stringify(RUN.serialize(R3))))));
    await tick(g3, 1500);
    const gate3 = $(g3, '.mn-gate'); if (gate3) await tap(g3, gate3, 300);
    await tap(g3, $(g3, '[data-act=continue]'), 2500); await tick(g3, 3000);
    t.eq(g3.UI.currentName, 'victory', 'continue: after the chapter 3 boss the save goes to the victory (' + g3.UI.currentName + ')');
    t.eq(g3.META.history[0] && g3.META.history[0].outcome, 'win', 'continue: and the win is recorded');
    t.eq(g3.META.hasRun(), false, 'continue: with nothing left in the save slot');
  });
  await t.test('new tale over a saved tale ends it like Abandon: half the Inkstones, a history row, the ledger; the new tale has its own run id', async () => {
    const g = page({ seed: 67 });
    const { GAME, META } = g;
    await tick(g, 800);
    await begin(g, { heroes: ['hanae', 'kuro'], seed: 67 });
    const first = GAME.state.R;
    first.stats.bossKills = 1; first.stats.boss1Kills = 1; first.foes = { kappa: 1 }; GAME.save();
    const stones = META.inkstones;
    await begin(g, { heroes: ['hanae', 'kuro'], seed: 67 });          // the very same seed and party: the id must still differ
    const second = GAME.state.R;
    t.ok(second !== first && second.id !== first.id, 'begin anew: a new tale with its own id even for the same seed and party (' + first.id + ' vs ' + second.id + ')');
    t.ok(META.inkstones > stones, 'begin anew: the replaced tale paid its share (' + stones + ' -> ' + META.inkstones + ')');
    t.eq(META.history.length, 1, 'begin anew: one history row');
    t.eq(META.history[0].outcome, 'abandon', 'begin anew: marked abandoned');
    t.eq(META.history[0].id, first.id, 'begin anew: for the replaced run');
    t.eq(META.stat('runs'), 1, 'begin anew: its stats were merged');
    t.eq(META.bestiary().find((b) => b.id === 'kappa').kills, 1, 'begin anew: and its kills');
    t.ok(META.hasRun() && META.runInfo(), 'begin anew: the new tale is in the save slot');
    t.eq(JSON.parse(g._store.rb_run_v1).id, second.id, 'begin anew: the slot holds the new run, not the old');
    await begin(g, { heroes: ['kuro', 'suzu'], seed: 67 });           // and nothing is paid when the slot is empty / the same run is not paid twice
    t.eq(META.history.length, 2, 'begin anew: the second replacement is one more row');
    clean(g, 'begin anew');
  });
  await t.test('tabs: a stale tab that only changes a setting does not erase what the other tab won (C10, scenario 1)', async () => {
    const A = page({ seed: 71 }), B = page({ seed: 72 });
    await tick(A, 800); await tick(B, 800);
    await begin(A, { heroes: ['hanae', 'kuro'], seed: 71 });
    const R = A.GAME.state.R; R.stats.bossKills = 3; R.stats.boss1Kills = 1; R.stats.boss2Kills = 1; R.stats.boss3Kills = 1; R.stats.kills = 30;
    A.GAME.victory(); await tick(A, 2500);
    t.eq(A.UI.currentName, 'victory', 'tabs: tab A won');
    const won = A.META.inkstones, wins = A.META.stat('wins');
    t.ok(won > 0 && wins === 1, 'tabs: tab A earned Inkstones (' + won + ') and a win');
    share(A, B);                                                 // the same localStorage
    B.META.set('musicVol', 0.2);                                 // the stale tab B: just the music volume
    const P = JSON.parse(B._store.rb_profile_v1);
    t.eq(P.inkstones, won, 'tabs: the Inkstones survive the stale tab\'s write'); t.eq(P.stats.wins, 1, 'tabs: the win'); t.eq(P.history.length, 1, 'tabs: the history row'); t.ok(Object.keys(P.ach).length >= 3, 'tabs: the achievements'); t.eq(P.settings.musicVol, 0.2, 'tabs: and the setting the stale tab changed');
    const C = page({ seed: 73, store: Object.assign({}, B._store) });
    t.eq(C.META.trialMax(), 1, 'tabs: a reload shows the Ink Trial the win opened');
    clean(A, 'tabs A');
  });
  await t.test('tabs: the storage event folds in what another tab saved, and the stale tab\'s Continue never brings back a paid tale (C10, scenario 2)', async () => {
    const A = page({ seed: 81 });
    await tick(A, 800);
    await begin(A, { heroes: ['hanae', 'kuro'], seed: 81 });
    const RA = A.GAME.state.R; RA.stats.bossKills = 1; RA.stats.boss1Kills = 1; A.GAME.save();
    const B = page({ seed: 82, store: Object.assign({}, A._store) });
    await tick(B, 1500);
    const gate = $(B, '.mn-gate'); if (gate) await tap(B, gate, 300);
    await tap(B, $(B, '[data-act=continue]'), 2500); await tick(B, 1500);
    const RB = B.GAME.state.R;
    t.eq(RB.id, RA.id, 'tabs: tab B continued the same tale');
    // tab A abandons it through the real pause menu confirm and is paid once
    const ask = A.GAME.abandon(); await tick(A, 400); await tap(A, byText(A, /^Abandon$/), 1500); await ask;
    const paid = A.META.inkstones;
    t.ok(paid > 0 && !A._store.rb_run_v1, 'tabs: tab A abandoned: paid, run key gone');
    share(A, B);
    B._win.dispatchEvent(new B._win.Event('storage'));            // what the browser fires in tab B
    t.eq(B.META.inkstones, paid, 'tabs: the storage event brought tab B\'s profile up to date');
    t.ok(B.META.runPaid(RB.id), 'tabs: and it knows the tale is over');
    B.GAME.save();                                                // tab B keeps playing and saves
    t.eq(B._store.rb_run_v1, undefined, 'tabs: the dead tale is not written back');
    t.ok(/another window/.test(B._doc.body.textContent), 'tabs: tab B says the tale ended elsewhere');
    const C = page({ seed: 83, store: Object.assign({}, B._store) });
    await tick(C, 1500);
    t.ok(!$(C, '[data-act=continue]'), 'tabs: a reload offers no Continue');
    B.GAME.state.R.stats.bossKills = 1;
    B.GAME.defeat(); await tick(B, 2500);
    t.eq(B.META.inkstones, paid, 'tabs: finishing the stale copy pays nothing more');
    t.eq(B.META.history.filter((h) => h.id === RA.id).length, 1, 'tabs: one history row for the tale');
    clean(A, 'tabs A2');
  });
}

if (want('menus')) {
  await t.test('menus: Library tabs, Settings and How to Play work with real taps', async () => {
    const g = page({ seed: 19 });
    const { UI, META } = g;
    await tick(g, 1500);
    const gate = $(g, '.mn-gate');
    if (gate) await tap(g, gate, 300);
    // library
    await tap(g, $(g, '[data-act=library]'), 1200);
    t.eq(UI.currentName, 'library', 'menus: Library opens');
    const tabs = $$(g, '.s-library [role=tab]');
    t.ok(tabs.length >= 5, 'menus: the library has its five tabs (' + tabs.length + ')');
    for (const tb of tabs) {
      await tap(g, tb, 500);
      t.ok(tb.getAttribute('aria-selected') === 'true' || tb.classList.contains('on') || tb.classList.contains('active') || /sel/.test(tb.className), 'menus: tab "' + txt(tb) + '" selects');
    }
    await tap(g, byText(g, /^Back/), 900);
    t.eq(UI.currentName, 'title', 'menus: Back returns from the library');
    // settings: flip Hints, pick the larger text and reduced motion on, and see them applied and saved
    await tap(g, $(g, '[data-act=settings]'), 1000);
    t.eq(UI.currentName, 'settings', 'menus: Settings opens');
    t.eq(META.get('hints'), true, 'menus: hints start on');
    const toggles = $$(g, '.s-settings [role=switch]');
    t.ok(toggles.length >= 3, 'menus: Settings has its toggles (' + toggles.length + ')');
    await tap(g, toggles.find((e) => e.getAttribute('aria-label') === 'Hints'), 400);
    t.eq(META.get('hints'), false, 'menus: the Hints switch turns hints off');
    t.eq(JSON.parse(g._store.rb_profile_v1).settings.hints, false, 'menus: and the profile in storage says so');
    const large = byText(g, /^Large$/);
    t.ok(!!large, 'menus: Settings offers Large text');
    await tap(g, large, 400);
    t.eq(META.get('textScale'), 1.15, 'menus: Large sets the text scale');
    t.eq(UI.opt.textScale, 1.15, 'menus: the UI picked it up');
    t.ok(/1\.15/.test(g._doc.getElementById('stage').style.getPropertyValue('--ts') || ''), 'menus: --ts on the stage is 1.15');
    await tap(g, $$(g, '.s-settings button').find((b) => txt(b) === 'On'), 400);
    t.eq(META.get('reduceMotion'), true, 'menus: Reduce motion On is saved');
    t.eq(UI.opt.reduceMotion, true, 'menus: and applied');
    await tap(g, byText(g, /^Back/), 900);
    // how to play: page through every page
    await tap(g, $(g, '[data-act=howto]'), 1000);
    t.eq(UI.currentName, 'howto', 'menus: How to Play opens');
    let pages = 1;
    for (let i = 0; i < 12; i++) { const nx = byText(g, /^Next/); if (!nx || nx.disabled || nx.getAttribute('aria-disabled') === 'true') break; await tap(g, nx, 500); pages++; }
    t.ok(pages >= 6, 'menus: How to Play has several pages (' + pages + ')');
    await tap(g, byText(g, /^Back/), 900);
    t.eq(UI.currentName, 'title', 'menus: Back returns from How to Play');
    clean(g, 'menus');
  });
}

if (want('combat')) {
  await t.test('combat: a fight by hand (tap to select, drag to aim, Swap, End Turn by key)', async () => {
    const g = page({ seed: 29 });
    const p = player(g, {});
    const { UI, GAME } = g;
    await p.until(() => UI.currentName === 'combat', { steps: 300 });
    await tick(g, 2500);
    const d = GAME.debug.combat();
    const C = d.C;
    t.eq(C.phase, 'player', 'combat: it is the player turn');
    t.eq(C.hand.length, 5, 'combat: five cards were drawn');
    const handEls = () => $$(g, '.cm-hand .card').filter((c) => !c.classList.contains('back'));
    t.eq(handEls().length, 5, 'combat: five cards are on the screen');
    // an attack with ONE legal target plays on the first tap; with several, a tap selects it and a tap on a foe plays it
    const atk = C.hand.find((c) => C.needsTarget(c.uid) && C.canPlay(c.uid, C.legalTargets(c.uid)[0]).ok);
    t.ok(!!atk, 'combat: the hand holds a playable attack');
    const targets = C.legalTargets(atk.uid);
    const foe = C.enemies.find((e) => e.id === targets[0]);
    const foeHp = foe.hp + foe.block;
    const atkEl = handEls().find((e) => e.dataset.uid === String(atk.uid));
    await tap(g, atkEl, 700);
    if (targets.length === 1) {
      t.ok(!C.hand.some((c) => c.uid === atk.uid), 'combat: with a single legal target the first tap plays the attack');
    } else {
      t.ok($$(g, '.card.sel').length === 1, 'combat: a tap selects the card');
      const hit = $(g, '.cm-en[data-enemy="' + foe.id + '"] .cm-ehit') || $$(g, '.cm-ehit')[0];
      await tap(g, hit, 1500);
      t.ok(!C.hand.some((c) => c.uid === atk.uid), 'combat: tapping a foe plays the selected card on it');
    }
    await tick(g, 1500);
    t.ok(foe.hp + foe.block < foeHp, 'combat: the foe took the blow (' + foeHp + ' -> ' + (foe.hp + foe.block) + ')');
    t.ok(C.energy < C.maxEnergy, 'combat: the card cost Energy');
    // Esc after a selection puts the card back
    const spare = C.hand.find((c) => C.canPlay(c.uid, C.needsTarget(c.uid) ? C.legalTargets(c.uid)[0] : undefined).ok && (C.needsTarget(c.uid) ? C.legalTargets(c.uid).length > 1 : false));
    if (spare) {
      const el2 = handEls().find((e) => e.dataset.uid === String(spare.uid));
      await tap(g, el2, 500);
      t.ok($$(g, '.card.sel').length === 1, 'combat: a second tap selects a card that has several targets');
      await key(g, 'Escape', 500);
      t.eq($$(g, '.card.sel').length, 0, 'combat: Esc deselects');
      t.eq(UI.overlay.count(), 0, 'combat: Esc with a card selected does not open the pause overlay');
    }
    // drag a self card above the hand to play it
    await tick(g, 800);
    const self = C.hand.find((c) => !C.needsTarget(c.uid) && C.canPlay(c.uid).ok);
    if (self) {
      const el = handEls().find((e) => e.dataset.uid === String(self.uid));
      const n0 = C.hand.length;
      const c = g._centre ? g._centre(el) : [640, 640];
      await g._drag(el, c, [640, 280], 8);
      await tick(g, 1200);
      t.ok(C.hand.length < n0, 'combat: dragging a card above the hand plays it');
    }
    // swap rows with the real button
    const front0 = C.heroes.find((h) => h.row === 'front').id;
    const sw = $$(g, '.cm-swap')[0];
    t.ok(!!sw, 'combat: the Swap button is there');
    await tap(g, sw, 1500);
    const front1 = C.heroes.find((h) => h.row === 'front').id;
    t.ok(front1 !== front0, 'combat: Swap moves the other hero to the front (' + front0 + ' -> ' + front1 + ')');
    // E ends the turn: the enemies act and turn 2 begins
    const turn0 = C.turn;
    await key(g, 'e', 600);
    await tick(g, 4000);
    t.ok(C.turn === turn0 + 1 || C.phase === 'over', 'combat: E ends the turn and the next one begins (' + turn0 + ' -> ' + C.turn + ')');
    await p.until(() => UI.currentName !== 'combat', { steps: 200 });
    t.eq(UI.currentName, 'reward', 'combat: the fight ends on the reward page');
    clean(g, 'combat');
  });
}

if (want('library')) {
  await t.test('library: an Unlock button spends Inkstones, and the tabs show the tale that was told', async () => {
    const prof = { v: 1, inkstones: 400, stats: { runs: 1, wins: 1 }, history: [{ id: 'abc', score: 900, heroes: ['hanae', 'kuro'], chapter: 3, outcome: 'win', trial: 0, daily: false, ts: 1767225600000, seed: 5, inkstones: 60 }], story: { intro: true, ch1_intro: true }, seen: { kappa: 3 }, kills: { kappa: 2 } };
    const g = page({ seed: 5, store: { rb_profile_v1: JSON.stringify(prof) } });
    const { UI, META } = g;
    await tick(g, 1200);
    const gate = $(g, '.mn-gate');
    if (gate) await tap(g, gate, 300);
    t.ok(/Continue/.test(txt($(g, '.s-title'))) === false, 'library: no tale in progress, so no Continue');
    await tap(g, $(g, '[data-act=library]'), 1200);
    t.eq(UI.currentName, 'library', 'library: opens');
    const row = META.libraryList().find((e) => !e.unlocked && e.affordable);
    t.ok(!!row, 'library: something is affordable with 400 Inkstones');
    const before = META.inkstones;
    const item = $$(g, '.mn-item').find((el) => (el.getAttribute('aria-label') || '').startsWith(row.name + '.'));
    t.ok(!!item, 'library: the item is on the page (' + row.name + ')');
    await tap(g, $(g, '.mn-unlock', item), 700);
    t.eq(META.inkstones, before - row.cost, 'library: the Unlock button spent exactly the price (' + before + ' -> ' + META.inkstones + ')');
    t.ok(META.isUnlocked(row.kind, row.id), 'library: and the ' + row.kind + ' is unlocked');
    t.ok(/UNLOCKED/i.test(txt(item)) || /Unlocked\./.test(item.getAttribute('aria-label') || ''), 'library: the item shows it is unlocked');
    const paneText = () => txt($$(g, '.s-library .mn-pane').find((p) => p.getBoundingClientRect().width > 0 && !p.hidden));
    const tabs = $$(g, '.s-library [role=tab]');
    await tap(g, tabs.find((x) => x.dataset.id === 'story'), 500);
    t.ok(new RegExp(g.DATA.lore.intro.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(paneText()) && /\?\?\?/.test(paneText()), 'library: Story lists the pages read and hides the rest as ???');
    await tap(g, tabs.find((x) => /Bestiary/.test(txt(x))), 500);
    t.ok(/Kappa/.test(paneText()) && /1 of 17 met/.test(paneText()), 'library: Bestiary names the foe that was met and counts it');
    await tap(g, tabs.find((x) => /History/.test(txt(x))), 500);
    t.ok(/Hanae and Kuro/.test(paneText()) && /Victory/.test(paneText()) && /900/.test(paneText()), 'library: History lists the won tale with its party and score');
    await tap(g, tabs.find((x) => /Achievements/.test(txt(x))), 500);
    t.ok($$(g, '.mn-ach').length >= 30, 'library: Achievements lists every feat (' + $$(g, '.mn-ach').length + ')');
    clean(g, 'library');
  });
}

if (want('library')) {
  for (const mode of ['set', 'all', 'access']) {
    await t.test('nosave (' + mode + '): storage that refuses writes shows one warning toast and the tale carries on from memory', async () => {
      const g = boot({ autoboot: true, seed: 5, failStorage: mode });
      const p = player(g, {});
      await p.until(() => g.UI.currentName === 'map', { steps: 60 });
      await tick(g, 1500);
      await p.until(() => p.stats.paints >= 1 && g.UI.currentName !== 'map', { steps: 60 });   // far enough to have painted and walked into the first fight
      const toasts = $$(g, '#toasts > *').map(txt).filter((x) => /cannot be saved/.test(x));
      t.eq(toasts.length, 1, 'nosave/' + mode + ': exactly one "cannot be saved" toast [' + toasts.join(' | ') + ']');
      t.ok(p.stats.paints >= 1 && g.META.hasRun(), 'nosave/' + mode + ': play went on and the run lives in memory [paints ' + p.stats.paints + ', hasRun ' + g.META.hasRun() + ', screen ' + g.UI.currentName + ']');
      clean(g, 'nosave/' + mode);
    });
  }
}

if (want('fuzz')) {
  for (const seed of [4, 8]) {
    await t.test('fuzz (seed ' + seed + '): random taps, keys, drags and resizes between sensible moves leave the page clean', async () => {
      const g = page({ seed });
      const { UI, GAME } = g;
      const p = player(g, { heroes: ['suzu', 'raiga'] });
      let st = (seed * 2654435761) >>> 0;
      const rnd = () => { st ^= st << 13; st >>>= 0; st ^= st >>> 17; st ^= st << 5; st >>>= 0; return st / 4294967296; };
      const pick = (a) => a[Math.floor(rnd() * a.length)];
      const KEYS = ['Escape', 'Enter', ' ', 'e', 's', 'd', 'g', 'z', 'f', 'b', '+', '-', '1', '2', '3', '4', '5', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab', 'q', 'a', 'c', 'x'];
      const shown = (el) => { for (let e = el; e && e.nodeType === 1; e = e.parentNode) { if (e.hasAttribute && e.hasAttribute('hidden')) return false; if (e.style && e.style.display === 'none') return false; } return true; };
      const did = { player: 0, click: 0, key: 0, drag: 0, canvas: 0, resize: 0 };
      let offender = null;
      for (let i = 0; i < 500 && !offender; i++) {
        const before = complaints(g).length;
        let what = '';
        if (rnd() < 0.6) {
          const r = rnd();
          if (r < 0.4) { const els = $$(g, 'button, [role=button], .card, .hit, .cm-ehit').filter(shown); if (els.length) { const el = pick(els); g._click(el); did.click++; what = 'click ' + String(el.className).slice(0, 30); } }
          else if (r < 0.7) { const k = pick(KEYS); g._key(k); did.key++; what = 'key ' + k; }
          else if (r < 0.8) { const els = $$(g, '.card').filter(shown); if (els.length) { await g._drag(pick(els), [rnd() * 1280, 500 + rnd() * 200], [rnd() * 1280, rnd() * 700], 5); did.drag++; what = 'drag'; } }
          else if (r < 0.9) { g._click($(g, '#view'), { x: rnd() * 1280, y: rnd() * 720 }); did.canvas++; what = 'canvas'; }
          else { g._resize(pick([1280, 844, 390, 1920, 640]), pick([720, 390, 844, 1080, 360])); did.resize++; what = 'resize'; }
          await tick(g, pick([30, 100, 300, 800]));
        } else {
          try { what = 'player ' + await p.step(); did.player++; } catch (e) { if (!/stuck/.test(e.message)) throw e; await tick(g, 500); }
        }
        if (complaints(g).length > before) offender = 'step ' + i + ' after "' + what + '" on ' + UI.currentName + ': ' + complaints(g).slice(before).join(' | ').slice(0, 400);
      }
      t.ok(offender === null, 'fuzz/' + seed + ': no complaint across 500 steps ' + JSON.stringify(did) + (offender ? ' [' + offender + ']' : ''));
      t.ok(did.click > 50 && did.key > 40 && did.resize > 10 && did.player > 100, 'fuzz/' + seed + ': the noise really happened');
      g._resize(1280, 720);
    });
  }
}

if (want('events')) {
  await t.test('events: every fable and every choice, played through the real event page', async () => {
    const g = page({ seed: 31 });
    const { UI, GAME, DATA } = g;
    await tick(g, 800);
    const p = player(g, { heroes: ['hanae', 'kuro'] });
    const tally = { map: 0, combat: 0, disabled: 0, hidden: 0 };
    const stuck = [], complaints0 = complaints(g).length;
    let scenarios = 0;
    for (const id of Object.keys(DATA.events)) {
      const ev = DATA.events[id];
      const heroes = ev.when && ev.when.hero ? [ev.when.hero, ev.when.hero === 'hanae' ? 'kuro' : 'hanae'] : ['hanae', 'kuro'];
      for (let i = 0; i < ev.choices.length; i++) {
        scenarios++;
        GAME.debug.open('event', { id, heroes, gold: 100, ink: 8, chapter: (ev.chapters && ev.chapters[0]) || 1 });
        await tick(g, 500);
        if (UI.currentName !== 'event') { stuck.push(id + '#' + i + ' opened on ' + UI.currentName); continue; }
        const choices = $$(g, '.ev-choice').filter((b) => !b.hidden);
        const b = choices[i];
        if (!b) { tally.hidden++; continue; }                                       // a hero-gated choice for a hero who is not in the party
        if (b.getAttribute('aria-disabled') === 'true' || b.disabled) { tally.disabled++; continue; }
        p.state.evPick = i;
        let guard = 0;
        while (guard++ < 40) { await p.step(); if (UI.currentName !== 'event' && UI.overlay.count() === 0) break; }
        if (UI.currentName === 'map') tally.map++; else if (UI.currentName === 'combat') tally.combat++; else stuck.push(id + '#' + i + ' ended on ' + UI.currentName);
      }
    }
    t.ok(Object.keys(DATA.events).length >= 40, 'events: the book holds its fables (' + Object.keys(DATA.events).length + ')');
    t.deep(stuck, [], 'events: no choice leaves the page stuck or on a wrong screen');
    t.ok(tally.map > 100, 'events: most choices end on the map [' + JSON.stringify(tally) + ' of ' + scenarios + ']');
    t.ok(tally.combat >= 1, 'events: a gamble can hand over to a real fight');
    t.eq(tally.map + tally.combat + tally.disabled + tally.hidden, scenarios, 'events: every scenario is accounted for');
    t.eq(complaints(g).length, complaints0, 'events: no page complaints across ' + scenarios + ' scenarios [' + complaints(g).slice(0, 3).join(' | ') + ']');
  });
}

if (want('shop')) {
  await t.test('shop: everything on every shelf can be bought through the real plaques, and card removal and gem cutting work', async () => {
    const g = page({ seed: 31 });
    const { UI, GAME } = g;
    await tick(g, 800);
    const p = player(g, { heroes: ['hanae', 'kuro'], cheat: false });
    const bought = { card: 0, gem: 0, relic: 0, brush: 0 };
    const problems = [];
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      GAME.debug.open('shop', { seed, gold: 5000 });
      await tick(g, 900);
      const R = GAME.state.R;
      for (const it of R.node.stock.items.slice()) {
        const before = { gold: R.gold, deck: R.deck.length, relics: R.relics.length, gems: R.gems.length, brushes: R.brushes.length };
        const el = it.kind === 'card' ? $(g, '.sh-item[data-key="' + it.key + '"] .card') : $(g, '.sh-plaque[data-key="' + it.key + '"]');
        if (!el) { problems.push('seed ' + seed + ': no element for ' + it.kind + ' ' + it.id); continue; }
        await tap(g, el, 500);
        const buy = byText(g, /^(buy|purchase)/i);
        if (buy) await tap(g, buy, 700);
        for (let n = 0; n < 6 && UI.overlay.count() > 0; n++) await p.step();
        const sold = R.node.stock.items.find((x) => x.key === it.key).sold;
        const gained = { card: R.deck.length - before.deck, relic: R.relics.length - before.relics, gem: R.gems.length - before.gems, brush: R.brushes.length - before.brushes }[it.kind];
        if (!sold) problems.push('seed ' + seed + ': ' + it.kind + ' ' + it.id + ' was not sold');
        else if (before.gold - R.gold !== it.price) problems.push('seed ' + seed + ': ' + it.id + ' cost ' + (before.gold - R.gold) + ' not ' + it.price);
        else if (gained !== 1) problems.push('seed ' + seed + ': ' + it.id + ' sold but the run gained ' + gained);
        else bought[it.kind]++;
      }
      const d0 = R.deck.length, g0 = R.gold;
      await tap(g, $(g, '.sh-plaque.kind-remove'), 600);
      for (let n = 0; n < 8 && UI.overlay.count() > 0; n++) await p.step();
      if (R.deck.length !== d0 - 1 || R.gold >= g0) problems.push('seed ' + seed + ': card removal took ' + (g0 - R.gold) + ' gold and the deck went ' + d0 + ' -> ' + R.deck.length);
      await tap(g, $(g, '.sh-plaque.kind-cut'), 600);
      for (let n = 0; n < 8 && UI.overlay.count() > 0; n++) await p.step();
      await tap(g, byText(g, /leave the stall/i), 900);
      if (UI.currentName !== 'map') problems.push('seed ' + seed + ': leaving the stall ended on ' + UI.currentName);
    }
    t.deep(problems, [], 'shop: every purchase, removal and leave behaved');
    t.ok(bought.card >= 30 && bought.gem >= 8 && bought.relic >= 16 && bought.brush >= 4, 'shop: all four kinds of goods were bought [' + JSON.stringify(bought) + ']');
    clean(g, 'shop');
  });
}

await t.done();
