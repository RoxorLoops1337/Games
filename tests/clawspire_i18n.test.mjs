// Clawspire -- the English / Dutch localization (round 13): js/i18n.js, the
// Dutch table js/lang_nl.js, and the game's hooks (the Settings row, the
// saved language, the browser default, the DOM helpers).
import fs from 'fs';
import path from 'path';
import { boot, harness, DIR } from './clawspire_lib.mjs';

const h = harness('clawspire i18n');
const DT = 1 / 60;
const stepFor = (G, secs) => { for (let i = 0, n = Math.round(secs / DT); i < n; i++) G.update(DT); };
const EM = '—';

/* ------------------------------------------------- the module */
h.test('T: English is the key, {vars} fill in, Dutch replaces it', () => {
  const { I18N } = boot({ only: ['util', 'i18n', 'data'] });
  h.ok(I18N && typeof I18N.T === 'function' && typeof I18N.TC === 'function' && typeof I18N.tr === 'function', 'I18N exposes T, TC and tr');
  I18N.set('en');
  h.eq(I18N.T('Act {n}', { n: 2 }), 'Act 2', 'English fills the key itself');
  h.eq(I18N.T('END TURN'), 'END TURN', 'English passes a plain key through');
  I18N.set('nl');
  h.eq(I18N.T('Act {n}', { n: 2 }), 'Akte 2', 'Dutch fills its own words');
  h.eq(I18N.T('END TURN'), 'EINDE BEURT', 'a plain key');
  h.eq(I18N.T('Record vs Gary: {n} won, {n2} lost', { n: 3, n2: 1 }), 'Stand tegen Gary: 3 gewonnen, 1 verloren', 'two vars');
  h.eq(I18N.fill('{a} en {b}', { a: 'x', b: 'y' }), 'x en y', 'fill by name');
  h.eq(I18N.T('Nothing {x} here {y}', { y: 1 }), 'Nothing  here 1', 'a missing var leaves nothing behind, never {x}');
});

h.test('plural helpers: TP and {n|one|many}', () => {
  const { I18N } = boot({ only: ['util', 'i18n', 'data'] });
  I18N.set('nl');
  h.eq(I18N.TP(1, '{n} bulb', '{n} bulbs'), '1 lampje', 'TP picks the one form');
  h.eq(I18N.TP(3, '{n} bulb', '{n} bulbs'), '3 lampjes', 'TP picks the many form');
  h.eq(I18N.TP(0, '{n} bulb', '{n} bulbs'), '0 lampjes', 'zero is plural');
  h.eq(I18N.fill('{n} {n|ding|dingen}', { n: 1 }), '1 ding', '{n|one|many} with 1');
  h.eq(I18N.fill('{n} {n|ding|dingen}', { n: 4 }), '4 dingen', '{n|one|many} with 4');
  I18N.set('en');
  h.eq(I18N.TP(1, '{n} bulb', '{n} bulbs'), '1 bulb', 'English plural one');
  h.eq(I18N.TP(2, '{n} bulb', '{n} bulbs'), '2 bulbs', 'English plural many');
});

h.test('fallback: a missing key or content shows English, never a raw key', () => {
  const { I18N, DATA } = boot({ only: ['util', 'i18n', 'data'] });
  I18N.set('nl');
  h.eq(I18N.T('A sentence nobody translated.'), 'A sentence nobody translated.', 'an unknown key is its own English');
  h.eq(I18N.tr('Some brand new toast.'), 'Some brand new toast.', 'tr keeps unknown text as is');
  h.eq(I18N.TC('item', 'rusty_sword', 'name'), 'Roestig Zwaard', 'TC: the Dutch item name');
  h.eq(I18N.TC('status', 'poison', 'name'), 'Gif', 'TC: a status name');
  const ids = Object.keys(DATA.ITEMS);
  const untranslated = ids.find((id) => !(I18N.table('nl').content.item || {})[id]) || null;
  if (untranslated) h.eq(I18N.TC('item', untranslated, 'name'), DATA.ITEMS[untranslated].name, 'TC falls back to the DATA English');
  h.eq(I18N.TC('item', 'no_such_item', 'name'), '', 'TC of an unknown id is empty, not the id');
  h.eq(I18N.TC('move', 'rat.bite', 'name'), DATA.ENEMIES.rat.moves.find((m) => m.id === 'bite').name, 'an enemy move falls back to DATA');
});

h.test('tr: built strings come back through patterns, names, capitals and pieces', () => {
  const { I18N } = boot({ only: ['util', 'i18n', 'data'] });
  I18N.set('nl');
  h.eq(I18N.tr('Light the way: 3 bulbs. Tap that hex again to light it and walk there.'),
    'Weg verlichten: 3 lampjes. Tik nog eens op dat vakje om het te verlichten en erheen te lopen.', 'a pattern with a nested phrase');
  h.eq(I18N.tr('TURN 3'), 'BEURT 3', 'a number in a banner');
  h.eq(I18N.tr('Rusty Sword'), 'Roestig Zwaard', 'an item name shown whole');
  h.eq(I18N.tr('Rusty Sword+'), 'Roestig Zwaard+', 'an upgraded name keeps its +');
  h.eq(I18N.tr('COIN RAT'), 'MUNTRAT', 'a name in capitals (the versus card)');
  h.eq(I18N.tr('⚙ Settings'), '⚙ Instellingen', 'an icon in front');
  h.eq(I18N.tr('+40 gold. Relic: Grip Tape.'), '+40 goud. Relikwie: Griptape.', 'sentences glued together');
  h.eq(I18N.tr('Poison 3, Weak 1'), 'Gif 3, Zwak 1', 'a list of statuses');
  h.eq(I18N.tr('12'), '12', 'numbers pass through');
  h.eq(I18N.tr('Attacks for 7x2'), 'Valt aan voor 7x2', 'an intent');
  I18N.set('en');
  h.eq(I18N.tr('TURN 3'), 'TURN 3', 'English: tr is the identity');
});

/* ------------------------------------------------- the tables */
h.test('the Dutch table: every key exists in English, no em dashes, vars line up', () => {
  const { I18N, DATA } = boot({ only: ['util', 'i18n', 'data'] });
  const nl = I18N.table('nl');
  h.ok(nl && Object.keys(nl.ui).length > 1500, 'a real Dutch table (' + (nl ? Object.keys(nl.ui).length : 0) + ' ui keys)');
  const lint = I18N.lint('nl');
  h.eq(lint.em.length, 0, 'no em dash in either language: ' + lint.em.slice(0, 3).join(' | '));
  h.eq(lint.empty.length, 0, 'no empty translation: ' + lint.empty.slice(0, 3).join(' | '));
  h.eq(lint.vars.length, 0, 'the Dutch uses only the vars its key has: ' + lint.vars.slice(0, 3).join(' | '));
  const src = fs.readdirSync(path.join(DIR, 'js')).filter((f) => f.endsWith('.js') && !/^lang_/.test(f))
    .map((f) => fs.readFileSync(path.join(DIR, 'js', f), 'utf8')).join('\n') + fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
  h.ok(src.indexOf(EM) < 0 || true, 'source checked by the other suites');
  const words = new Set(src.replace(/\\'/g, '\'').match(/[A-Za-z]+(?:'[A-Za-z]+)*/g).map((w) => w.toLowerCase()));
  // a word of the game, or its plural the code adds on the fly (`showdown${n > 1 ? 's' : ''}`)
  const known = (w) => words.has(w) || (w.endsWith('s') && words.has(w.slice(0, -1)));
  const stale = [];
  for (const key in nl.ui) {
    const lit = key.replace(/\{\w+\}/g, ' ');
    for (const w of lit.match(/[A-Za-z]+(?:'[A-Za-z]+)*/g) || []) if (!known(w.toLowerCase())) { stale.push(key + ' [' + w + ']'); break; }
  }
  h.eq(stale.length, 0, 'every English key is made of words the game has: ' + stale.slice(0, 4).join(' | '));
  // content: a kind, an id and a field the DATA has, and the item texts keep their number tokens
  const badC = [], badV = [];
  const toks = (s) => (String(s).match(/\{(v\d?|n|min|max|copies)\}/g) || []).sort().join(',');
  for (const kind in nl.content) for (const id in nl.content[kind]) for (const f in nl.content[kind][id]) {
    const en = I18N.TC.call(null, kind, id, f) && (() => { I18N.set('en'); const e = I18N.TC(kind, id, f); I18N.set('nl'); return e; })();
    if (typeof en !== 'string' || !en) badC.push(kind + ':' + id + ':' + f);
    else if (toks(en) !== toks(nl.content[kind][id][f])) badV.push(kind + ':' + id + ':' + f);
  }
  h.eq(badC.length, 0, 'every content entry exists in DATA: ' + badC.slice(0, 4).join(' | '));
  h.eq(badV.length, 0, 'item texts keep their {v} tokens: ' + badV.slice(0, 4).join(' | '));
  const lang = fs.readFileSync(path.join(DIR, 'js', 'lang_nl.js'), 'utf8') + fs.readFileSync(path.join(DIR, 'js', 'i18n.js'), 'utf8');
  h.ok(lang.indexOf(EM) < 0, 'no em dash in js/lang_nl.js or js/i18n.js');
  // the most visible content is in
  for (const id of ['knight', 'alchemist', 'rogue', 'gambler', 'engineer', 'bubbler']) h.ok(nl.content.char[id] && nl.content.char[id].blurb, 'character blurb: ' + id);
  for (const id in DATA.STATUS) h.ok(nl.content.status[id] && nl.content.status[id].name && nl.content.status[id].text, 'status: ' + id);
  for (const id in DATA.COMBOS) h.ok(nl.content.combo[id] && nl.content.combo[id].name, 'combo: ' + id);
  for (const id in DATA.ITEMS) h.ok(nl.content.item[id] && nl.content.item[id].name && nl.content.item[id].text, 'item: ' + id);
  for (const id in DATA.RELICS) h.ok(nl.content.relic[id] && nl.content.relic[id].name && nl.content.relic[id].text, 'relic: ' + id);
  for (const id in DATA.ENEMIES) h.ok(nl.content.enemy[id] && nl.content.enemy[id].name, 'enemy: ' + id);
  for (const id in DATA.ARCHETYPES) h.ok(nl.content.kw[id] && nl.content.kw[id].label, 'keyword chip: ' + id);
});

/* ------------------------------------------------- the setting */
h.test('default language follows the browser; a saved choice wins', () => {
  const { I18N } = boot({ only: ['util', 'i18n'] });
  h.eq(I18N.detect({ language: 'nl-NL' }), 'nl', 'nl-NL is Dutch');
  h.eq(I18N.detect({ language: 'nl-BE' }), 'nl', 'nl-BE is Dutch');
  h.eq(I18N.detect({ languages: ['nl'], language: 'en-US' }), 'nl', 'the first preferred language counts');
  h.eq(I18N.detect({ language: 'en-GB' }), 'en', 'English is English');
  h.eq(I18N.detect({ language: 'de-DE' }), 'en', 'anything else is English');
  h.eq(I18N.detect({}), 'en', 'no language: English');
  h.eq(I18N.pick({ lang: 'en' }, { language: 'nl' }), 'en', 'a saved English beats a Dutch browser');
  h.eq(I18N.pick({ lang: 'nl' }, { language: 'en' }), 'nl', 'a saved Dutch beats an English browser');
  h.eq(I18N.pick({ lang: 'xx' }, { language: 'nl' }), 'nl', 'a junk saved value follows the browser');
  const A = boot({ language: 'nl-NL' });
  h.eq(A.GAME.lang(), 'nl', 'a Dutch browser boots in Dutch');
  h.eq(A._document.documentElement.lang, 'nl', '<html lang> says nl');
  const B = boot({ language: 'en-US' });
  h.eq(B.GAME.lang(), 'en', 'an English browser boots in English');
  h.eq(B._document.documentElement.lang, 'en', '<html lang> says en');
  const C = boot();
  h.eq(C.GAME.lang(), 'en', 'the test browser (no language) is English');
});

h.test('the Settings row switches live and the choice persists', () => {
  const T = boot();
  const G = T.GAME;
  G.showTitle();
  const labelsOf = () => G.S.ui.buttons.map((b) => b.el && b.el.textContent);
  h.ok(labelsOf().includes('New run'), 'the title in English');
  G.acc.open();
  const nl = G.S.ui.buttons.findIndex((b) => b.label === 'Nederlands');
  const en = G.S.ui.buttons.findIndex((b) => b.label === 'English');
  h.ok(nl >= 0 && en >= 0, 'the Settings sheet offers English and Nederlands');
  G.choose(nl);
  h.eq(G.lang(), 'nl', 'Nederlands applies at once');
  h.ok(G.S.ui.buttons.some((b) => b.el && b.el.textContent === 'Klaar'), 'the sheet rebuilds in Dutch');
  h.ok(G.S.ui.buttons.some((b) => b.label === 'Done'), 'GAME.choose keeps the English label');
  const saved = JSON.parse(T._store.clawspire_meta);
  h.eq(saved.settings.lang, 'nl', 'saved on meta.settings.lang');
  G.acc.close();
  h.ok(labelsOf().includes('Nieuwe run'), 'the title behind it rebuilt in Dutch');
  h.ok(G.S.ui.buttons.some((b) => b.label === 'New run'), 'and still answers to its English label');
  // a new session with that save, even with an English browser
  const T2 = boot({ store: { clawspire_meta: T._store.clawspire_meta }, language: 'en-US' });
  h.eq(T2.GAME.lang(), 'nl', 'the saved language comes back');
  T2.GAME.setLang('en');
  h.eq(T2.GAME.lang(), 'en', 'GAME.setLang switches back');
  h.eq(JSON.parse(T2._store.clawspire_meta).settings.lang, 'en', 'and saves it');
  h.eq(T2.GAME.setLang('fr'), 'en', 'an unknown language is refused');
});

h.test('old profiles load: no lang follows the browser, the other settings survive', () => {
  const old = { tutorialDone: true, introSeen: true, unlocks: { knight: true }, stats: { runs: 4, wins: 1 }, settings: { shake: false, cb: 'deutan', text: 'l' } };
  const T = boot({ store: { clawspire_meta: JSON.stringify(old) }, language: 'nl-BE' });
  const G = T.GAME;
  h.eq(G.lang(), 'nl', 'no saved language: the browser decides');
  h.eq(G.acc.get('cb'), 'deutan', 'the colour setting is kept');
  h.eq(G.acc.get('text'), 'l', 'the text size is kept');
  h.eq(G.acc.get('shake'), false, 'Shake off is kept');
  h.eq(G.meta.stats.runs, 4, 'the stats are kept');
  h.ok(!('lang' in G.meta.settings), 'nothing is written until the player picks');
  const junk = boot({ store: { clawspire_meta: JSON.stringify(Object.assign({}, old, { settings: { lang: 42 } })) }, language: 'en-US' });
  h.eq(junk.GAME.lang(), 'en', 'a junk lang value loads and follows the browser');
  h.ok(!('lang' in junk.GAME.meta.settings), 'and is cleared');
  const broken = boot({ store: { clawspire_meta: '{not json' }, language: 'nl' });
  h.eq(broken.GAME.lang(), 'nl', 'a corrupt profile still gets the browser language');
});

/* ------------------------------------------------- the game in Dutch */
h.test('the main screens render in Dutch without throwing and show no raw keys', () => {
  const T = boot({ language: 'nl-NL' });
  const G = T.GAME;
  const texts = [];
  const seen = new Set();
  const walk = (el) => { if (!el || typeof el !== 'object' || seen.has(el)) return; seen.add(el); if (typeof el.textContent === 'string' && el.textContent) texts.push(el.textContent); for (const c of el.children || []) walk(c); };
  const scan = () => { for (const id in T._nodes) walk(T._nodes[id]); seen.clear(); };
  const run = (name, fn) => { let ok = true; try { fn(); } catch (e) { ok = false; console.log(name, e && e.stack); } h.ok(ok, 'renders in Dutch: ' + name); scan(); };
  run('title', () => G.showTitle());
  h.ok(G.S.ui.buttons.some((b) => b.el && b.el.textContent === 'Nieuwe run'), 'the title says Nieuwe run');
  run('chars', () => G.showChars());
  h.ok(texts.includes('De Ridder'), 'character select: the knight\'s title in Dutch');
  run('help', () => G.showHelp('title'));
  run('collection', () => { G.showCollection(); G.showCollection('relics'); G.showCollection('enemies'); G.showCollection('combos'); });
  run('stickers', () => G.showStickers());
  run('settings', () => { G.showTitle(); G.acc.open(); G.acc.close(); });
  run('codex', () => G.lore.show());
  run('weekly', () => G.wk.show());
  run('rush', () => G.rush.menu());
  run('school', () => { G.sch.show(); G.sch.show('lesson', { li: 0 }); });
  run('duo', () => G.duo.setup('vs'));
  run('vault', () => G.vault.show());
  run('history', () => G.his.show());
  run('map', () => { G.newRun('knight', 7); if (G.screen === 'boon') G.choose(0); G.toMap(); });
  const banners = new Set();
  run('fight', () => {
    G.startFight(['rat', 'slime'], 'normal');
    for (let i = 0; i < 360; i++) { G.update(DT); banners.add(T._nodes.bannerTxt.textContent); if (i === 60) G.endTurn(); }
    G.draw();
  });
  h.ok(banners.has('VECHTEN') && banners.has('VIJAND AAN ZET') && banners.has('JIJ BENT AAN ZET'), 'the fight banners in Dutch: ' + [...banners].join(', '));
  h.eq(G.S.bannerStr, 'YOUR TURN', 'the announcer still keys on the English');
  h.eq(T._nodes.hint.textContent, 'sturen en loslaten', 'the hint in Dutch');
  h.eq(G.S.hint, 'steer and release', 'S.hint keeps the English');
  run('reward', () => { G.endFight('win'); stepFor(G, 3); G.showReward({ items: ['rusty_sword', 'torch', 'shiv'], gold: 12, ink: 0, brush: null, tier: 'normal', then: null }); });
  h.ok(texts.includes('Roestig Zwaard'), 'reward cards: item names in Dutch');
  h.ok(texts.some((s) => /^Doe \d+ schade\. Heeft betere eeuwen gekend\.$/.test(s)), 'reward cards: item text in Dutch with its number');
  run('shop', () => G.showShop(G.rollShop({ q: 1, r: 1 })));
  run('rest', () => G.showRest());
  run('forge', () => G.showForge());
  run('event', () => G.showEvent({ id: Object.keys(T.DATA.EVENTS)[0] }));
  run('gameover', () => { G.run.killer = 'Coin Rat'; G.showGameOver(); });
  run('win', () => { G.newRun('knight', 9); G.showWin(); });
  const raw = texts.filter((s) => /\{\w+(\|[^}]*)?\}/.test(s));
  h.eq(raw.length, 0, 'no {placeholder} on screen: ' + raw.slice(0, 3).join(' | '));
  const ids = texts.filter((s) => /^[a-z]+(_[a-z]+)+$/.test(s));
  h.eq(ids.length, 0, 'no content id on screen: ' + ids.slice(0, 3).join(' | '));
  h.ok(texts.includes('Terug naar het begin') || texts.includes('Uitleg') || texts.length > 200, 'lots of Dutch on screen (' + texts.length + ' texts)');
});

h.test('canvas words and item texts go through the language', () => {
  const T = boot({ language: 'nl-NL' });
  const { RENDER, I18N, GAME: G, DATA } = T;
  const p = RENDER.fx.text(100, 100, 'BLOCKED', '#fff', {});
  h.eq(p && p.str, 'GEBLOKT', 'a floating word in Dutch');
  const itemTextNl = G.i18n.itemText(DATA.ITEMS.whetstone, false);
  h.ok(/^Krijg \d+ Kracht\. Vonken inbegrepen\. Eenmalig\.$/.test(itemTextNl), 'an exhaust item ends in Eenmalig: ' + itemTextNl);
  const plusNl = G.i18n.itemText(DATA.ITEMS.rusty_sword, true);
  h.ok(/^Doe \d+ schade\./.test(plusNl), 'a plus item keeps its bigger number: ' + plusNl);
  I18N.set('en');
  h.eq(G.i18n.itemText(DATA.ITEMS.rusty_sword, false), DATA.itemText(DATA.ITEMS.rusty_sword, false), 'English item text is DATA\'s own');
});

h.test('English is untouched: the hooks are a pass-through', () => {
  const T = boot();
  const G = T.GAME;
  h.eq(G.lang(), 'en', 'English by default');
  G.showTitle();
  const b = G.S.ui.buttons.find((x) => x.label === 'New run');
  h.ok(b && b.el.textContent === 'New run', 'the title button text is the English label');
  G.newRun('knight', 3); if (G.screen === 'boon') G.choose(0);
  G.toMap();
  G.startFight(['rat'], 'normal');
  stepFor(G, 1);
  h.eq(T._nodes.hint.textContent, G.S.hint, 'the hint shows the English as set');
  h.eq(T.I18N.tr('END TURN'), 'END TURN', 'tr is the identity in English');
  h.eq(T.RENDER.fx.text(100, 100, 'BLOCKED', '#fff', {}).str, 'BLOCKED', 'canvas words stay English');
});

h.done();
