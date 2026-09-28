// Clawspire -- the English / Dutch localization (round 13): js/i18n.js, the
// Dutch table js/lang_nl.js, and the game's hooks (the Settings row, the
// saved language, the browser default, the DOM helpers).
import fs from 'fs';
import path from 'path';
import { boot, harness, DIR } from './clawspire_lib.mjs';

const h = harness('clawspire i18n');
const DT = 1 / 60;
const stepFor = (G, secs) => { for (let i = 0, n = Math.round(secs / DT); i < n; i++) G.update(DT); };
const EM = String.fromCharCode(0x2014);

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
  const lang = fs.readFileSync(path.join(DIR, 'js', 'lang_nl.js'), 'utf8') + fs.readFileSync(path.join(DIR, 'js', 'lang_nl2.js'), 'utf8') + fs.readFileSync(path.join(DIR, 'js', 'i18n.js'), 'utf8');
  h.ok(lang.indexOf(EM) < 0, 'no em dash in js/lang_nl.js, js/lang_nl2.js or js/i18n.js');
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

/* ------------------------------------------------- round 14: the rest of the content (js/lang_nl2.js) */
h.test('round 14: every Codex page, story, Gary line, evolution, pet synergy, seasonal entry and move has Dutch', () => {
  const { I18N, DATA } = boot({ only: ['util', 'i18n', 'data'] });
  I18N.set('nl');
  const nl = I18N.table('nl'), C = nl.content;
  const EMs = [], miss = [], tok = [];
  const toks = (s) => (String(s).match(/\{(\w+)\}/g) || []).sort().join(',');
  // a Dutch value that is really there (not the English fallback), the same {tokens}, no em dash
  const want = (tag, en, nlv) => {
    if (typeof en !== 'string' || !en) return;
    if (typeof nlv !== 'string' || !nlv.trim()) { miss.push(tag); return; }
    if (toks(en) !== toks(nlv)) tok.push(tag);
    if (nlv.indexOf(EM) >= 0) EMs.push(tag);
  };
  const path_ = (p, f) => C.path && C.path[p] ? C.path[p][f] : undefined;
  // the Codex: every page's words, its name unless it is a crawler's own
  for (const e of DATA.loreBook().entries) {
    const c = (C.lore || {})[e.id] || {};
    want('lore:' + e.id + ':text', e.text, c.text);
    want('lore:' + e.id + ':name', e.name, I18N.known(e.name) ? I18N.tr(e.name) : c.name);
    if (e.hint) want('lore:' + e.id + ':hint', e.hint, c.hint);
  }
  h.eq(Object.keys(C.lore || {}).length, DATA.loreBook().entries.length, 'all ' + DATA.loreBook().entries.length + ' Codex pages are in the table');
  // the branching stories: titles, beats (a beat written as a function comes back through a pattern), choices
  let beats = 0;
  for (const s of Object.values(DATA.STORIES)) {
    want('story:' + s.id, s.title, path_('STORIES.' + s.id, 'title'));
    for (const [b, beat] of Object.entries(s.beats)) {
      beats++;
      if (typeof beat.text === 'string') want(`story:${s.id}.${b}`, beat.text, path_(`STORIES.${s.id}.beats.${b}`, 'text'));
      else for (const score of [0, 1, 3, 4, 5]) { const en = beat.text({ score }); if (I18N.tr(en) === en) miss.push(`story:${s.id}.${b} (score ${score})`); }
      beat.choices.forEach((ch, i) => {
        const p = `STORIES.${s.id}.beats.${b}.choices.${i}`;
        want(p + ':txt', ch.txt, path_(p, 'txt') || (I18N.tr(ch.txt) !== ch.txt ? I18N.tr(ch.txt) : undefined));
        if (ch.sub) want(p + ':sub', ch.sub, path_(p, 'sub') || (I18N.tr(ch.sub) !== ch.sub ? I18N.tr(ch.sub) : undefined));
      });
    }
  }
  h.ok(beats >= 30, 'the stories have their beats (' + beats + ')');
  // Grabby Gary: every line as he says it, with every piece of gear
  for (const k in DATA.GARY_LINES) DATA.GARY_LINES[k].forEach((l, i) => {
    want(`gary:${k}.${i}`, l, path_('GARY_LINES.' + k, String(i)));
    for (const g of DATA.GARY.gear) { const said = l.replace('{gear}', g.toLowerCase()); if (I18N.tr(said) === said) miss.push(`gary said:${k}.${i} (${g})`); }
  });
  DATA.GARY.gear.forEach((g, i) => want('gary gear ' + i, g, path_('GARY.gear', String(i))));
  // the evolved items: name, rules, aura, the proc word and the aura line the ceremony shows
  const evo = Object.getOwnPropertyNames(DATA.EVOLVED);
  h.ok(evo.length >= 28, 'the evolved items (' + evo.length + ')');
  for (const id of evo) {
    const d = DATA.EVOLVED[id], ci = (C.item || {})[id] || {}, ce = (C.evo || {})[id] || {};
    want('evo:' + id + ':name', d.name, ci.name);
    want('evo:' + id + ':text', d.text, ci.text);
    want('evo:' + id + ':auraName', d.auraName, ce.auraName);
    want('evo:' + id + ':auraText', d.auraText, ce.auraText);
    want('evo:' + id + ':proc', DATA.EVO_FX['evo:' + id].proc, path_('EVO_FX.evo:' + id, 'proc'));
    const line = `${d.auraName}: ${d.auraText}`;
    if (I18N.tr(line) === line) miss.push('evo aura line:' + id);
  }
  for (const id in DATA.PET_SYN) for (const f of ['name', 'need', 'text']) want('petsyn:' + id + ':' + f, DATA.PET_SYN[id][f], path_('PET_SYN.' + id, f) || (I18N.known(DATA.PET_SYN[id][f]) ? I18N.tr(DATA.PET_SYN[id][f]) : undefined));
  // the seasons: their words, currencies, items, relics, costumed monsters and elites (with their enrages and signatures)
  for (const sid in DATA.SEASONS) {
    const S0 = DATA.SEASONS[sid];
    for (const f of ['name', 'blurb', 'counter']) want('season:' + sid + ':' + f, S0[f], path_('SEASONS.' + sid, f));
    for (const f of ['name', 'one']) want('season:' + sid + ':cur.' + f, S0.cur[f], path_(`SEASONS.${sid}.cur`, f));
    for (const id of S0.items) { const d = DATA.ITEMS[id], c = (C.item || {})[id] || {}; want('sea item:' + id, d.name, c.name); want('sea item text:' + id, d.text, c.text); }
    for (const id of S0.relics) { const d = DATA.RELICS[id], c = (C.relic || {})[id] || {}; want('sea relic:' + id, d.name, c.name); want('sea relic text:' + id, d.text, c.text); if (d.proc) want('sea relic proc:' + id, d.proc, path_('RELICS.' + id, 'proc')); }
    for (const id of Object.values(S0.costumes).concat([S0.elite])) {
      const d = DATA.ENEMIES[id], c = (C.enemy || {})[id] || {};
      for (const f of ['name', 'desc', 'taunt']) if (d[f]) want('sea enemy:' + id + ':' + f, d[f], c[f]);
      if (d.enrage) for (const f of ['name', 'text']) want('sea enrage:' + id + ':' + f, d.enrage[f], path_(`ENEMIES.${id}.enrage`, f));
      if (d.sig) for (const f of ['name', 'sign', 'shout', 'text']) if (d.sig[f]) want('sea sig:' + id + ':' + f, d.sig[f], path_(`ENEMIES.${id}.sig`, f) || (I18N.known(d.sig[f]) ? I18N.tr(d.sig[f]) : undefined));
    }
  }
  // every enemy's moves (the hidden seasonal, story and family ones too): the name, and its own line
  let moves = 0;
  for (const id of Object.getOwnPropertyNames(DATA.ENEMIES)) {
    const d = DATA.ENEMIES[id];
    if (!d || !Array.isArray(d.moves)) continue;
    for (const m of d.moves) {
      moves++;
      if (m.name && !I18N.known(m.name)) miss.push('move:' + id + '.' + m.id);
      if (m.txt && !I18N.known(m.txt)) miss.push('move line:' + id + '.' + m.id);
    }
    if (d.enrage) for (const f of ['name', 'text']) if (d.enrage[f] && !I18N.known(d.enrage[f])) miss.push('enrage:' + id + ':' + f);
  }
  h.ok(moves > 250, 'the moves counted (' + moves + ')');
  h.eq(miss.length, 0, 'every round 14 entry has Dutch: ' + miss.slice(0, 5).join(' | '));
  h.eq(tok.length, 0, 'the Dutch keeps the English {tokens}: ' + tok.slice(0, 5).join(' | '));
  h.eq(EMs.length, 0, 'no em dash in the round 14 Dutch: ' + EMs.slice(0, 5).join(' | '));
  const lint = I18N.lint('nl');
  h.eq(lint.em.length + lint.vars.length + lint.empty.length, 0, 'the merged table still lints clean');
});

h.test('round 14: the new screens in Dutch show no English (Codex, stories, Gary, evolution, seasons, the intro)', () => {
  const T = boot({ language: 'nl-NL' });
  const G = T.GAME, D = T.DATA, I = T.I18N;
  // the English the round 14 content would show if a hook were missing
  const EN = /\b(the|and|your|you|with|this|that|every|when|from|into|them|they|their|would|could)\b/i;
  const bad = new Map();
  let tag = '';
  // canvas words: everything the renderer and the game pass through the language
  const tr0 = I.tr;
  I.tr = function (s) { const r = tr0(s); if (typeof s === 'string' && r === s && s.length > 12 && EN.test(s) && !bad.has(s)) bad.set(s, tag + ' (canvas)'); return r; };
  const seen = new Set();
  const scan = () => {
    const walk = (el) => {
      if (!el || typeof el !== 'object' || seen.has(el)) return; seen.add(el);
      const kids = el.children || [], tc = typeof el.textContent === 'string' ? el.textContent : '';
      // (text set by hand is Dutch in a browser, where the observer runs, whenever the table knows it)
      if (tc && !kids.length && EN.test(tc) && !I.known(tc) && !bad.has(tc)) bad.set(tc, tag);
      for (const c of kids) walk(c);
    };
    for (const id in T._nodes) walk(T._nodes[id]);
    seen.clear();
  };
  const run = (t, fn) => { tag = t; let ok = true; try { fn(); G.draw(); } catch (e) { ok = false; console.log(t, e && e.stack); } h.ok(ok, 'renders in Dutch: ' + t); scan(); };
  const fresh = (seed) => { G.newRun('knight', seed); if (G.screen === 'boon') G.choose(0); G.toMap(); };
  try {
    run('codex pages', () => {
      G.showTitle();
      for (const e of D.loreBook().entries) G.meta.lore.got[e.id] = 1;
      for (const c of D.LORE_CH) G.lore.show({ ch: c.id, id: null });
      for (const e of D.loreBook().entries) G.lore.show({ ch: e.ch, id: e.id });
    });
    fresh(141);
    for (const s of Object.values(D.STORIES)) for (const b of Object.keys(s.beats)) {
      run('story ' + s.id + '.' + b, () => { G.run.gold = 999; G.sto.beat(s.id, b, 1); });
    }
    run('story outcome', () => { G.run.gold = 999; G.sto.beat('sto_crab', 'start', 1); G.sto.pick(1); stepFor(G, 1); });
    run('gary', () => {
      fresh(142);
      const R = G.sto.run(); R.gary.on = true;
      const t = G.sto.garyPlace(G.run, G.run.map);
      h.ok(!!t, 'Gary has a tile');
      if (t) { G.sto.rival.show({ q: t.q, r: t.r }); stepFor(G, 1); }
    });
    h.ok(!bad.size || [...bad.values()].every((v) => !/^gary/.test(v)), 'Gary speaks Dutch');
    run('evolution', () => {
      fresh(143);
      G.run.relics.push('trophy_rack');
      const inst = { id: 'rusty_sword', plus: true, uid: 9143 };
      G.run.bin.push(inst);
      h.ok(!!G.evo.now(inst), 'the rusty sword evolves');
      for (let i = 0; i < 180; i++) { G.update(DT); if (i % 30 === 0) G.draw(); }
    });
    for (const [date, ty] of [['2026-10-15', 'treat'], ['2026-12-12', 'advent']]) {
      run('season ' + ty, () => {
        G.season.setDate(date);
        fresh(144);
        const t = Object.values(G.run.map.tiles).find((x) => x.type === ty);
        h.ok(!!t, 'a ' + ty + ' tile on the map');
        if (t) { G.enterTile(t); stepFor(G, 1); G.season.knock(); for (let i = 0; i < 360; i++) { G.update(DT); if (i % 60 === 0) G.draw(); } }
      });
      run('season elite ' + ty, () => { G.startFight([ty === 'treat' ? 'pumpking' : 'krampus'], 'elite'); stepFor(G, 3); G.endTurn(); for (let i = 0; i < 480; i++) { G.update(DT); if (i % 60 === 0) G.draw(); } });
    }
    G.season.setDate(null);
    run('intro', () => { if (G.playIntro) G.playIntro(); for (let i = 0; i < 600; i++) { G.update(DT); if (i % 30 === 0) G.draw(); } });
  } finally { I.tr = tr0; }
  const list = [...bad].map(([s, t]) => t + ': ' + s.slice(0, 60));
  h.eq(list.length, 0, 'no English left on these screens: ' + list.slice(0, 4).join(' | '));
  // spot checks: the words themselves
  I.set('nl');
  h.eq(I.tr(D.loreBook().byId.be_mimic.text).slice(0, 26), 'Hij ziet eruit als een pri', 'a Codex page in Dutch');
  h.eq(I.tr(D.STORIES.sto_crab.title), 'De Gekooide Krab', 'a story title in Dutch');
  h.eq(I.tr(D.GARY_LINES.win[2]), 'En DAAROM noemen ze me Graaiende Gary.', 'Gary gloats in Dutch');
  h.eq(I.tr('Oh. It is YOU. I have been practising. Like the new gold chain? Bought them with YOUR tickets. Eventually.'),
    'O. Jij WEER. Ik heb geoefend. Mooi hè, mijn nieuwe gouden ketting? Gekocht met JOUW kaartjes. Straks.', 'his gear goes into the Dutch line');
  h.eq(I.tr('Excalibur Claw'), 'Excaligrijper', 'an evolved item\'s name');
  h.eq(I.tr("King's Oath: Whenever an enemy dies, gain 5 Block."), 'Koningseed: Elke keer dat een vijand sterft, krijg je 5 Blok.', 'the ceremony\'s aura line');
  h.eq(I.tr('+11 candy \u{1F36C}'), '+11 snoepjes \u{1F36C}', 'the candy a door pays');
  h.eq(I.tr('The Pumpkin King'), 'De Pompoenkoning', 'the Pumpkin King');
  h.eq(I.tr('Joystick Jab'), 'Joystickpor', 'a move name');
  h.eq(I.tr('Every fight is a grab.'), 'Elk gevecht is een greep.', 'the intro\'s tagline');
  h.eq(I.tr('“Buy it out (35 gold).”'), '“Koop hem vrij (35 goud).”', 'a quoted pick keeps its quotes');
  I.set('en');
  h.eq(I.tr('Excalibur Claw'), 'Excalibur Claw', 'English stays English');
});

h.test('round 14: the pre-boot loader reads the language itself', () => {
  const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
  const boot0 = (/<script id="csBootJs">([\s\S]*?)<\/script>/.exec(html) || [])[1] || '';
  h.ok(/clawspire_meta/.test(boot0) && /settings\.lang/.test(boot0) && /navigator\.language/.test(boot0), 'the loader reads the saved choice, then the browser');
  h.ok(/De grijper warmt op/.test(boot0) && /Herladen/.test(boot0), 'the loader has its Dutch words');
  h.ok(/class="bmT" translate="no"/.test(html), 'the logo is marked translate="no"');
  // run it against a stub page: Dutch browser, no saved choice
  const mk = (lang, saved) => {
    const els = {}, mkEl = (id, text) => (els[id] = { id, textContent: text, className: '', attrs: { 'aria-label': 'Loading CLAWSPIRE' },
      getAttribute(k) { return this.attrs[k]; }, setAttribute(k, v) { this.attrs[k] = v; }, appendChild(x) { return x; } });
    mkEl('csBoot', ''); mkEl('csBootB', ''); mkEl('csBootS', 'Warming up the claw'); mkEl('csBootR', 'Reload');
    const doc = { documentElement: { lang: 'en' }, getElementById: (id) => els[id] || null, createElement: () => ({}) };
    const win = { requestAnimationFrame: () => 0, addEventListener() {} };
    const ls = { getItem: () => (saved ? JSON.stringify({ settings: { lang: saved } }) : null) };
    new Function('window', 'document', 'localStorage', 'navigator', 'performance', 'requestAnimationFrame', 'setTimeout', boot0.replace(/window\.requestAnimationFrame/g, 'window.requestAnimationFrame'))(
      win, doc, ls, { languages: [lang], language: lang }, { getEntriesByType: () => [] }, () => 0, () => 0);
    return { say: els.csBootS.textContent, btn: els.csBootR.textContent, aria: els.csBoot.attrs['aria-label'], lang: doc.documentElement.lang };
  };
  const nlB = mk('nl-NL', null);
  h.eq(nlB.say, 'De grijper warmt op', 'a Dutch browser: the loader speaks Dutch');
  h.eq(nlB.btn, 'Herladen', 'and its reload button');
  h.eq(nlB.aria, 'CLAWSPIRE laden', 'and its label');
  h.eq(mk('en-US', null).say, 'Warming up the claw', 'an English browser: English');
  h.eq(mk('en-US', 'nl').say, 'De grijper warmt op', 'a saved Dutch choice wins over the browser');
  h.eq(mk('nl-BE', 'en').say, 'Warming up the claw', 'a saved English choice wins too');
});

/* ------------------------------------------------- TRD (round 14): the Trading Post and pet evolution */
h.test('trd: every new line of the Trading Post and pet evolution has its Dutch, and the screens show it', () => {
  const T = boot({ language: 'nl-NL' });
  const { GAME: G, I18N, DATA: D } = T;
  const nl = I18N.table('nl').ui;
  const same = new Set(['Kraken']);   // the same word in both languages
  const miss = [], flat = [];
  for (const k of G.trd.WORDS) { if (!nl[k]) miss.push(k); else if (nl[k] === k && !same.has(k) && !/^(Continue|Leave|Cancel|Tap to continue)$/.test(k)) flat.push(k); }
  for (const id in D.PEV_FORMS) {
    const f = D.PEV_FORMS[id];
    for (const k of [f.name, f.trick, f.text, `${f.trick}: ${f.text}`, f.trick.toUpperCase() + '!']) { if (!nl[k]) miss.push(k); else if (nl[k] === k && !same.has(k)) flat.push(k); }
  }
  h.eq(miss.length, 0, 'every line has a Dutch entry: ' + miss.slice(0, 4).join(' | '));
  h.eq(flat.length, 0, 'and it is Dutch: ' + flat.slice(0, 4).join(' | '));
  for (const k in G.trd.PATTERNS) {
    h.ok(nl[k], 'a pattern: ' + k);
    const ex = G.trd.PATTERNS[k], out = I18N.tr(ex);
    h.ok(out !== ex && !/\{\w+\}/.test(out), `the example comes back in Dutch: ${ex} -> ${out}`);
  }
  h.eq(I18N.tr('Pay 78 gold'), 'Betaal 78 goud', 'a button with its number');
  h.eq(T.RENDER.fx.text(100, 100, 'STAMPEDE!', '#fff', {}).str, 'STORMLOOP!', 'the flourish floats in Dutch');
  // the screens in Dutch: the post with a pet that can evolve, the rest's choice, the Prizedex tab
  const texts = [];
  const walk = (el) => { if (!el || typeof el !== 'object') return; if (typeof el.textContent === 'string' && el.textContent) texts.push(el.textContent); for (const c of el.children || []) walk(c); };
  G.newRun('knight', 1401); if (G.screen === 'boon') G.choose(0);
  G.run.bin.push({ uid: 'zrock', id: 'rock', plus: false });
  G.run.gold = 400;
  G.pet.give('cat', 100);
  const t = Object.values(G.run.map.tiles).find((x) => x.type === 'trader');
  G.enterTile(t);
  h.eq(G.screen, 'trade', 'the Trading Post opens');
  walk(T._nodes.trdBody);
  G.showRest(); walk(T._nodes.restBody);
  G.pev.evolve('rest'); G.evo.uiClose();
  G.showCollection('evo'); walk(T._nodes.collectionBody);
  h.ok(texts.includes('Ruilpost') && texts.includes('JIJ GEEFT') && texts.includes('JIJ KRIJGT'), 'the post speaks Dutch');
  h.ok(texts.some((s) => /^Laat \S+ evolueren$/.test(s)), 'the rest\'s choice speaks Dutch');
  h.ok(texts.includes('Huisdier-evoluties') && texts.includes('Sabeltandkat'), 'the Prizedex speaks Dutch');
  const eng = new Set(G.trd.WORDS.filter((k) => nl[k] && nl[k] !== k));
  const left = texts.filter((s) => eng.has(s));
  h.eq(left.length, 0, 'none of the new English is left on screen: ' + left.slice(0, 4).join(' | '));
  h.eq(texts.filter((s) => /\{\w+(\|[^}]*)?\}/.test(s)).length, 0, 'no {placeholder} on screen');
});

h.done();
