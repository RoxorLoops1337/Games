// THEME: the permanent theme-leak suite (ECHO_PLAN 8.3). The game was re-themed from INKWOVEN (a living book) to ECHOWAKE (a land that
// sings, a Hush that swallows calls). This suite fails loudly, with a field path and the offending word, whenever an old word comes
// back into player-facing text. It is also the re-grep to run after merging origin/main (squash merges resurrect old copy).
//
// Checks: 1 every DATA display field passes RETIRED, 2 every prose string and template literal of the UI scripts passes RETIRED and TALE,
// 3 index.html and gallery.html text, 4 the seven kept sfx ids (policy D8), 5 the four docs outside backticks, 6 lowercase "song" is
// banned in UI and rules strings (lore pages, barks, events, enemies and card flavour are exempt: there "the song" is the world).
// It never reads rogue_book/ECHO_PLAN.md (the plan quotes every old word on purpose).
import fs from 'node:fs';
import path from 'node:path';
import { boot, harness, DIR, tokenizeJs, lineOf } from './rogue_book_lib.mjs';

const t = harness('rogue_book theme');

const RETIRED = /\b(Ink|Inks|Inkstones?|Inkweaver|Inkwoven|INKWOVEN|Brush(es)?|brush(es)?|[Pp]aint(s|ed|ing)?|Blank|Daily Tale|Ink Trials?|Library|Author|Editor|Eraser|Sumi|Bookmark|Unwritten|Chapter|chapter|storybook|[Bb]ooks?|[Pp]ages?|quill|calligraph\w*|manuscript|ink)\b/;
const TALE = /\b[Tt]ales?\b/;
const SONG_LC = /\bsong\b/;                      // case sensitive: "Song", "Songs", "SONG" and "songs" pass

// ------------------------------------------------------------------ the allowlist (plan 8.3): [exact string, reason]
const ALLOW_EXACT = [
  ['Pages', 'How to play pagination label (screen_menu.js), generic help pagination, kept by Appendix B 3.6'],
  ['Page ', 'How to play pagination label (screen_menu.js), generic help pagination'],
  ['How to play pages', 'How to play pagination (aria label)'],
  ['How to play, page ', 'How to play pagination (screen_menu.js)'],
  ['This is the first page', 'How to play pagination (screen_menu.js)'],
  ['Drawn in ink, sung in code. No two journeys alike.', 'credits line: "ink" is the drawing style'],
  ['Paper Puppet', 'folk craft (never matches RETIRED anyway, listed so nobody "fixes" it)'],
  ['Paper Crane', 'folk craft (never matches RETIRED anyway, listed so nobody "fixes" it)'],
  ['Oil-Paper Umbrella', 'folk craft (never matches RETIRED anyway, listed so nobody "fixes" it)'],
  ['A Sea of Paper Boats', 'folk craft (never matches RETIRED anyway, listed so nobody "fixes" it)'],
  ['A Thousand Paper Cranes', 'folk craft (never matches RETIRED anyway, listed so nobody "fixes" it)'],
  ['Paper Seal', 'folk craft, Suzu paper talisman (never matches RETIRED anyway, listed so nobody "fixes" it)'],
  // CSS classes and developer messages that happen to read as prose (plan 5.11: a CSS class never changes)
  ['ev-page left', 'CSS class list in screen_node.js (event stage), never player-facing; classes keep their names (plan 5.11)'],
  ['ev-page right', 'CSS class list in screen_node.js (event stage), never player-facing; classes keep their names (plan 5.11)'],
  ['st-page vc-page', 'CSS class list in screen_end.js (story and victory panel), never player-facing; classes keep their names (plan 5.11)'],
  [' paint', 'developer warning suffix in screen_node.js warnOnce(S.kind + \' paint\'): the name of the canvas paint method, logged to the console only'],
  ["A storyteller sits under a paper umbrella and pats the mat beside her. 'A tale for a coin,' she says, 'or a coin for a tale. I am flexible about the direction.'", 'DATA events.wandering_storyteller.text: "tale" meaning a folk tale told aloud, an allowed survivor (plan 3.2); never the world, never a run'],
];
// the only non-exact entries: [substring, reason], checked against DATA fields only
const ALLOW_CONTAINS = [
  ['Blank Stare', 'a generic idiom (nopperabo), plan 3.2'],
  ['Bounty Scroll', 'a bounty notice, plan 3.2'],
];
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
// registries whose strings are UI and rules text (check 6 applies), as opposed to world text (lore pages, barks, events, enemies, card flavour)
const UI_REG = new Set(['gems', 'relics', 'achievements', 'trials', 'tiles', 'brushes', 'keywords', 'statuses', 'heroes']);
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
t.test('check 1: no retired word in any DATA display field', () => {
  const bad = [];
  for (const f of fields) {
    if (allowedData(f.text)) continue;
    const w = hit(RETIRED, f.text) || hit(TALE, f.text);
    if (w) bad.push(`${f.path}: "${w}" in "${abbrev(f.text)}"`);
  }
  t.eq(bad.length, 0, fail(bad, 'retired words in DATA'));
});
t.test('check 6 (data half): no lowercase "song" in UI and rules text', () => {
  const bad = [];
  for (const f of fields) {
    if (!(UI_REG.has(f.reg) || f.reg === 'tips')) continue;
    if (f.reg === 'heroes' && f.key !== 'title' && f.key !== 'blurb' && f.key !== 'name') continue;
    if (allowedData(f.text)) continue;
    const w = hit(SONG_LC, f.text);
    if (w) bad.push(`${f.path}: lowercase "${w}" in "${abbrev(f.text)}"`);
  }
  t.eq(bad.length, 0, fail(bad, 'lowercase "song" in UI or rules text (the world is "the land" there; plan rule 0.8)'));
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
t.test('check 2: no retired word or "tale" in any prose literal of the UI scripts', () => {
  const bad = [];
  for (const l of proseLits) {
    if (allowedExact(l.text)) continue;
    const w = hit(RETIRED, l.text) || hit(TALE, l.text);
    if (w) bad.push(`js/${l.file}:${l.line}: "${w}" in "${abbrev(l.text)}"`);
  }
  t.eq(bad.length, 0, fail(bad, 'retired words in UI string literals'));
});
t.test('check 6 (code half): no lowercase "song" in UI prose literals', () => {
  const bad = [];
  for (const l of proseLits) {
    if (allowedExact(l.text)) continue;
    const w = hit(SONG_LC, l.text);
    if (w) bad.push(`js/${l.file}:${l.line}: lowercase "${w}" in "${abbrev(l.text)}"`);
  }
  t.eq(bad.length, 0, fail(bad, 'lowercase "song" in UI literals (say "the land"; plan rule 0.8)'));
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
      const w = hit(RETIRED, text) || hit(TALE, text) || hit(SONG_LC, text);
      if (w) bad.push(`js/${f}:${lineOf(src, l.s)}: "${w}" in "${abbrev(text)}"`);
    }
  }
  t.eq(bad.length, 0, fail(bad, 'retired words in HTML string literals'));
});

// ------------------------------------------------------------------ check 3: the two pages
t.test('check 3: index.html and gallery.html text passes RETIRED and TALE', () => {
  const bad = [];
  for (const file of ['index.html', 'gallery.html']) {
    const html = fs.readFileSync(path.join(DIR, file), 'utf8');
    const parts = [];
    const title = /<title>([\s\S]*?)<\/title>/.exec(html);
    if (title) parts.push(['<title>', title[1]]);
    for (const m of html.matchAll(/<noscript>([\s\S]*?)<\/noscript>/g)) parts.push(['<noscript>', m[1]]);
    for (const m of html.matchAll(/<div id="boot">([\s\S]*?)<\/div>/g)) parts.push(['boot splash', m[1].replace(/<[^>]*>/g, ' ')]);
    for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) for (const l of literals(m[1])) if (!l.dev && isProse(l.text)) parts.push(['inline script', l.text]);
    for (const [where, text] of parts) {
      if (allowedExact(text.trim())) continue;
      const w = hit(RETIRED, text) || hit(TALE, text);
      if (w) bad.push(`${file} ${where}: "${w}" in "${abbrev(text.trim())}"`);
    }
  }
  t.eq(bad.length, 0, fail(bad, 'retired words in the page shells'));
  const idx = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
  t.eq((/<title>([\s\S]*?)<\/title>/.exec(idx) || [])[1], 'ECHOWAKE: a rogue ballad', 'index.html <title>');
});
t.test('check 3: the shell pages say ECHOWAKE somewhere a player sees it', () => {
  const idx = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
  t.ok(/<div id="boot"><b>ECHOWAKE<\/b>/.test(idx), 'boot splash names ECHOWAKE');
  t.ok(/<noscript>[^<]*Echowake[^<]*<\/noscript>/.test(idx), 'noscript names Echowake');
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
      const w = hit(RETIRED, prose);
      if (w) bad.push(`${f}:${i + 1}: "${w}" in "${abbrev(prose.trim())}"`);
    });
  }
  t.eq(bad.length, 0, fail(bad, 'retired words in the docs'));
});

// ------------------------------------------------------------------ check 7: CSS content strings, and the word "run" (plan 3: a run is a journey)
const RUN_WORD = /\b[Rr]uns?\b/;
// exact survivors of the word "run" in player-facing prose, each with a reason (the verb, never the noun)
const RUN_ALLOW = [
  ['Runs away', 'verb: the Flee intent tooltip in screen_menu.js (a creature that runs away)'],
  ['Nowhere to run!', 'verb: an enemy shout in scene.js (to flee), never the noun'],
];
// DATA fields (world text) may keep the verb inside these exact phrases: [phrase, reason]
const RUN_ALLOW_CONTAINS = [
  ['runs a tea stall', 'verb: to operate (events.tanuki_tea_house)'],
  ['She runs. You run.', 'verb: to flee on foot (events.fox_returns)'],
  ['Then it runs out of breath', 'verb: to be exhausted (events.kill_your_darlings)'],
  ['Hot sound runs down your arm', 'verb: to flow (events.unfinished_sentence)'],
  ['run out of nothing', 'verb: to be exhausted (events.weeping_eraser)'],
];
const RUN_ALLOW_CLASS = [['mn-p-run empty', 'CSS class list in screen_menu.js, never player-facing; classes keep their names (plan 5.11)']];
const runAllowed = (s) => RUN_ALLOW.concat(RUN_ALLOW_CLASS).some(([a]) => a === s);
const runAllowedData = (s) => runAllowed(s) || RUN_ALLOW_CONTAINS.some(([a]) => s.includes(a));
t.test('check 7a: CSS content strings pass RETIRED, TALE and the run rule', () => {
  const bad = [];
  const dir = path.join(DIR, 'css');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.css'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
    const re = /\bcontent\s*:\s*("([^"\\]|\\.)*"|'([^'\\]|\\.)*')/g;
    let m;
    while ((m = re.exec(src))) {
      const text = m[1].slice(1, -1).replace(/\\[0-9a-fA-F]{1,6}\s?/g, ' ').replace(/\\(.)/g, '$1');
      if (!text.trim() || allowedExact(text)) continue;
      const w = hit(RETIRED, text) || hit(TALE, text) || hit(RUN_WORD, text);
      if (w) bad.push(`css/${f}:${lineOf(src, m.index)}: "${w}" in "${abbrev(text)}"`);
    }
  }
  t.eq(bad.length, 0, fail(bad, 'retired words or "run" in CSS content strings'));
});
t.test('check 7b: the standalone word run or runs is gone from player-facing prose (a run is a journey)', () => {
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
  t.eq(bad.length, 0, fail(bad, 'the word "run" in player-facing text (say journey)'));
});
t.test('the run allowlist is small and every entry has a reason', () => {
  for (const [s, why] of RUN_ALLOW.concat(RUN_ALLOW_CLASS, RUN_ALLOW_CONTAINS)) { t.ok(s.length > 0, 'run allowlist string'); t.ok(why.length > 10, `reason for "${s}"`); }
});

// ------------------------------------------------------------------ the allowlist itself
t.test('the allowlist is small, exact and every entry has a reason', () => {
  for (const [s, why] of [...ALLOW_EXACT, ...ALLOW_CONTAINS]) { t.ok(typeof s === 'string' && s.length > 0, 'allowlist string'); t.ok(typeof why === 'string' && why.length > 10, `reason for "${s}"`); }
  t.eq(ALLOW_EXACT.length + ALLOW_CONTAINS.length, 19, 'allowlist size (add an entry only with the plan 3.2 reason)');
  t.eq(new Set(ALLOW_EXACT.map((e) => e[0])).size, ALLOW_EXACT.length, 'no duplicate allowlist entries');
});

t.done();
