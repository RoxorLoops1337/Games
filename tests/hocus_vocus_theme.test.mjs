// THEME: the permanent theme-leak suite (ECHO_PLAN 8.3, carried into the fork). The game was INKWOVEN (a living book), then ECHOWAKE (a
// land that sings, a Hush that swallows calls), and is now HOCUS VOCUS: A Vocal Magic Adventure (beatboxing and vocal magic). This suite
// fails loudly, with a field path and the offending word, whenever a retired word comes back into player-facing text. It is also the
// re-grep to run after merging origin/main (squash merges resurrect old copy).
//
// The retired words (HV_BIBLE 6.2 and 6.3, Hocus Vocus P2): RETIRED is the Inkwoven list of bible 6.3 and TALE its world word; ECHO_CI and
// ECHO_CS are the Echowake list of bible 6.2 (ECHO_CS holds the words whose lowercase form is plain English, so only the capitalised
// label or name is retired); OLD_SPELL is the six Echowake Spell names, retired as names. leak() applies them all. A word that only a reader
// can judge stays out of the lists and is pinned by the screen suites instead: scroll (6.3 bans it as a written object, 6.4 keeps the
// social-media sense), heard (banned for hexes only), Breath (banned as RoxorLoops's resource only), Song as the map tool (check 6), and the
// Echowake sound words of the hit text (ZAN!, BAN!, ...: art text, repainted in P5).
//
// Checks: 1 every DATA display field passes leak(), 2 every prose string and template literal of the UI scripts passes leak(), 3 index.html
// and gallery.html text passes leak() and names HOCUS VOCUS, 4 the seven kept sfx ids (policy D8), 5 the four docs outside backticks pass
// RETIRED (the docs are still the Echowake docs until P10 rewrites them, so the Echowake list waits for P10 there), 6 "song" as a map tool
// must never come back: the word is banned in the names and texts of tiles, Spells (DATA.brushes), keywords and statuses, and in the
// rules-text scripts. Hocus Vocus prose may say song and chorus (bible 6.4: the duo sing real songs), so nothing else is scanned for it.
// 7 CSS content strings, and the noun "run" (a run is a tour). Every allowlist entry has a reason and must still be in use.
// It never reads hocus_vocus/ECHO_PLAN.md or hocus_vocus/plan/ (the plans quote every old word on purpose).
import fs from 'node:fs';
import path from 'node:path';
import { boot, harness, DIR, tokenizeJs, lineOf } from './hocus_vocus_lib.mjs';

const t = harness('hocus_vocus theme');

// bible 6.3, the Inkwoven words (the Echowake suite's list, widened in Hocus Vocus P2 with the rest of 6.3: inky, pen, nib, library,
// archive, author, editor, edition, redacted, typo, scribble, footnote, margin, bookmark)
const RETIRED = /\b(Ink|Inks|Inkstones?|Inkweaver|Inkwoven|INKWOVEN|Brush(es)?|brush(es)?|[Pp]aint(s|ed|ing)?|Blank|Daily Tale|Ink Trials?|Library|library|Author|author|Editor|editor|[Ee]ditions?|Eraser|Sumi|Bookmarks?|bookmarks?|Unwritten|Chapter|chapter|storybook|[Bb]ooks?|[Pp]ages?|quill|calligraph\w*|manuscript|ink|inky|[Pp]ens?|[Nn]ibs?|[Aa]rchives?|[Rr]edacted|[Tt]ypos?|[Ss]cribbl\w*|[Ff]ootnotes?|[Mm]argins?)\b/;
const TALE = /\b[Tt]ales?\b/;
// bible 6.2, the Echowake words, in any case
const ECHO_CI = new RegExp('\\b(' + [
  'Echowake', 'rogue ballad', 'echo(es|ed|ing)?', 'hush(ed)?', 'chimes?', 'ballads?', 'keepers?', 'fables?', 'tempo trials?', 'daily jam',
  'verses?', 'songbirds?', 'songweavers?', 'drum line', 'beat drop', 'temple bells?', 'tuning forge', 'downbeat', 'dead silence',
  'champions?', 'peddlers?', 'campfires?', 'ambush(es)?', 'gem cache', 'treasures?', 'wakes?', 'woken?', 'waking', 'awake',
  'silent ground', 'heard from afar', 'journeys?', 'the land',
  // the Echowake cast, titles, passives, Keepers and Verses
  'Hanae', 'Kuro', 'Suzu', 'Raiga', 'Blossom Blade', 'Moon Miko', 'Thunder Monk', 'Steady Breath', 'Blade Flow', 'Moonlit Rite', 'Storm Born',
  'Kuzunoha', 'Nine-Voiced Fox', 'Jorogumo', 'Silk Courtesan', 'Hollow Kodama', 'Whispering Bamboo Grove', 'Sunken Lantern City',
  'Thunderless Citadel',
  // the Echowake screen labels
  'joins the band', 'liner notes?', 'a note from the road', 'the final chorus', 'a rest in the music', 'the song fades', 'a voice of the song',
  // the Japanese folklore setting
  'yokai', 'yamabiko', 'kodama', 'kappa', 'tanuki', 'oni', 'tengu', 'kitsune', 'karakasa', 'hitodama', 'chochin', 'karakuri', 'nopperabo',
  'tsukumogami', 'nure-onna', 'rokurokubi', 'ittan-momen', 'umibozu', 'komainu', 'miko', 'kami', 'shrines?', 'temples?', 'torii', 'jizo',
  'ofuda', 'omamori', 'kagura', 'gohei', 'hamaya', 'saisen', 'juzu', 'mizuhiki', 'kanzashi', 'tsuba', 'geta', 'kasa', 'kimono', 'shamisen',
  'koto', 'taiko', 'shakuhachi', 'sakura', 'iai', 'Raijin', 'samurai',
].join('|') + ')\\b', 'i');
// bible 6.2, the Echowake words retired only as written: Trial (as the difficulty), Hall (the meta hub), Setlist (the story heading), the
// Great Song and the Singer (the creator), the Conductor and the Damper (the bosses), Play on (the button) and the end-screen kickers
const ECHO_CS = /\b(Trials?|Hall|Setlist|Great Song|the Singer|the Conductor|the Damper|Play on|INTRO|OUTRO|INTERLUDE)\b/;
// bible 6.2, the Echowake Spell names: retired as the name, title or label of anything (lowercase chorus and hum stay in prose, bible 6.4)
const OLD_SPELL = /\b(Drum Line|Ripple|Shout|Beat Drop|Chorus|Hum)\b/;
const NAME_KEYS = new Set(['name', 'title', 'label']);
const leak = (s) => hit(RETIRED, s) || hit(TALE, s) || hit(ECHO_CI, s) || hit(ECHO_CS, s);
// Check 6 (rescoped in P1, 1F). The Echowake suite banned lowercase "song" everywhere in UI and rules text, because the map tool was a
// Song there and "the song" was the world. In Hocus Vocus the map tool is a Spell and the lowercase words are allowed survivors in prose
// (bible 6.4), so a blanket ban would fail honest sentences. What must never come back is "Song" as a MAP TOOL, and that lives in the
// names and texts of tiles, Spells, keywords and statuses and in the rules-text scripts, where any case of song or songs is a leak.
const SONG_TOOL = /\bsongs?\b/i;
const SONG_REG = new Set(['tiles', 'brushes', 'keywords', 'statuses']);
const SONG_KEYS = new Set(['name', 'text']);
const SONG_SCRIPTS = new Set(['data_text.js', 'run.js', 'meta.js']);         // the generated rules text and the run log lines

// ------------------------------------------------------------------ the allowlist (plan 8.3, bible 6.4): [exact string, reason]
// Hocus Vocus P2 dropped the Echowake entries whose strings are gone from the game (the paper folk crafts, the credits line, the
// storyteller Detour, Blank Stare and Bounty Scroll); the liveness test below keeps the list from going stale again.
const ALLOW_EXACT = [
  ['Pages', 'How to play pagination label (screen_menu.js), generic help pagination, kept by Appendix B 3.6 and bible 6.4 (the how-to pagination word page)'],
  ['Page ', 'How to play pagination label (screen_menu.js), generic help pagination (bible 6.4)'],
  ['How to play pages', 'How to play pagination (aria label, bible 6.4)'],
  ['How to play, page ', 'How to play pagination (screen_menu.js, bible 6.4)'],
  ['This is the first page', 'How to play pagination (screen_menu.js, bible 6.4)'],
  ['Limited Edition', 'bible 6.4: Encore trial_7, a merch print run, not an Inkwoven book word (DATA.trials.trial_7.name)'],
  // CSS classes and developer messages that happen to read as prose (plan 5.11: a CSS class never changes)
  ['ev-page left', 'CSS class list in screen_node.js (event stage), never player-facing; classes keep their names (plan 5.11)'],
  ['ev-page right', 'CSS class list in screen_node.js (event stage), never player-facing; classes keep their names (plan 5.11)'],
  ['st-page vc-page', 'CSS class list in screen_end.js (story and victory panel), never player-facing; classes keep their names (plan 5.11)'],
  [' paint', 'developer warning suffix in screen_node.js warnOnce(S.kind + \' paint\'): the name of the canvas paint method, logged to the console only'],
];
// the only non-exact entries: [substring, reason], checked against DATA fields only (none today; bible 6.4 survivors go here when a
// survivor sits inside a longer DATA sentence)
const ALLOW_CONTAINS = [];
const exactSet = new Map(ALLOW_EXACT);
const allowedExact = (s) => exactSet.has(s);
const allowedData = (s) => allowedExact(s) || ALLOW_CONTAINS.some(([sub]) => s.includes(sub));
const fail = (bad, what) => `${bad.length} ${what}:\n  ${bad.slice(0, 60).join('\n  ')}${bad.length > 60 ? `\n  ... and ${bad.length - 60} more` : ''}`;
const hit = (re, s) => { const m = re.exec(s); return m ? m[0] : null; };
const abbrev = (s) => (s.length > 90 ? s.slice(0, 87) + '...' : s);

// ------------------------------------------------------------------ boot the content and text scripts
const g = boot({ only: ['util', 'data', 'data_cards_shared', 'data_cards_hanae', 'data_cards_kuro', 'data_cards_raiga', 'data_cards_suzu', 'data_enemies_1', 'data_enemies_2', 'data_enemies_3', 'data_events', 'data_gems', 'data_meta', 'data_relics', 'data_text'] });
t.ok(!g._errors || g._errors.length === 0, 'content scripts load without errors: ' + JSON.stringify(g._errors));
const D = g.DATA;

// ------------------------------------------------------------------ check 1: DATA display fields
// Every string whose key is a display field, anywhere inside a registry. Ids, ops, tags and art names are never display fields.
const DISPLAY_KEYS = new Set(['name', 'title', 'flavor', 'text', 'lore', 'say', 'label', 'blurb']);
const REGISTRIES = ['cards', 'gems', 'relics', 'enemies', 'events', 'achievements', 'trials', 'lore', 'tiles', 'brushes', 'keywords', 'statuses', 'heroes'];
const fields = [];          // { path, text, reg, key }
const collect = (o, p, reg, key) => {
  if (typeof o === 'string') { fields.push({ path: p, text: o, reg, key }); return; }
  if (!o || typeof o !== 'object') return;
  for (const k of Object.keys(o)) {
    const kid = Array.isArray(o) ? key : k;
    const here = p + (Array.isArray(o) ? `[${k}]` : '.' + k);
    const v = o[k];
    if (typeof v === 'string') {
      const shown = DISPLAY_KEYS.has(kid) || (Array.isArray(o) && (p.includes('.lines.') || reg === 'lore') && DISPLAY_KEYS.has(key)) || (Array.isArray(o) && /\.lines\.\w+$/.test(p));
      const eventCost = reg === 'events' && k === 'cost';
      if (shown || eventCost) fields.push({ path: here, text: v, reg, key: kid });
    } else collect(v, here, reg, kid);
  }
};
for (const reg of REGISTRIES) for (const id of Object.keys(D[reg] || {})) collect(D[reg][id], `DATA.${reg}.${id}`, reg, '');
for (const id of Object.keys(D.tips || {})) fields.push({ path: `DATA.tips.${id}`, text: D.tips[id], reg: 'tips', key: 'tip' });
// tips may be a string or an object with text
for (const f of fields.slice()) if (f.reg === 'tips' && typeof f.text !== 'string') { fields.splice(fields.indexOf(f), 1); collect(f.text, f.path, 'tips', ''); }

t.test('the DATA walk found the display fields it should (guards the walker itself)', () => {
  const by = {};
  for (const f of fields) by[f.reg] = (by[f.reg] || 0) + 1;
  for (const [reg, min] of Object.entries({ cards: 250, gems: 20, relics: 100, enemies: 300, events: 200, achievements: 60, trials: 20, lore: 20, tiles: 20, brushes: 10, keywords: 20, statuses: 30, heroes: 14, tips: 20 })) t.ok((by[reg] || 0) >= min, `DATA.${reg} contributed ${by[reg] || 0} display strings, expected at least ${min}`);
  t.ok(fields.some((f) => /\.lines\.start\[/.test(f.path)), 'bark lines are walked');
  t.ok(fields.some((f) => /\.phases\[\d+\]\.say$/.test(f.path)), 'enemy phase say is walked');
  t.ok(fields.some((f) => /\.out\[\d+\]\.text$/.test(f.path)), 'event outcome text is walked');
  t.ok(fields.some((f) => /\.choices\[\d+\]\.cost$/.test(f.path)), 'event choice cost is walked');
  t.ok(fields.some((f) => /^DATA\.heroes\.\w+\.passives\[\d+\]\.name$/.test(f.path)), 'hero passive names are walked');
});
t.test('check 1: no retired word (bible 6.2 and 6.3) in any DATA display field', () => {
  const bad = [];
  for (const f of fields) {
    if (allowedData(f.text)) continue;
    const w = leak(f.text) || (NAME_KEYS.has(f.key) ? hit(OLD_SPELL, f.text) : null);
    if (w) bad.push(`${f.path}: "${w}" in "${abbrev(f.text)}"`);
  }
  t.eq(bad.length, 0, fail(bad, 'retired words in DATA'));
});
t.test('check 6 (data half): no "song" in the names and texts of tiles, Spells, keywords and statuses', () => {
  const bad = [];
  let seen = 0;
  for (const f of fields) {
    if (!SONG_REG.has(f.reg) || !SONG_KEYS.has(f.key)) continue;
    seen++;
    if (allowedData(f.text)) continue;
    const w = hit(SONG_TOOL, f.text);
    if (w) bad.push(`${f.path}: "${w}" in "${abbrev(f.text)}"`);
  }
  t.ok(seen >= 100, `the rescoped walk reached ${seen} names and texts of tiles, Spells, keywords and statuses, expected at least 100 (guards the scope itself)`);
  t.eq(bad.length, 0, fail(bad, '"song" in the name or text of a tile, Spell, keyword or status (the map tool is a Spell, bible 4.5)'));
});

// ------------------------------------------------------------------ check 2: string and template literals of the UI scripts
const UI_FILES = ['data_text.js', 'run.js', 'meta.js', 'ui.js', 'main.js', 'scene.js', 'screen_map.js', 'screen_menu.js', 'screen_node.js', 'screen_combat.js', 'screen_end.js', 'tutorial.js'];
const unq = (v) => v.slice(1, -1).replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, ' ');
// every string literal and template literal of a source, with ${...} replaced by X; returns { text, s, line }
function literals(src) {
  const toks = tokenizeJs(src).filter((k) => k.t !== 'comment');
  const out = [];
  const stack = [];
  const before = (idx) => {                // the code token just before a literal, skipping "(" tokens
    let j = idx - 1;
    while (j >= 0 && toks[j].t === 'punct' && toks[j].v === '(') j--;
    return j;
  };
  const devMsg = (idx) => {
    const j = before(idx);
    if (j < 0) return false;
    const k = toks[j];
    if (k.t === 'id' && (k.v === 'Error' || k.v === 'err')) return true;           // new Error(...), err(...)
    if (k.t === 'id' && j >= 2 && toks[j - 1].v === '.' && toks[j - 2].v === 'console') return true;
    return false;
  };
  toks.forEach((k, i) => {
    if (k.t === 'str') out.push({ text: unq(k.v), s: k.s, dev: devMsg(i) });
    else if (k.t === 'tplHead') stack.push({ text: k.v.slice(1, -2), s: k.s, dev: devMsg(i) });
    else if (k.t === 'tplMid') { const top = stack[stack.length - 1]; if (top) top.text += 'X' + k.v.slice(1, -2); }
    else if (k.t === 'tplTail') { const top = stack.pop(); if (top) { top.text += 'X' + k.v.slice(1, -1); out.push(top); } }
  });
  return out;
}
const isProse = (s) => /\s/.test(s) && /[A-Za-z]/.test(s) && !/^[.#\[<]/.test(s);
const proseLits = [];       // { file, text, line }
for (const f of UI_FILES) {
  const full = path.join(DIR, 'js', f);
  if (!fs.existsSync(full)) continue;
  const src = fs.readFileSync(full, 'utf8');
  for (const l of literals(src)) {
    if (l.dev) continue;
    const text = l.text.replace(/\\u[0-9a-fA-F]{4}/g, ' ');
    if (isProse(text)) proseLits.push({ file: f, text, line: lineOf(src, l.s) });
  }
}
t.test('the literal walk found the UI strings it should (guards the tokenizer use)', () => {
  t.ok(proseLits.length > 800, `only ${proseLits.length} prose literals found in the UI scripts`);
  const files = new Set(proseLits.map((l) => l.file));
  for (const f of UI_FILES) if (fs.existsSync(path.join(DIR, 'js', f))) t.ok(files.has(f), `no prose literal found in ${f}`);
});
t.test('check 2: no retired word (bible 6.2 and 6.3) or "tale" in any prose literal of the UI scripts', () => {
  const bad = [];
  for (const l of proseLits) {
    if (allowedExact(l.text)) continue;
    const w = leak(l.text);
    if (w) bad.push(`js/${l.file}:${l.line}: "${w}" in "${abbrev(l.text)}"`);
  }
  t.eq(bad.length, 0, fail(bad, 'retired words in UI string literals'));
});
t.test('check 6 (code half): no "song" in the rules-text scripts (data_text.js, run.js, meta.js)', () => {
  // The screen scripts may now say song or chorus in prose (bible 6.4), so only the scripts that print rules text and the run log are scanned.
  const bad = [];
  let seen = 0;
  for (const l of proseLits) {
    if (!SONG_SCRIPTS.has(l.file)) continue;
    seen++;
    if (allowedExact(l.text)) continue;
    const w = hit(SONG_TOOL, l.text);
    if (w) bad.push(`js/${l.file}:${l.line}: "${w}" in "${abbrev(l.text)}"`);
  }
  t.ok(seen >= 100, `the rescoped walk reached ${seen} prose literals of the rules-text scripts, expected at least 100 (guards the scope itself)`);
  t.eq(bad.length, 0, fail(bad, '"song" in a rules-text literal (the map tool is a Spell, bible 4.5; say Spell)'));
});
t.test('check 2 (markup literals): visible text inside HTML string literals passes too', () => {
  // Literals that start with "<" are skipped by the rule above; here their tags are stripped and the remaining text is checked.
  const bad = [];
  for (const f of UI_FILES) {
    const full = path.join(DIR, 'js', f);
    if (!fs.existsSync(full)) continue;
    const src = fs.readFileSync(full, 'utf8');
    for (const l of literals(src)) {
      if (l.dev || !/^</.test(l.text)) continue;
      const text = l.text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      if (!isProse(text) || allowedExact(text)) continue;
      const w = leak(text);          // lowercase song is allowed in prose now (bible 6.4); check 6 owns the map tool
      if (w) bad.push(`js/${f}:${lineOf(src, l.s)}: "${w}" in "${abbrev(text)}"`);
    }
  }
  t.eq(bad.length, 0, fail(bad, 'retired words in HTML string literals'));
});

// ------------------------------------------------------------------ check 3: the two pages
t.test('check 3: index.html and gallery.html text passes the retired words (bible 6.2 and 6.3)', () => {
  const bad = [];
  for (const file of ['index.html', 'gallery.html']) {
    const html = fs.readFileSync(path.join(DIR, file), 'utf8');
    const parts = [];
    const title = /<title>([\s\S]*?)<\/title>/.exec(html);
    if (title) parts.push(['<title>', title[1]]);
    for (const m of html.matchAll(/<noscript>([\s\S]*?)<\/noscript>/g)) parts.push(['<noscript>', m[1]]);
    for (const m of html.matchAll(/<div id="boot">([\s\S]*?)<\/div>/g)) parts.push(['boot splash', m[1].replace(/<[^>]*>/g, ' ')]);
    for (const m of html.matchAll(/<meta name="description" content="([^"]*)"/g)) parts.push(['meta description', m[1]]);
    for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) for (const l of literals(m[1])) if (!l.dev && isProse(l.text)) parts.push(['inline script', l.text]);
    for (const [where, text] of parts) {
      if (allowedExact(text.trim())) continue;
      const w = leak(text);
      if (w) bad.push(`${file} ${where}: "${w}" in "${abbrev(text.trim())}"`);
    }
  }
  t.eq(bad.length, 0, fail(bad, 'retired words in the page shells'));
  const idx = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
  t.eq((/<title>([\s\S]*?)<\/title>/.exec(idx) || [])[1], 'HOCUS VOCUS: A Vocal Magic Adventure', 'index.html <title> (bible 1.2, HV_PHASES P2)');
});
t.test('check 3: the shell pages say HOCUS VOCUS somewhere a player sees it', () => {
  const idx = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
  t.ok(/<div id="boot"><b>HOCUS VOCUS<\/b>/.test(idx), 'boot splash names HOCUS VOCUS');
  t.ok(/<noscript>[^<]*Hocus Vocus[^<]*<\/noscript>/.test(idx), 'noscript names Hocus Vocus');
});

// ------------------------------------------------------------------ check 4: policy D8, the seven kept sfx ids
t.test('check 4: the sfx list keeps the seven legacy ids (a half-done rename must fail here)', () => {
  const sfx = D.LISTS.sfx;
  t.ok(sfx.length >= 73, `LISTS.sfx has ${sfx.length} entries, expected 73 or more (74 is legal with the optional hush sfx appended last)`);
  t.ok(sfx.length <= 74, `LISTS.sfx has ${sfx.length} entries, expected at most 74`);
  for (const id of ['paint', 'ink_splash', 'brush_pick', 'brush_use', 'ink_gain', 'well', 'page_turn']) t.ok(sfx.includes(id), `LISTS.sfx keeps the internal id "${id}" (plan D8)`);
});

// ------------------------------------------------------------------ check 5 (optional): the four docs, outside backticks
t.test('check 5: README, DESIGN, ART_BIBLE and CONTENT_SPEC pass RETIRED outside backticks', () => {
  const bad = [];
  for (const f of ['README.md', 'DESIGN.md', 'ART_BIBLE.md', 'CONTENT_SPEC.md']) {
    const full = path.join(DIR, f);
    if (!fs.existsSync(full)) { bad.push(`${f}: missing`); continue; }
    let src = fs.readFileSync(full, 'utf8').replace(/```[\s\S]*?```/g, (m) => m.replace(/[^\n]/g, ' '));
    // DESIGN.md sections 1.1 onward are the module contract: they keep the internal ids and API vocabulary on purpose (D8, DESIGN 1.1)
    if (f === 'DESIGN.md') { const cut = src.indexOf('### 1.1 '); if (cut > 0) src = src.slice(0, cut); }
    src.split('\n').forEach((line, i) => {
      // "Sumi-Shonen" is the art style's name in the docs and stays (the line style is unchanged by the re-theme)
      const prose = line.replace(/`[^`]*`/g, ' ').replace(/https?:\/\/\S+/g, ' ').replace(/Sumi-Shonen/g, ' ');
      if (allowedExact(prose.trim())) return;
      const w = hit(RETIRED, prose);          // the Inkwoven list only: the Echowake words join here when P10 rewrites the docs
      if (w) bad.push(`${f}:${i + 1}: "${w}" in "${abbrev(prose.trim())}"`);
    });
  }
  t.eq(bad.length, 0, fail(bad, 'retired words in the docs'));
});

// ------------------------------------------------------------------ check 7: CSS content strings, and the word "run" (a run is a tour, bible 1.3; the musical and verb senses are allowed below)
const RUN_WORD = /\b[Rr]uns?\b/;
// exact survivors of the word "run" in player-facing prose, each with a reason (the verb, never the noun)
const RUN_ALLOW = [
  ['Runs away', 'verb: the Flee intent tooltip in screen_menu.js (a creature that runs away)'],
  ['Nowhere to run!', 'verb: an enemy shout in scene.js (to flee), never the noun'],
];
// DATA fields (world text) may keep the verb inside these exact phrases: [phrase, reason]
const RUN_ALLOW_CONTAINS = [
  ['run out of nothing', 'verb: to be exhausted, "It has run out of nothing." (events.weeping_eraser, HV_STORY 2.4)'],
  // Hocus Vocus (P1, 1F): the musical sense of run (a quick run of notes) and the verb, never the noun for a tour (bible 1.3: a run is a "tour")
  ['Vocal Run', 'music: the Spell name, a fast run of sung notes (DATA.brushes.wave, bible 4.5); a reserved name'],
  ['vocal runs', 'music: runs of sung notes, in Jasmin\'s blurb and cards (DATA.heroes.hanae.blurb, bible 3.1)'],
  ['Run It Again', 'verb: to run a phrase through once more, a card name (DATA.cards.hanae_whetstone.name, HV_HEROES 2.1)'],
  ['it runs out of puff', 'verb: to be exhausted (DATA.enemies.kappa.lore, HV_ENEMIES 2)'],
  ['has run Blossom Bay', 'verb: to operate, the open mic Kraki hosts (DATA.enemies.boss_kuzunoha.lore, bible 2.4)'],
  ['strings run to every phone', 'verb: to extend (DATA.enemies.puppet_master.lore, HV_ENEMIES 4)'],
  // Hocus Vocus (P2, the lead): the verb and the musical sense in the Detours and the Tour Diary (HV_STORY 2 and 3)
  ['runs a lemonade stand', 'verb: to operate, the very serious child (events.tanuki_tea_house text, HV_STORY 2.2)'],
  ['a lemonade stand run by', 'verb: to operate, past participle, the same child (lore.ch1_intro text, HV_STORY 3.2)'],
  ['a soft little run', 'music: a quick run of sung notes, Jasmin answering the gull (events.tengu_dice, bible 7.4 lists run in her words)'],
  ['Run after it', 'verb: to chase on foot, the choice label (events.lantern_ferry, HV_STORY 2.3)'],
  ['You run behind it through the rain', 'verb: to chase on foot (events.lantern_ferry outcomes, HV_STORY 2.3)'],
  ['is run by a clicking little algorithm', 'verb: to operate, passive (events.endless_supper, HV_STORY 2.3)'],
  ['It runs right under the stage', 'verb: to extend, the service corridor (events.fox_at_the_gate, HV_STORY 2.4)'],
];
const RUN_ALLOW_CLASS = [['mn-p-run empty', 'CSS class list in screen_menu.js, never player-facing; classes keep their names (plan 5.11)']];
const runAllowed = (s) => RUN_ALLOW.concat(RUN_ALLOW_CLASS).some(([a]) => a === s);
const runAllowedData = (s) => runAllowed(s) || RUN_ALLOW_CONTAINS.some(([a]) => s.includes(a));
t.test('check 7a: CSS content strings pass the retired words (bible 6.2 and 6.3) and the run rule', () => {
  const bad = [];
  const dir = path.join(DIR, 'css');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.css'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
    const re = /\bcontent\s*:\s*("([^"\\]|\\.)*"|'([^'\\]|\\.)*')/g;
    let m;
    while ((m = re.exec(src))) {
      const text = m[1].slice(1, -1).replace(/\\[0-9a-fA-F]{1,6}\s?/g, ' ').replace(/\\(.)/g, '$1');
      if (!text.trim() || allowedExact(text)) continue;
      const w = leak(text) || hit(RUN_WORD, text);
      if (w) bad.push(`css/${f}:${lineOf(src, m.index)}: "${w}" in "${abbrev(text)}"`);
    }
  }
  t.eq(bad.length, 0, fail(bad, 'retired words or "run" in CSS content strings'));
});
t.test('check 7b: the standalone word run or runs is gone from player-facing prose (a run is a tour; the musical and verb senses are allowlisted)', () => {
  const bad = [];
  for (const f of fields) {
    if (runAllowedData(f.text)) continue;
    const w = hit(RUN_WORD, f.text);
    if (w) bad.push(`${f.path}: "${w}" in "${abbrev(f.text)}"`);
  }
  for (const l of proseLits) {
    if (runAllowed(l.text)) continue;
    const w = hit(RUN_WORD, l.text);
    if (w) bad.push(`js/${l.file}:${l.line}: "${w}" in "${abbrev(l.text)}"`);
  }
  t.eq(bad.length, 0, fail(bad, 'the word "run" in player-facing text (say tour, or allowlist a verb or musical use with its reason)'));
});
t.test('the run allowlist is small and every entry has a reason', () => {
  for (const [s, why] of RUN_ALLOW.concat(RUN_ALLOW_CLASS, RUN_ALLOW_CONTAINS)) { t.ok(s.length > 0, 'run allowlist string'); t.ok(why.length > 10, `reason for "${s}"`); }
});

// ------------------------------------------------------------------ the allowlist itself
t.test('the allowlist is small, exact and every entry has a reason', () => {
  for (const [s, why] of [...ALLOW_EXACT, ...ALLOW_CONTAINS]) { t.ok(typeof s === 'string' && s.length > 0, 'allowlist string'); t.ok(typeof why === 'string' && why.length > 10, `reason for "${s}"`); }
  t.eq(ALLOW_EXACT.length + ALLOW_CONTAINS.length, 10, 'allowlist size (add an entry only with the plan 3.2 or bible 6.4 reason)');
  t.eq(new Set(ALLOW_EXACT.map((e) => e[0])).size, ALLOW_EXACT.length, 'no duplicate allowlist entries');
});
t.test('every allowlist entry is still in use (a stale entry would let the word come back unseen)', () => {
  // exact entries must equal a DATA display field or a string literal of a UI script; contains entries must sit inside a DATA field
  const lits = new Set(fields.map((f) => f.text));
  for (const f of UI_FILES) {
    const full = path.join(DIR, 'js', f);
    if (fs.existsSync(full)) for (const l of literals(fs.readFileSync(full, 'utf8'))) lits.add(l.text);
  }
  for (const [s] of ALLOW_EXACT.concat(RUN_ALLOW, RUN_ALLOW_CLASS)) t.ok(lits.has(s), `allowlist entry "${s}" matches no DATA field or UI literal any more: drop it`);
  for (const [s] of ALLOW_CONTAINS.concat(RUN_ALLOW_CONTAINS)) t.ok(fields.some((f) => f.text.includes(s)), `allowlist entry "${s}" is in no DATA field any more: drop it`);
});

t.done();
