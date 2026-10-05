// THEME: the permanent Hocus Vocus guard (HV_PHASES P10, agent 10B; bible 6). The game was INKWOVEN (a living book), then ECHOWAKE (a land
// that sings, a Hush that swallows calls), and is now HOCUS VOCUS: A Vocal Magic Adventure (beatboxing and vocal magic, starring RoxorLoops
// and Jasmin). This suite fails loudly, with a path or file:line and the offending word, whenever a retired word, a real name, an animal
// product, an admin word, a food remark, a death word or an American spelling comes back into player-facing text, art text or the docs.
// It is also the re-grep to run after merging origin/main (squash merges resurrect old copy). It never reads hocus_vocus/plan/ or
// hocus_vocus/ECHO_PLAN.md (the plans quote every old word on purpose).
//
// The twelve checks of HV_PHASES P10:
//   1  every DATA display field passes the lists (RETIRED_INK bible 6.3, RETIRED_ECHO bible 6.2: the Echowake words, the 20 old status
//      names, the 16 old keyword names, the 14 old tile names, the 6 old Song names, the old hero, boss and Act names, the Japanese
//      folklore words, the old sound words); `Breath` only as the energy word (`DATA.statuses.sumi.name` is `Groove`); and the map tool is
//      never a "song" (names and texts of tiles, Spells, keywords and statuses)
//   2  the prose literals of the twelve presentation scripts pass the same lists, plus `tale` and the run rule (the noun "run" for a tour is
//      banned; the verb and the musical sense pass)
//   3  index.html (title, boot splash, noscript, description, inline script) and gallery.html pass the lists and say HOCUS VOCUS
//   4  the sfx list keeps its 73 ids, including the seven legacy ids
//   5  README, DESIGN (before 1.1), ART_BIBLE and CONTENT_SPEC pass the lists outside backticks
//   6  real names (H3): no show, broadcaster, platform or surname; the five platform labels only on the one LINK_ORDER line of ui.js
//   7  animal products (H5) in DATA, UI literals and art text
//   8  admin words (H4) and food remarks (H6) in DATA and UI prose
//   9  tone words (H7): kill, die, dead, death, blood, gore, corpse, alcohol, swearing, and the Gloss is never called evil
//  10  art text: the literals passed to text drawing in js/art*.js are only the set of HV_ART_AUDIO 1 rule 7
//  11  American spellings in DATA and UI prose
//  12  CSS content strings pass the lists and the run rule
// Every check has a live self-test: a deliberately bad fixture goes through the SAME matcher function the scan uses and must be flagged (and
// a good one must pass), so a broken regex can never pass silently; the extractors (literals, markup, docs, art text) have fixture tests too.
//
// The corpora. DATA: every display field of every registry, plus the roster roles, the outfit names and the colour names, and a blind-spot
// guard (a prose-looking string stored under a key the walker does not know fails the suite). UI: every string and template literal of the
// twelve presentation scripts (data_text run meta ui main scene screen_* tutorial), developer messages (new Error, console) skipped; a literal
// is prose when it has a space and is not a class list ("row center gap", "ev-page left"), or is a one-word capitalised label or a caps hit
// word; ids and snake_case keys are never prose. Art: the text arguments of fillText, strokeText, inkText, S.text, hitWord, sfWord and
// scWall, every `text:` property and every caps-and-bang word in js/art*.js, and the `word:` hit words of scene.js; a literal inside an
// ART.sheet(...) call is gallery-only text (it passes the retired-word lists but not the closed set of painted words).
// Reading a failure: the line names the file:line (or DATA path), the offending word and the string. A REAL leak is fixed in the game or the
// docs. A false positive (an id, a pose, a CSS value, a comment) gets a NARROW fix in the matcher or the corpus builder, never a broad
// allowlist entry.
import fs from 'node:fs';
import path from 'node:path';
import { boot, harness, DIR, tokenizeJs, lineOf, scriptFiles } from './hocus_vocus_lib.mjs';

const t = harness('hocus_vocus theme');

const read = (rel) => fs.readFileSync(path.join(DIR, rel), 'utf8');
const hit = (re, s) => { const m = re.exec(s); return m ? m[0] : null; };
const abbrev = (s) => (s.length > 90 ? s.slice(0, 87) + '...' : s);
const fail = (bad, what) => `${bad.length} ${what}:\n  ${bad.slice(0, 60).join('\n  ')}${bad.length > 60 ? `\n  ... and ${bad.length - 60} more` : ''}`;

// ================================================================== the lists (bible 6.2, 6.3)
// bible 6.3, the Inkwoven words (RETIRED_INK)
const INK = /\b(Ink|Inks|Inkstones?|Inkweaver|Inkwoven|INKWOVEN|Brush(es)?|brush(es)?|[Pp]aint(s|ed|ing)?|Blank|Daily Tale|Ink Trials?|Library|library|Author|author|Editor|editor|[Ee]ditions?|Eraser|Sumi|Bookmarks?|bookmarks?|Unwritten|Chapter|chapter|storybook|[Bb]ooks?|[Pp]ages?|quill|calligraph\w*|manuscript|ink|inky|[Pp]ens?|[Nn]ibs?|[Aa]rchives?|[Rr]edacted|[Tt]ypos?|[Ss]cribbl\w*|[Ff]ootnotes?|[Mm]argins?)\b/;
// the Inkwoven world word: "tale" as a run (or a Daily Tale)
const TALE = /\b[Tt]ales?\b/;
// bible 6.2, the Echowake words, in any case (RETIRED_ECHO)
const ECHO_CI = new RegExp('\\b(' + [
  'Echowake', 'rogue ballad', 'echo(es|ed|ing)?', 'hush(ed)?', 'chimes?', 'ballads?', 'keepers?', 'fables?', 'tempo trials?', 'daily jam',
  'verses?', 'songbirds?', 'songweavers?', 'drum line', 'beat drop', 'temple bells?', 'tuning forge', 'downbeat', 'dead silence',
  'champions?', 'peddlers?', 'campfires?', 'ambush(es)?', 'gem cache', 'treasures?', 'wakes?', 'woken?', 'waking', 'awake',
  'silent ground', 'heard from afar', 'journeys?', 'the land',
  // the Echowake cast, titles, passives, Keepers, Acts and the Verses
  'Hanae', 'Kuro', 'Suzu', 'Raiga', 'Blossom Blade', 'Moon Miko', 'Thunder Monk', 'Steady Breath', 'Blade Flow', 'Moonlit Rite', 'Storm Born',
  'Kuzunoha', 'Nine-Voiced Fox', 'Jorogumo', 'Silk Courtesan', 'Hollow Kodama', 'Keeper of the Last Note', 'Whispering Bamboo Grove',
  'Sunken Lantern City', 'Thunderless Citadel',
  // the Echowake screen labels
  'joins the band', 'liner notes?', 'a note from the road', 'the final chorus', 'a rest in the music', 'the song fades', 'a voice of the song',
  // the Japanese folklore setting
  'yokai', 'yamabiko', 'kodama', 'kappa', 'tanuki', 'oni', 'tengu', 'kitsune', 'karakasa', 'hitodama', 'chochin', 'karakuri', 'nopperabo',
  'tsukumogami', 'nure-onna', 'rokurokubi', 'ittan-momen', 'umibozu', 'komainu', 'miko', 'kami', 'shrines?', 'temples?', 'torii', 'jizo',
  'ofuda', 'omamori', 'kagura', 'gohei', 'hamaya', 'saisen', 'juzu', 'mizuhiki', 'kanzashi', 'tsuba', 'geta', 'kasa', 'kimono', 'shamisen',
  'koto', 'taiko', 'shakuhachi', 'sakura', 'iai', 'Raijin', 'samurai',
].join('|') + ')\\b', 'i');
// bible 6.2, the Echowake words retired only as written (their lowercase form is plain English): Trial (the difficulty), Hall (the meta hub),
// Setlist (the story heading), the Great Song and the Singer (the creator), the Conductor and the Damper (the bosses), Play on (the button)
// and the old end-screen kickers
const ECHO_CS = /\b(Trials?|Hall|Setlist|Great Song|the Singer|the Conductor|the Damper|Conductor|Damper|Play on|INTRO|OUTRO|INTERLUDE)\b/;
// bible 4.3 and 4.2, the old status and keyword NAMES. Several are plain English in lowercase (weak, charge, mark, might), so only the
// capitalised name is retired: lowercase "weak" or "might" in a sentence is just a word. Bloom, Breath, Block, Swap, Gem and Unplayable
// survive (bible 6.4) and are not here.
const OLD_NAME_WORDS = ['Might', 'Bulwark', 'Regen', 'Thorns', 'Dodge', 'Taunt', 'Ritual', 'Plating', 'Ward', 'Charge', 'Vulnerable', 'Weak', 'Frail', 'Poison', 'Burn', 'Stun', 'Bind', 'Mark',
  'Exhaust', 'Exhausted', 'Retain', 'Retained', 'Innate', 'Ethereal', 'Prism', 'Downed', 'Front row', 'Back row', 'Energy'];
// the same words in capitals (badges and CSS content: STUN, RETAIN, KO), plus the old badges of bible 4.10 (FALLEN, KO)
const OLD_NAMES = new RegExp('\\b(?:' + OLD_NAME_WORDS.concat(OLD_NAME_WORDS.map((w) => w.toUpperCase()), ['FALLEN', 'KO']).join('|') + ')\\b');
// bible 6.2, the six Echowake Spell names (the old Song names), retired as the name, title or label of anything (lowercase chorus and hum
// stay in prose, bible 6.4)
const OLD_SPELL = /\b(Drum Line|Ripple|Shout|Beat Drop|Chorus|Hum)\b/;
// bible 6.2, the Echowake sound words of the hit text (art text)
const SOUND_OLD = /\b(?:ZAN|BAN|KIN|PIKA|WAAN|BUKU|DON)!|\bSHH\b/;
const NAME_KEYS = new Set(['name', 'title', 'label']);
const lists = (s, r) => {
  const w = hit(INK, s) || hit(TALE, s) || hit(ECHO_CI, s) || hit(ECHO_CS, s) || hit(OLD_NAMES, s) || hit(SOUND_OLD, s);
  if (w) return w;
  return r && NAME_KEYS.has(r.key) ? hit(OLD_SPELL, s) : null;
};

// the map tool must never be a "song" again (bible 4.5): scoped to the names and texts of tiles, Spells, keywords and statuses and to the
// rules-text scripts, because lowercase song and chorus are allowed survivors in prose (bible 6.4: the duo sing real songs)
const SONG_TOOL = /\bsongs?\b/i;
const SONG_REG = new Set(['tiles', 'brushes', 'keywords', 'statuses']);
const SONG_KEYS = new Set(['name', 'text']);
const SONG_SCRIPTS = new Set(['data_text.js', 'run.js', 'meta.js']);
const songTool = (s, r) => (r && ((r.kind === 'data' && SONG_REG.has(r.reg) && SONG_KEYS.has(r.key)) || (r.kind === 'ui' && SONG_SCRIPTS.has(r.file))) ? hit(SONG_TOOL, s) : null);

// `Breath` is the energy word only (bible 6.4); RoxorLoops's resource is Groove. An energy use reads "gain 1 Breath", "costs you Breath",
// "remaining Breath", "the Breath spent". Names that play on breathing are survivors (the allowlist).
const BREATH = /\bBreath\b/;
const ENERGY_VERB = '(?:' + ['gain', 'gains', 'lose', 'loses', 'cost', 'costs', 'costing', 'spend', 'spends', 'spent', 'refill', 'refills', 'restore', 'restores', 'pay', 'pays', 'need', 'needs'].map((v) => '[' + v[0].toUpperCase() + v[0] + ']' + v.slice(1)).join('|') + ')';
const ENERGY_BREATH = new RegExp('\\b' + ENERGY_VERB + '\\s+(?:[\\w-]+\\s+){0,3}?Breath\\b|\\b(?:\\d+|X|one|two|three|four|five|remaining|extra|more|less|fewer)\\s+Breath\\b|\\bBreath\\s+(?:spent|left|each turn|per turn|you have left)\\b');
const breath = (s) => (s.trim() !== 'Breath' && BREATH.test(s) && !ENERGY_BREATH.test(s) ? 'Breath' : null);      // a bare label is the energy orb's name
// UI prose says "Spend Breath", "Not enough Breath", "Three Breath, five cards": the energy word in many shapes, so the screens are held to the one
// mistake that matters, RoxorLoops's meter or layers called Breath (it is Groove)
const BREATH_METER = /\b(?:RoxorLoops|layers?)\b[^.!?]*\bBreath\b|\bBreath\b[^.!?]*\b(?:RoxorLoops|layers?)\b/i;
const breathMeter = (s) => (BREATH_METER.test(s) ? 'Breath' : null);

// ================================================================== check 6: real names (H3)
// Only the handles and first names appear. Platform names are the five link labels only, on the one LINK_ORDER line of ui.js.
const REAL_CI = /\b(X[ -]?Factor|Eurovision|Melodi Grand Prix|MGP|YouTube|TikTok|Instagram|Facebook|Twitter|Snapchat|Spotify|Netflix|Twitch|WhatsApp)\b/i;
const REAL_CS = /\b(DR|NRK|BBC|ITV|The Voice|American Idol|Britain's Got Talent|Idol)\b/;
const SURNAME = /\bBenz\b/;                  // Andy's surname: test source only, never player-facing (owners: first name only)
const LINK_KEYS = new Set(['website', 'youtube', 'facebook', 'tiktok', 'instagram']);        // the DATA.LINKS keys are ids, never prose
const real = (s, r) => {
  if (r && r.kind !== 'doc' && /^[a-z]+$/.test(s) && LINK_KEYS.has(s)) return null;
  const w = hit(SURNAME, s);
  if (w) return w;
  if (r && r.kind === 'doc') return null;                   // the docs name the link labels where they document ui.js: only the surname is banned there
  return hit(REAL_CI, s) || hit(REAL_CS, s);
};

// ================================================================== checks 7 to 9 and 11: the content words
// H5: no animal products anywhere. Animal-like characters are fine (Kraki, gulls, the goat suit, a Coin Crab). Costume shapes (a horn on an
// onesie) would be allowlisted by exact string if they ever appear in text; the horn of the Air Horn is an instrument.
const ANIMAL = new RegExp('\\b(?:' + [
  'meats?', 'beef', 'pork', 'bacon', 'ham', 'sausages?', 'steaks?', 'lamb', 'mutton', 'veal', 'seafood', 'fish(?:es)?', 'salmon', 'tuna', 'prawns?',
  'shrimps?', 'lobsters?', 'oysters?', 'caviar', 'dairy', 'cheese(?:s|y)?', 'yoghurt', 'yogurt', 'lard', 'gelatine?', 'beeswax', 'honey(?:comb)?',
  '(?<!oat |soy |soya |almond |coconut |rice |cashew )milk(?:y|shakes?)?', '(?<!peanut |almond |cashew |nut |shea |cocoa )butter(?:y)?',
  'eggs?(?! shakers?)', 'leather', 'suede', 'fur(?:s|ry)?', 'wool(?:len|ly)?', 'fleece', 'silk(?:s|y|en)?', 'pearl(?:s|y)?', 'coral', 'ivory',
  'tusks?', 'fangs?', 'claws?', 'skulls?', 'bones?', 'feathers?', 'plumage', 'shells?', 'seashells?', 'horns?(?<!air horn)(?<!air horns)(?<!foghorn)',
  'ice[- ]cream', 'whipped cream', 'clotted cream', 'double cream', 'sour cream', 'cream (?:tea|cake|soup|cheese)',
  'felt (?:hat|cap|cloak|coat|boots?|slippers?|fabric|pads?)', '(?:a|the|of|soft|warm|thick) felt\\b', 'down (?:jacket|coat|duvet|pillows?|feathers?|filled)',
  '(?:goose|duck|eider|swan) down',
].join('|') + ')\\b', 'i');
const animal = (s) => hit(ANIMAL, s);
// H4: nothing about accounting, booking, invoices, contracts, schedules, managers, fees, taxes, emails or paperwork
const ADMIN = /\b(?:accountin\w*|accountants?|bookkeep\w*|bookings?|invoices?|contracts?|schedul\w+|managers?|management|fees?|tax(?:es)?|taxation|e-?mails?|paperwork|payroll|receipts?|timesheets?|spreadsheets?|expenses?|reimburs\w+)\b/i;
// H6: plant-based food appears naturally and is never remarked on
const FOOD = /\b(?:vegan\w*|vegetarian\w*|plant[- ]based|plant[- ]powered|meat[- ]free|dairy[- ]free|cruelty[- ]free|healthy|healthier|diets?|dietary)\b/i;
const admin = (s) => hit(ADMIN, s);
const food = (s) => hit(FOOD, s);
// H7: silly, warm, heartfelt; never mean, never crude; nobody dies; no alcohol, smoking or swearing; the Gloss is never evil
const TONE = /\b(?:kill(?:s|ed|er|ers|ing)?|(?<!a |the |one |each |this |that |your |loaded )die(?!-cut)|dies|died|dying|dead|deadly|death|deaths|deathly|blood|bloody|bloodied|gore|gory|corpses?|murder\w*|suicide|slaughter\w*|massacre\w*|evil)\b/i;
const VICE = /\b(?:beer|wine|vodka|whisk(?:e)?y|booze|boozy|drunk|cocktails?|champagne|lager|brandy|tequila|cigarettes?|cigars?|tobacco|vaping|damn(?:ed|it)?|crap|shit\w*|fuck\w*|bitch\w*|bastards?|piss\w*|arse|hell)\b/i;
const tone = (s) => hit(TONE, s) || hit(VICE, s);
// H10: British spelling (colour, favourite, centre, theatre, grey, recognise, programme, travelling, jewellery)
const AMERICAN = new RegExp('\\b(?:' + [
  'colo(?!u)r\\w*', 'favorit\\w+', 'center\\w*', 'gray\\w*', 'recogniz\\w+', 'travel(?:ed|ing|er|ers)', 'theaters?', 'jewelry', 'flavor\\w*', 'neighbor\\w*',
  'realiz\\w+', 'organiz\\w+', 'apologiz\\w+', 'criticiz\\w+', 'analyz\\w+', 'defense', 'cozy', 'pajamas', 'programs?', 'fiber\\w*', 'honor\\w*',
  'humor(?:s|ed|ing)?', 'labor(?:s|ed|ing|er|ers)?', 'rumor(?:s|ed)?', 'savior\\w*', 'vapor(?:s)?', 'behavior\\w*', 'harbor\\w*', 'armor\\w*', 'endeavor\\w*', 'skeptic\\w*', 'mold\\w*',
  'odor\\w*', 'aluminum', 'catalog(?:s|ed)?', 'dialog(?:s)?', 'mom', 'moms',
].join('|') + ')\\b', 'i');
const american = (s) => hit(AMERICAN, s);

// ================================================================== check 7b: the noun "run" (a run is a tour, bible 1.3)
// The noun for a tour is banned. The verb ("Run after it", "it runs out of puff", "the strings run to every phone", "is run by") and the
// musical sense (the Spell Vocal Run, vocal runs) pass; the matcher tells them apart by the words around "run".
const RUN_WORD = /(?<![-_])\b[Rr]uns?\b/g;          // not a class-name part such as mn-p-run or has-run
const RUN_BEFORE_VERB = /\b(?:to|will|can|could|should|would|must|may|might|not|do|does|did|has|have|had|is|are|was|were|be|been|being|it|you|they|we|he|she|i|just|never|always|also|still|please|let|lets)\s+(?:\w+ly\s+)?$/i;
const RUN_AFTER_VERB = /^\s+(?:out|away|off|behind|after|up|down|under|right|to|by|through|from|into|along|past|over|across|around|a|an|the|it|them|him|her)\b/i;
const RUN_MUSIC_BEFORE = /\bvocal\s+$/i;
const RUN_DET_BEFORE = /\b(?:a|an|the|this|your|my|his|her|our|their|each|every|one|per|same|next|last|first|new|whole|entire|daily|\d+)\s+$/i;      // "a run", "your run", "3 runs": the noun
const nounRun = (s) => {
  RUN_WORD.lastIndex = 0;
  let m;
  while ((m = RUN_WORD.exec(s))) {
    const before = s.slice(Math.max(0, m.index - 28), m.index), after = s.slice(m.index + m[0].length, m.index + m[0].length + 14);
    if (RUN_MUSIC_BEFORE.test(before)) continue;
    if (!RUN_DET_BEFORE.test(before) && (RUN_BEFORE_VERB.test(before) || RUN_AFTER_VERB.test(after))) continue;
    return (before.split(/\s+/).slice(-2).join(' ') + m[0]).trim();
  }
  return null;
};

// ================================================================== the allowlist: ONE list of [exact string, reason]
// Matched exactly against the whole checked string (a DATA field, a literal, a doc line). At most two contains entries, DATA only. Its
// size is pinned below, and every entry must still be NEEDED (flagged without it), so a stale entry cannot hide a word that comes back.
const ALLOW = [
  // bible 6.4 and HV_BIBLE 4.1 survivors
  ['Limited Edition', 'bible 6.4: Encore trial_7, a merch print run, not an Inkwoven book word (DATA.trials.trial_7.name)'],
  ['Blossom Breath', 'bible 6.4: Breath as the energy word; a card name that plays on breathing in (DATA.cards.hanae_bloom_tide.name)'],
  ['Out of Breath', 'bible 6.4: Breath as the energy word; the junk status card (DATA.cards.status_wilt.name)'],
  ['Deep Breath Tourmaline', 'bible 6.4: Breath as the energy word; a gem name that plays on breathing in (DATA.gems.wellspring_tourmaline.name)'],
  // the how-to pagination word page (bible 6.4)
  ['Pages', 'bible 6.4: How to play pagination label (screen_menu.js)'],
  ['Page ', 'bible 6.4: How to play pagination label (screen_menu.js)'],
  ['How to play pages', 'bible 6.4: How to play pagination (aria label, screen_menu.js)'],
  ['How to play, page ', 'bible 6.4: How to play pagination (screen_menu.js)'],
  ['This is the first page', 'bible 6.4: How to play pagination (screen_menu.js)'],
  // link labels, bible 7.2: the platform names appear only as the five link labels, on the one LINK_ORDER line of ui.js
  ['YouTube', 'link labels, bible 7.2 (the LINK_ORDER line of ui.js only)'],
  ['Facebook', 'link labels, bible 7.2 (the LINK_ORDER line of ui.js only)'],
  ['TikTok', 'link labels, bible 7.2 (the LINK_ORDER line of ui.js only)'],
  ['Instagram', 'link labels, bible 7.2 (the LINK_ORDER line of ui.js only)'],
  // art text that is not game art: the fallback labels of a scene or icon that is not drawn, and the gallery guide (HV_ART_AUDIO 1 rule 7 is
  // the set of painted words; these are developer-only placeholders that never show in a finished game)
  ['scene ', 'art.js and art_scenes.js: the placeholder label of a scene id that has no art, a developer fallback'],
  ['?', 'art_icons.js: the fallback glyph of an unknown icon id'],
  ['ground y 520', 'art_scenes.js drawGuides: a gallery guide drawn only with params guides=1'],
  ['L', 'art_scenes.js drawGuides: the lane labels L0 to L4 of the gallery guide'],
];
// the only non-exact entries: [substring, reason], checked against DATA fields only
const ALLOW_CONTAINS = [
  ['a soft little run', 'music: a quick run of sung notes, Jasmin answering the gull (DATA.events.tengu_dice, bible 7.4 lists run in her words)'],
];
// the few exact entries that are valid only in one place: [string, test of the record]
const SCOPE = new Map([
  ['YouTube', (r) => r.file === 'ui.js' && /LINK_ORDER/.test(r.lineText || '')],
  ['Facebook', (r) => r.file === 'ui.js' && /LINK_ORDER/.test(r.lineText || '')],
  ['TikTok', (r) => r.file === 'ui.js' && /LINK_ORDER/.test(r.lineText || '')],
  ['Instagram', (r) => r.file === 'ui.js' && /LINK_ORDER/.test(r.lineText || '')],
  ['Pages', (r) => r.file === 'screen_menu.js'],
  ['Page ', (r) => r.file === 'screen_menu.js'],
  ['How to play pages', (r) => r.file === 'screen_menu.js'],
  ['How to play, page ', (r) => r.file === 'screen_menu.js'],
  ['This is the first page', (r) => r.file === 'screen_menu.js'],
  ['scene ', (r) => r.kind === 'art'],
  ['?', (r) => r.kind === 'art'],
  ['ground y 520', (r) => r.kind === 'art'],
  ['L', (r) => r.kind === 'art'],
  ['Limited Edition', (r) => r.kind === 'data'],
  ['Blossom Breath', (r) => r.kind === 'data'],
  ['Out of Breath', (r) => r.kind === 'data'],
  ['Deep Breath Tourmaline', (r) => r.kind === 'data'],
]);
const allowMap = new Map(ALLOW);
const usedExact = new Set();
const usedContains = new Set();
const allowed = (r) => {
  const s = r.text;
  if (allowMap.has(s) && (!SCOPE.has(s) || SCOPE.get(s)(r))) { usedExact.add(s); return true; }
  if (r.kind === 'data') for (const [sub] of ALLOW_CONTAINS) if (s.includes(sub)) { usedContains.add(sub); return true; }
  return false;
};
// scan records with a matcher: returns the failure lines; an allowlisted record is not a failure and counts as "needed"
const scan = (recs, fn) => {
  const bad = [];
  for (const r of recs) {
    const w = fn(r.text, r);
    if (!w) continue;
    if (allowed(r)) continue;
    bad.push(`${r.where}: "${w}" in "${abbrev(r.text)}"`);
  }
  return bad;
};
// the live self-test of a check: every bad fixture is flagged by the same matcher, every good one passes
const selfTest = (name, fn, bads, goods, ctx) => {
  for (const b of bads) {
    const r = Object.assign({ kind: 'data', key: 'text', where: 'fixture' }, ctx, typeof b === 'string' ? { text: b } : b);
    t.ok(!!fn(r.text, r), `${name} self-test: the matcher must flag "${r.text}"`);
  }
  for (const g of goods) {
    const r = Object.assign({ kind: 'data', key: 'text', where: 'fixture' }, ctx, typeof g === 'string' ? { text: g } : g);
    t.ok(!fn(r.text, r), `${name} self-test: the matcher must pass "${r.text}" (got "${fn(r.text, r)}")`);
  }
};

// ================================================================== the corpus 1: DATA display fields
const g = boot({ only: ['util', 'data*'] });          // every data script the page lists, so a new content file is read too
t.ok(!g._errors || g._errors.length === 0, 'content scripts load without errors: ' + JSON.stringify(g._errors));
const D = g.DATA;

// Every string whose key is a display field, anywhere inside a registry. Ids, ops, tags and art names are never display fields.
const DISPLAY_KEYS = new Set(['name', 'title', 'flavor', 'text', 'lore', 'say', 'label', 'blurb']);
const REGISTRIES = ['cards', 'gems', 'relics', 'enemies', 'events', 'achievements', 'trials', 'lore', 'tiles', 'brushes', 'keywords', 'statuses', 'heroes', 'ROSTER', 'outfits'];
const data = [];            // { kind:'data', where, text, reg, key }
const collect = (o, p, reg, key) => {
  if (typeof o === 'string') { data.push({ kind: 'data', where: p, text: o, reg, key }); return; }
  if (!o || typeof o !== 'object') return;
  for (const k of Object.keys(o)) {
    const kid = Array.isArray(o) ? key : k;
    const here = p + (Array.isArray(o) ? `[${k}]` : '.' + k);
    const v = o[k];
    if (typeof v === 'string') {
      const shown = DISPLAY_KEYS.has(kid) || (Array.isArray(o) && (p.includes('.lines.') || reg === 'lore') && DISPLAY_KEYS.has(key)) || (Array.isArray(o) && /\.lines\.\w+$/.test(p))
        || (reg === 'ROSTER' && k === 'role');
      const eventCost = reg === 'events' && k === 'cost';
      if (shown || eventCost) data.push({ kind: 'data', where: here, text: v, reg, key: kid });
    } else collect(v, here, reg, kid);
  }
};
for (const reg of REGISTRIES) for (const id of Object.keys(D[reg] || {})) collect(D[reg][id], `DATA.${reg}.${id}`, reg, '');
for (const id of Object.keys(D.tips || {})) {
  const v = D.tips[id];
  const at = Array.isArray(D.tips) ? `DATA.tips[${id}]` : `DATA.tips.${id}`;
  if (typeof v === 'string') data.push({ kind: 'data', where: at, text: v, reg: 'tips', key: 'tip' });
  else collect(v, at, 'tips', '');
}
for (const k of Object.keys(D.COLOUR_NAME || {})) data.push({ kind: 'data', where: `DATA.COLOUR_NAME.${k}`, text: D.COLOUR_NAME[k], reg: 'COLOUR_NAME', key: 'name' });

// What counts as player-facing text in a literal: a string with a space that is not a class list or a selector, or a one-word capitalised label
// (Chimes, Library, RETAIN) or caps hit word (ZAN!). Ids are lowercase single tokens and snake_case, so they are never prose. A class list ("row center gap", "ev-page
// left") is all lowercase identifier tokens with a hyphen or only layout words: it names CSS classes (H1: a class never changes), not words.
const CLASS_STOP = new Set(['a', 'an', 'the', 'of', 'and', 'or', 'in', 'on', 'to', 'is', 'it', 'you', 'your', 'my', 'we', 'be', 'at', 'as', 'for', 'with', 'not', 'no', 'if', 'so', 'do', 'by']);
const CLASS_LAYOUT = new Set(['row', 'col', 'column', 'center', 'gap', 'wrap', 'stack', 'grow', 'between', 'start', 'end', 'left', 'right', 'top', 'bottom', 'big', 'small', 'muted', 'dim', 'hidden']);
const isClassList = (x) => {
  const toks = x.split(/\s+/);
  if (!toks.every((k) => /^[a-z][a-z0-9_-]*$/.test(k) && k.length <= 24 && !CLASS_STOP.has(k))) return false;
  return toks.some((k) => /[-_]/.test(k)) || toks.every((k) => CLASS_LAYOUT.has(k));
};
const isProseText = (s, glued) => {
  const x = s.trim();
  if (!/[A-Za-z]/.test(x) || /^[.#]\S|^[\[<]/.test(x)) return false;           // a selector (.hero-card, #boot, [hidden]) or markup is not prose; ". Tap again." is
  if (/\s/.test(x)) return !isClassList(x);
  if (glued && /^[^A-Za-z0-9]|[^A-Za-z0-9]$/.test(s)) return true;           // ' chimes' or 'echo)' glued with +: a word joined to a sentence
  return /^[A-Z][A-Za-z'-]{2,}[.:!?]?$/.test(x) || /^[A-Z][A-Z0-9-]*!$/.test(x);      // a label, or a caps hit word (LA!, ZAN!)
};
// the walker must not have a blind spot: every prose-looking string anywhere in DATA (the derived duplicates apart) is one the walker took
const walkedPaths = new Set(data.map((f) => f.where));
const blind = [];
(function scanBlind(o, p, top) {
  if (!o || typeof o !== 'object') return;
  for (const k of Object.keys(o)) {
    const v = o[k];
    const here = p + (Array.isArray(o) ? `[${k}]` : '.' + k);
    if (typeof v === 'string') { if (isProseText(v) && !walkedPaths.has(here)) blind.push(`${here}: "${abbrev(v)}"`); }
    else if (v && typeof v === 'object') scanBlind(v, here, top);
  }
})(Object.fromEntries(Object.entries(D).filter(([k, v]) => typeof v === 'object' && v && !['rosterById', 'cardsBy', 'groupById', 'enemyIds', 'eligibleGroups'].includes(k))), 'DATA', true);

// ================================================================== the corpus 2: the prose literals of the twelve presentation scripts
const UI_FILES = ['data_text.js', 'run.js', 'meta.js', 'ui.js', 'main.js', 'scene.js', 'screen_map.js', 'screen_menu.js', 'screen_node.js', 'screen_combat.js', 'screen_end.js', 'tutorial.js'];
const unq = (v) => v.slice(1, -1).replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, ' ');
// every string literal and template literal of a source, with ${...} replaced by X; returns { text, s, dev, glued } (glued: next to a + )
function literals(src) {
  const toks = tokenizeJs(src).filter((k) => k.t !== 'comment');
  const out = [];
  const stack = [];
  const calleeOf = (idx) => {              // the token index of the callee whose argument list holds toks[idx], or -1
    let d = 0;
    for (let j = idx - 1; j >= 0 && j > idx - 60; j--) {
      const k = toks[j];
      if (k.t !== 'punct') continue;
      if (k.v === ')' || k.v === ']' || k.v === '}') d++;
      else if (k.v === '(' || k.v === '[' || k.v === '{') { if (d === 0) return k.v === '(' ? j - 1 : -1; d--; }
    }
    return -1;
  };
  const devMsg = (idx) => {                // new Error(...), err(...), console.x(...), warnOnce(...): a developer message, never shown to a player
    const j = calleeOf(idx);
    if (j < 0) return false;
    const k = toks[j];
    if (k.t === 'id' && (k.v === 'Error' || k.v === 'err' || k.v === 'warnOnce')) return true;
    if (k.t === 'id' && j >= 2 && toks[j - 1].v === '.' && toks[j - 2].v === 'console') return true;
    return false;
  };
  toks.forEach((k, i) => {
    if (k.t === 'str') out.push({ text: unq(k.v), s: k.s, dev: devMsg(i), glued: (toks[i - 1] && toks[i - 1].t === 'punct' && toks[i - 1].v === '+') || (toks[i + 1] && toks[i + 1].t === 'punct' && toks[i + 1].v === '+') });
    else if (k.t === 'tplHead') stack.push({ text: k.v.slice(1, -2), s: k.s, dev: devMsg(i) });
    else if (k.t === 'tplMid') { const top = stack[stack.length - 1]; if (top) top.text += 'X' + k.v.slice(1, -2); }
    else if (k.t === 'tplTail') { const top = stack.pop(); if (top) { top.text += 'X' + k.v.slice(1, -1); out.push(top); } }
  });
  return out;
}
// markup literals ("<button aria-label=...>Play</button>"): the visible text and the text attributes, as separate prose strings
const ATTR_TEXT = /\b(?:aria-label|aria-description|aria-valuetext|title|alt|placeholder|data-tip|data-label)="([^"]*)"/g;
function markupParts(text) {
  const parts = [];
  for (const m of text.matchAll(ATTR_TEXT)) parts.push(m[1]);
  parts.push(text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
  return parts.filter((p) => p);
}
const ui = [];              // prose literals: { kind:'ui', where, text, file, line, lineText }
const uiAll = [];           // every non-developer literal, single words included (real names are caught there)
for (const f of UI_FILES) {
  const full = path.join(DIR, 'js', f);
  if (!fs.existsSync(full)) continue;
  const src = fs.readFileSync(full, 'utf8');
  const lines = src.split('\n');
  for (const l of literals(src)) {
    if (l.dev) continue;
    const text = l.text.replace(/\\u[0-9a-fA-F]{4}/g, ' ');
    const line = lineOf(src, l.s);
    const rec = { kind: 'ui', where: `js/${f}:${line}`, text, file: f, line, lineText: lines[line - 1] || '' };
    uiAll.push(rec);
    if (/^</.test(text)) {
      for (const p of markupParts(text)) if (isProseText(p)) ui.push(Object.assign({}, rec, { text: p, where: rec.where + ' (markup)' }));
    } else if (isProseText(text, l.glued) && !(l.glued && /^[A-Za-z0-9]+$/.test(text))) ui.push(rec);      // a bare word glued with + is an id fragment ('boss' + n + 'Kills'); 'Page ' + n and ' chimes' are label and sentence fragments and stay
  }
}

// ================================================================== the corpus 3: the page shells, the CSS content strings, the docs
const html = [];
for (const file of ['index.html', 'gallery.html']) {
  const src = read(file);
  const add = (where, text) => { if (text && text.trim()) html.push({ kind: 'html', where: `${file} ${where}`, text: text.trim(), file }); };
  const title = /<title>([\s\S]*?)<\/title>/.exec(src);
  if (title) add('<title>', title[1]);
  for (const m of src.matchAll(/<noscript>([\s\S]*?)<\/noscript>/g)) add('<noscript>', m[1]);
  for (const m of src.matchAll(/<div id="boot">([\s\S]*?)<\/div>/g)) add('boot splash', m[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '));
  for (const m of src.matchAll(/<meta name="description" content="([^"]*)"/g)) add('meta description', m[1]);
  const body = src.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<head>[\s\S]*?<\/head>/, ' ');
  for (const m of body.matchAll(ATTR_TEXT)) add('attribute', m[1]);
  add('visible text', body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '));
  for (const m of src.matchAll(/<script>([\s\S]*?)<\/script>/g)) for (const l of literals(m[1])) if (!l.dev && isProseText(l.text)) add('inline script', l.text);
}
const css = [];
{
  const dir = path.join(DIR, 'css');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.css')).sort()) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
    const re = /\bcontent\s*:\s*("([^"\\]|\\.)*"|'([^'\\]|\\.)*')/g;
    let m;
    while ((m = re.exec(src))) {
      const text = m[1].slice(1, -1).replace(/\\[0-9a-fA-F]{1,6}\s?/g, ' ').replace(/\\(.)/g, '$1');
      if (text.trim()) css.push({ kind: 'css', where: `css/${f}:${lineOf(src, m.index)}`, text, file: f });
    }
  }
}
// the docs, outside code fences and backticks and URLs; DESIGN.md only before section 1.1 (its three-column old-word table and the module
// contract keep the internal ids and old words in backticks on purpose)
const docLines = (name, text) => {                 // the prose lines of a doc: no code fences, no backticks, no URLs; DESIGN.md only before 1.1
  let src = text.replace(/```[\s\S]*?```/g, (m) => m.replace(/[^\n]/g, ' '));
  if (name === 'DESIGN.md') { const cut = src.indexOf('### 1.1 '); if (cut > 0) src = src.slice(0, cut); }
  const out = [];
  src.split('\n').forEach((line, i) => {
    const prose = line.replace(/`[^`]*`/g, ' ').replace(/https?:\/\/\S+/g, ' ').trim();
    if (prose) out.push({ kind: 'doc', where: `${name}:${i + 1}`, text: prose, file: name });
  });
  return out;
};
const docs = [];
for (const f of ['README.md', 'DESIGN.md', 'ART_BIBLE.md', 'CONTENT_SPEC.md']) {
  const full = path.join(DIR, f);
  if (!fs.existsSync(full)) { docs.push({ kind: 'doc', where: f, text: '(file missing)', file: f, missing: true }); continue; }
  docs.push(...docLines(f, fs.readFileSync(full, 'utf8')));
}

// ================================================================== the corpus 4: art text (check 10)
// The literals passed to text drawing in js/art*.js: the argument of fillText, strokeText, inkText (second argument), the art helpers
// S.text, hitWord and sfWord (second argument) and scWall (fourth), every `text: '...'` property, and any other caps-and-bang word anywhere
// (the hit words). A literal inside an ART.sheet(...) call is gallery-only text (labels, captions): it passes the retired-word lists but is not
// held to the closed set of painted words. Painted values that are variables (a damage number, the Notification Imp's count) are digits.
const ART_CALLEES = Object.assign(Object.create(null), { fillText: [0], strokeText: [0], inkText: [1], text: [0], hitWord: [1], sfWord: [1], scWall: [3] });      // callee -> the text argument positions
const ART_TEXT = new Set([
  'HOCUS VOCUS',                                           // the logo
  'LA!', 'BOOM!', 'SIZZ!', 'TING!', 'WOMP!', 'PKAH!', 'NANANA!', 'TA-DA!',     // the bible's hit words
  'APPLAUSE', 'SKIP', 'FLAWLESS!',                         // the enemy art words
  'ON AIR',                                                // the Studio stamp
  'ALL AREAS', 'ALL', 'AREAS', 'CREW',                     // two Charm icons (ALL AREAS is painted on two lines)
  'first!', 'mid', 'who asked',                            // the three Scrollopolis graffiti words (bible 2.3)
  '@roxorloopsandjasmin',                                  // the handle on the share card
]);
const NUMERIC_ART = /^[\d\s.,+\-x%:/]*$/;
const callArgs = (toks, i) => {                // the argument token lists of the call whose "(" is toks[i + 1]
  const args = [[]];
  let d = 0;
  for (let j = i + 1; j < toks.length; j++) {
    const v = toks[j].v, p = toks[j].t === 'punct';
    if (p && (v === '(' || v === '[' || v === '{')) { d++; if (d > 1) args[args.length - 1].push(toks[j]); }
    else if (p && (v === ')' || v === ']' || v === '}')) { d--; if (d === 0) break; args[args.length - 1].push(toks[j]); }
    else if (p && v === ',' && d === 1) args.push([]);
    else args[args.length - 1].push(toks[j]);
  }
  return args;
};
const pieces = (a) => a.flatMap((k) => (k.t === 'str' ? [unq(k.v)] : k.t === 'tplHead' || k.t === 'tplMid' ? [k.v.slice(1, -2)] : k.t === 'tplTail' ? [k.v.slice(1, -1)] : []));
const artFiles = fs.readdirSync(path.join(DIR, 'js')).filter((f) => /^art.*\.js$/.test(f)).sort();
const art = [];
for (const f of artFiles) {
  const src = fs.readFileSync(path.join(DIR, 'js', f), 'utf8');
  const toks = tokenizeJs(src).filter((k) => k.t !== 'comment');
  const sheets = [];
  toks.forEach((k, i) => {
    if (k.t === 'id' && k.v === 'sheet' && toks[i - 1] && toks[i - 1].v === '.' && toks[i + 1] && toks[i + 1].v === '(') {
      let d = 0, j = i + 1;
      for (; j < toks.length; j++) { if (toks[j].t === 'punct' && toks[j].v === '(') d++; else if (toks[j].t === 'punct' && toks[j].v === ')') { d--; if (d === 0) break; } }
      sheets.push([i, j]);
    }
  });
  const inSheet = (i) => sheets.some(([a, b]) => i >= a && i <= b);
  const seen = new Set();
  const push = (i, text, how) => {
    const key = lineOf(src, toks[i].s) + ':' + text;
    if (seen.has(key)) return;
    seen.add(key);
    art.push({ kind: 'art', where: `js/${f}:${lineOf(src, toks[i].s)}`, text, file: f, scope: inSheet(i) ? 'sheet' : 'game', how });
  };
  toks.forEach((k, i) => {
    if (k.t === 'id' && k.v in ART_CALLEES && toks[i + 1] && toks[i + 1].v === '(' && toks[i - 1] && toks[i - 1].v !== 'function') {
      if (k.v === 'text' && !(toks[i - 1] && toks[i - 1].v === '.')) return;
      const args = callArgs(toks, i);
      for (const ai of ART_CALLEES[k.v]) for (const p of pieces(args[ai] || [])) if (p.trim()) push(i, p, 'call ' + k.v);
    } else if (k.t === 'id' && k.v === 'text' && toks[i + 1] && toks[i + 1].v === ':' && toks[i + 2] && toks[i + 2].t === 'str') {
      push(i + 2, unq(toks[i + 2].v), 'property text');
    } else if (k.t === 'str' && /^[A-Z][A-Z0-9-]+!$/.test(unq(k.v))) {
      push(i, unq(k.v), 'caps and bang');
    }
  });
}
{
  // the hit words of the combat look table live in scene.js (`word: 'LA!'` per element, bible 4.10): they are painted text too
  const src = fs.readFileSync(path.join(DIR, 'js', 'scene.js'), 'utf8');
  const toks = tokenizeJs(src).filter((k) => k.t !== 'comment');
  toks.forEach((k, i) => {
    if (k.t === 'id' && k.v === 'word' && toks[i + 1] && toks[i + 1].v === ':' && toks[i + 2] && toks[i + 2].t === 'str') {
      art.push({ kind: 'art', where: `js/scene.js:${lineOf(src, toks[i + 2].s)}`, text: unq(toks[i + 2].v), file: 'scene.js', scope: 'game', how: 'property word' });
    }
  });
}
const artClosed = (s, r) => {
  if (r.scope === 'sheet' || ART_TEXT.has(s) || NUMERIC_ART.test(s)) return null;
  return s;
};

// ================================================================== the live self-tests of every matcher and the scopes
t.test('the DATA walk found the display fields it should (guards the walker itself)', () => {
  const by = {};
  for (const f of data) by[f.reg] = (by[f.reg] || 0) + 1;
  for (const [reg, min] of Object.entries({ cards: 250, gems: 20, relics: 100, enemies: 300, events: 200, achievements: 60, trials: 20, lore: 20, tiles: 20, brushes: 10, keywords: 20, statuses: 30, heroes: 14, tips: 20, ROSTER: 100, outfits: 3, COLOUR_NAME: 5 })) t.ok((by[reg] || 0) >= min, `DATA.${reg} contributed ${by[reg] || 0} display strings, expected at least ${min}`);
  t.ok(data.some((f) => /\.lines\.start\[/.test(f.where)), 'bark lines are walked');
  t.ok(data.some((f) => /\.phases\[\d+\]\.say$/.test(f.where)), 'enemy phase say is walked');
  t.ok(data.some((f) => /\.out\[\d+\]\.text$/.test(f.where)), 'event outcome text is walked');
  t.ok(data.some((f) => /\.choices\[\d+\]\.cost$/.test(f.where)), 'event choice cost is walked');
  t.ok(data.some((f) => /^DATA\.heroes\.\w+\.passives\[\d+\]\.name$/.test(f.where)), 'hero passive names are walked');
  t.ok(data.some((f) => /^DATA\.ROSTER\.\d\[\d+\]\.role$/.test(f.where)), 'the roster role lines are walked');
  t.eq(blind.length, 0, fail(blind, 'prose-looking DATA strings the walker never checks (add the key to DISPLAY_KEYS, or list the table as ids)'));
});
t.test('every script the page loads is under a guard (a new script must join UI_FILES, or the no-text list with its reason)', () => {
  // data_* are walked through DATA, art* through the art scan, UI_FILES through the literal scan; these four hold no player-facing text
  const NO_TEXT = { 'util.js': 'helpers', 'audio.js': 'sound synthesis: track and sfx ids and developer notes', 'combat.js': 'the combat engine: logic and ids', 'map.js': 'the map engine: logic, ids and a developer text legend' };
  const loose = scriptFiles().map((f) => path.basename(f)).filter((f) => !/^(data|art)/.test(f) && !UI_FILES.includes(f) && !(f in NO_TEXT));
  t.deep(loose, [], 'scripts the theme guard does not read');
  for (const f of UI_FILES.concat(Object.keys(NO_TEXT))) t.ok(scriptFiles().some((s) => path.basename(s) === f), `${f} is still a script of the page (drop it from the guard lists if it was removed)`);
});
t.test('the UI literal walk found the strings it should (guards the tokenizer use)', () => {
  t.ok(ui.length > 800, `only ${ui.length} prose literals found in the UI scripts`);
  t.ok(uiAll.length > ui.length, 'single-word literals are in the all-literals corpus too');
  const files = new Set(ui.map((l) => l.file));
  for (const f of UI_FILES) if (fs.existsSync(path.join(DIR, 'js', f))) t.ok(files.has(f), `no prose literal found in ${f}`);
  t.ok(uiAll.filter((l) => /^</.test(l.text)).length >= 10, 'the markup literals of the UI scripts are read');
  t.ok(html.length >= 8, `the page shells contributed ${html.length} strings`);
  t.ok(css.length >= 5, `the CSS files contributed ${css.length} content strings`);
  t.ok(docs.length > 300 && !docs.some((d) => d.missing), 'the four docs were read');
  t.ok(art.length >= 60 && artFiles.length >= 9, `the art scan found ${art.length} text literals in ${artFiles.length} art files`);
  t.ok(art.some((a) => a.text === 'HOCUS VOCUS') && art.some((a) => a.text === 'FLAWLESS!') && art.some((a) => a.text === 'ON AIR') && art.some((a) => a.text === 'first!'), 'the art scan reaches the logo, the enemy words, the Studio stamp and the graffiti');
  t.ok(art.some((a) => a.scope === 'sheet') && art.some((a) => a.scope === 'game'), 'the art scan tells gallery sheet text from game art text');
  t.ok(art.filter((a) => a.how === 'property word').length >= 7, 'the seven hit words of the scene.js look table are scanned as art text');
});

t.test('the extractors work on fixtures: string, template and developer literals, class lists, labels and markup', () => {
  const lits = literals("const a = 'Spend your Chimes'; const b = new Error('Echo is down'); const c = `Gain ${n} Echo`; console.log('The Hush'); const d = 'boss' + n + 'Kills'; warnOnce(S.kind + ' paint'); mk('p', { text: 'Hush' });");
  t.deep(lits.map((l) => l.text), ['Spend your Chimes', 'Echo is down', 'Gain X Echo', 'The Hush', 'boss', 'Kills', ' paint', 'p', 'Hush'], 'strings and templates are read, with X for a ${} hole');
  t.deep(lits.map((l) => !!l.dev), [false, true, false, true, false, false, true, false, false], 'new Error(...), console.log(...) and warnOnce(...) strings are developer text; mk(...) strings are not');
  t.deep(lits.map((l) => !!l.glued), [false, false, false, false, true, true, true, false, false], 'literals glued with + are marked');
  for (const prose of ['Spend your Chimes', 'Chimes', 'RETAIN', 'Not enough Breath', 'Hello there']) t.ok(isProseText(prose), `"${prose}" is prose`);
  t.ok(isProseText('. Tap again.') && isProseText(' chimes', true) && isProseText('echo)', true), 'a sentence fragment is prose (". Tap again.", " chimes" glued with +)');
  t.ok(!isProseText(' chimes') && !isProseText('.hero-card') && !isProseText('.dk-detail .dk-go') && !isProseText('[data-act=resume]'), 'a lone lowercase word, a selector and an attribute selector are not prose');
  for (const ids of ['row center gap', 'ev-page left', 'st-page vc-page', 'mn-p-run empty', 'kill', 'die', 'ink_splash', '.hero-card', '#boot', '<b>x</b>', 'hanae']) t.ok(!isProseText(ids), `"${ids}" is an id, a class list or markup, not prose`);
  t.deep(markupParts('<button class="x" aria-label="Echo chamber">Go <b>now</b></button>'), ['Echo chamber', 'Go now'], 'markup yields its attribute text and its visible text');
});

// ------------------------------------------------------------------ check 1: DATA display fields
t.test('check 1: no retired word (bible 6.2 and 6.3) in any DATA display field', () => {
  t.eq(scan(data, lists).length, 0, fail(scan(data, lists), 'retired words in DATA'));
});
t.test('check 1: Breath is the energy word only, and RoxorLoops\'s resource is Groove', () => {
  t.eq(D.statuses.sumi.name, 'Groove', 'DATA.statuses.sumi.name is Groove (bible 4.3)');
  t.ok(!/Breath/.test(D.statuses.sumi.text), 'the Groove text never says Breath');
  const bad = scan(data, breath).concat(scan(data.concat(ui), breathMeter));
  t.eq(bad.length, 0, fail(bad, 'Breath outside an energy use in DATA, or RoxorLoops\'s meter called Breath in UI prose'));
});
t.test('check 1b: no "song" in the names and texts of tiles, Spells, keywords and statuses (the map tool is a Spell, bible 4.5)', () => {
  const recs = data.filter((f) => SONG_REG.has(f.reg) && SONG_KEYS.has(f.key));
  t.ok(recs.length >= 100, `the rescoped walk reached ${recs.length} names and texts of tiles, Spells, keywords and statuses, expected at least 100 (guards the scope itself)`);
  const bad = scan(recs, songTool);
  t.eq(bad.length, 0, fail(bad, '"song" in the name or text of a tile, Spell, keyword or status'));
});
t.test('check 1 self-test: the lists flag every kind of retired word and pass the survivors', () => {
  selfTest('lists', lists, [
    'Ink Trial', 'the Whispering Bamboo Grove', 'Gain 2 Echoes.', 'a Hush falls', 'Jorogumo wakes', 'Kuzunoha', 'a tanuki bandit', 'The shrine bell rings',
    'Spend your Chimes', 'Take a Fable', 'Gain 3 Might', 'Apply 2 Burn', 'Exhaust a card', 'Gain 1 Energy', 'Back row', 'the Conductor', 'Play on',
    'a bookmark', 'the library', 'Daily Tale', 'a calligraphy brush', 'THE SONG FADES', 'ZAN! goes the drum', 'Hanae sings', 'Moonlit Rite', 'a Peddler arrives',
    'Dead Silence', 'Tempo Trials', 'the Hall of Echoes', 'Verse 1', 'a champion', 'a rogue ballad',
    { text: 'Ripple', key: 'name' }, { text: 'Drum Line', key: 'name' }, { text: 'Hum', key: 'label' },
  ], [
    'Boots and Cats', 'Gain 2 Vox.', 'Apply 2 Muffled', 'Gain 1 Breath', 'One weak poke', 'it might bite', 'a front row seat',
    'The Gloss smooths over the stage.', 'Surround Sound', { text: 'chorus lines hum along', key: 'text' }, 'The Soundlands', 'Weakest link in the band'.replace('Weakest', 'Dullest'),
  ]);
  selfTest('lists (Limited Edition is a survivor by allowlist, not by the matcher)', lists, ['Limited Edition'], []);
  selfTest('song tool', songTool, [{ text: 'A song that unmutes hexes', reg: 'brushes', key: 'text' }, { text: 'Songs', reg: 'tiles', key: 'name' }, { text: 'a song of gain', kind: 'ui', file: 'run.js' }],
    [{ text: 'The duo sing real songs.', reg: 'lore', key: 'text' }, { text: 'a song', kind: 'ui', file: 'screen_end.js' }]);
  selfTest('breath meter', breathMeter, ['RoxorLoops builds Breath with every layer', 'Layers fill the Breath meter', 'RoxorLoops spends 2 Breath'], ['Spend Breath to play cards.', 'Not enough Breath', 'Gain 2 Groove.', 'RoxorLoops loves the Gloss.']);
  selfTest('breath', breath, ['RoxorLoops builds Breath with every layer', 'Layers fill the Breath meter', 'Guard your Breath'], ['Breath', 'Breath ', 'Gain 1 Breath.', 'costs 2 Breath', 'Spends all your remaining Breath.', 'The card reads X as the Breath spent.', 'costs you Breath', 'Every extra swap costs Breath', 'Costs 1 less Breath.', 'Refills your Breath at the start of a turn.', 'You have no Breath left.']);
});

// ------------------------------------------------------------------ check 2: prose literals of the presentation scripts, the run rule
t.test('check 2: no retired word (bible 6.2 and 6.3) or "tale" in any prose literal of the UI scripts', () => {
  const bad = scan(ui, lists);
  t.eq(bad.length, 0, fail(bad, 'retired words in UI string literals'));
});
t.test('check 2: no "song" in the rules-text scripts (data_text.js, run.js, meta.js)', () => {
  const recs = ui.filter((l) => SONG_SCRIPTS.has(l.file));
  t.ok(recs.length >= 100, `the rescoped walk reached ${recs.length} prose literals of the rules-text scripts, expected at least 100 (guards the scope itself)`);
  const bad = scan(recs, songTool);
  t.eq(bad.length, 0, fail(bad, '"song" in a rules-text literal (the map tool is a Spell, bible 4.5; say Spell)'));
});
t.test('check 2: the noun "run" (a run is a tour, bible 1.3) is gone from DATA and UI prose; the verb and the musical sense pass', () => {
  const bad = scan(data.concat(ui), nounRun);
  t.eq(bad.length, 0, fail(bad, 'the noun "run" in player-facing text (say tour; a verb or a musical run is fine, else allowlist it with its reason)'));
});
t.test('check 2 self-test: the run rule flags the noun and passes the verb and the Spell', () => {
  selfTest('run rule', nounRun,
    ['Start a new run', 'Win 3 runs', 'Your run ends here', 'Run history', 'Finish the run', 'Best run: 12', 'a soft little run'],
    ['Nowhere to run!', 'Runs away', 'Run after it', 'Run It Again', 'It runs out of puff.', 'The strings run to every phone.', 'Cast Vocal Run', 'her vocal runs', 'The stall is run by a clicking little algorithm.', 'You run behind it through the rain.', 'It runs a lemonade stand.']);
});

// ------------------------------------------------------------------ check 3: the page shells
t.test('check 3: index.html and gallery.html text passes the lists and says HOCUS VOCUS', () => {
  const bad = scan(html, lists);
  t.eq(bad.length, 0, fail(bad, 'retired words in the page shells'));
  const idx = read('index.html');
  t.eq((/<title>([\s\S]*?)<\/title>/.exec(idx) || [])[1], 'HOCUS VOCUS: A Vocal Magic Adventure', 'index.html <title> (bible 1.2)');
  t.ok(/<div id="boot"><b>HOCUS VOCUS<\/b>/.test(idx), 'the boot splash names HOCUS VOCUS');
  t.ok(/<noscript>[^<]*Hocus Vocus[^<]*<\/noscript>/.test(idx), 'the noscript names Hocus Vocus');
  t.ok(/<title>[^<]*HOCUS VOCUS[^<]*<\/title>/.test(read('gallery.html')), 'gallery.html <title> names HOCUS VOCUS');
});
t.test('check 3 self-test: the page-shell matcher flags a retired title', () => {
  selfTest('page shell', lists, ['ECHOWAKE: A Rogue Ballad', 'Echowake needs JavaScript.', 'INKWOVEN gallery'], ['HOCUS VOCUS: A Vocal Magic Adventure', 'Hocus Vocus needs JavaScript.'], { kind: 'html' });
});

// ------------------------------------------------------------------ check 4: the sfx ids (policy D8)
const LEGACY_SFX = ['paint', 'ink_splash', 'brush_pick', 'brush_use', 'ink_gain', 'well', 'page_turn'];
const sfxProblems = (sfx) => {                  // the sfx list keeps its 73 ids, the seven legacy ids among them (a half-done rename must fail here)
  const bad = [];
  if (!Array.isArray(sfx) || sfx.length !== 73) bad.push(`LISTS.sfx has ${sfx && sfx.length} ids, expected 73`);
  if (Array.isArray(sfx) && new Set(sfx).size !== sfx.length) bad.push('LISTS.sfx has a duplicate id');
  for (const id of LEGACY_SFX) if (!(sfx || []).includes(id)) bad.push(`LISTS.sfx lost the internal id "${id}" (plan D8)`);
  return bad;
};
t.test('check 4: the sfx list keeps its 73 ids, including the seven legacy ids', () => {
  t.deep(sfxProblems(D.LISTS.sfx), [], 'LISTS.sfx: 73 ids, no duplicate, the seven legacy ids kept');
});
t.test('check 4 self-test: a short list, a duplicate and a renamed legacy id are all flagged', () => {
  const good = D.LISTS.sfx.slice();
  t.eq(sfxProblems(good).length, 0, 'the real list passes');
  t.ok(sfxProblems(good.slice(1)).length > 0, 'a list of 72 is flagged');
  t.ok(sfxProblems(good.concat(['extra'])).length > 0, 'a list of 74 is flagged');
  t.ok(sfxProblems(good.map((id) => (id === 'paint' ? 'unmute' : id))).length > 0, 'a renamed legacy id is flagged');
  t.ok(sfxProblems(good.map((id, i) => (i === 3 ? good[2] : id))).length > 0, 'a duplicate id is flagged');
});

// ------------------------------------------------------------------ check 5: the four docs
t.test('check 5: README, DESIGN (before 1.1), ART_BIBLE and CONTENT_SPEC pass the lists outside backticks', () => {
  const bad = scan(docs, lists);
  t.eq(bad.length, 0, fail(bad, 'retired words in the docs'));
  t.ok(/\n### 1\.1 /.test(read('DESIGN.md')), 'DESIGN.md has its section 1.1 (the cut line of this check)');
});
t.test('check 5 self-test: a doc line with an old word fails; the same words in backticks, a code fence or DESIGN 1.1 onward do not', () => {
  const flagged = (name, text) => scan(docLines(name, text), lists).length;
  t.eq(flagged('README.md', 'The Hush swallows every Echo.\n'), 1, 'a doc line with old words is flagged');
  t.eq(flagged('README.md', 'The internal id `ink` was the old `Echo`.\n'), 0, 'the same words in backticks pass');
  t.eq(flagged('README.md', 'Fine.\n```\nThe Hush swallows every Echo\n```\nStill fine.\n'), 0, 'a code fence passes');
  t.eq(flagged('README.md', 'See https://example.org/echo-hush for the Hush.\n'), 1, 'a URL is skipped but the words around it are not');
  t.eq(flagged('DESIGN.md', 'A line about the Hush.\n\n### 1.1 Names\nThe Hush is the Gloss.\n'), 1, 'DESIGN.md is checked before section 1.1');
  t.eq(flagged('DESIGN.md', 'Clean prose.\n\n### 1.1 Names\nThe Hush is the Gloss.\n'), 0, 'DESIGN.md is exempt from section 1.1 on');
});

// ------------------------------------------------------------------ check 6: real names
t.test('check 6: no real name (show, broadcaster, platform, surname) in DATA, UI literals, art text, CSS or the page shells; platform labels only on the LINK_ORDER line', () => {
  const bad = scan(data.concat(uiAll, art, css, html, docs), real);
  t.eq(bad.length, 0, fail(bad, 'real names (H3)'));
  const lo = uiAll.filter((r) => /LINK_ORDER = /.test(r.lineText) && r.file === 'ui.js').map((r) => r.text).sort();
  t.deep(lo, ['Facebook', 'Instagram', 'TikTok', 'Website', 'YouTube', 'facebook', 'instagram', 'tiktok', 'website', 'youtube'].sort(), 'the one LINK_ORDER line carries exactly the five platform labels and their keys');
});
t.test('check 6 self-test: shows, platforms and the surname are flagged; the link labels pass only on the LINK_ORDER line; ids and handles pass', () => {
  selfTest('real names', real, ['Eurovision winner', 'on the X Factor', 'Melodi Grand Prix', 'Find us on YouTube', 'TikTok famous', 'follow on Instagram', 'a Facebook post', 'seen on the BBC', 'Andy Benz', 'The Voice judges', { text: 'Benz', kind: 'doc' }],
    ['@roxorloopsandjasmin', 'Made for RoxorLoops and Jasmin.', { text: 'youtube', kind: 'ui' }, { text: 'Andy and Jordan', kind: 'doc' }, { text: 'Follow the duo', kind: 'ui' }]);
  const onLine = { kind: 'ui', file: 'ui.js', lineText: "const LINK_ORDER = [['youtube', 'YouTube']];", text: 'YouTube' };
  const scoped = (r) => SCOPE.get(r.text)(r);
  t.ok(scoped(onLine), 'YouTube is allowed on the LINK_ORDER line of ui.js');
  t.ok(!scoped(Object.assign({}, onLine, { file: 'screen_menu.js' })), 'YouTube is not allowed in another file');
  t.ok(!scoped(Object.assign({}, onLine, { lineText: 'const x = "YouTube";' })), 'YouTube is not allowed on another line of ui.js');
});

// ------------------------------------------------------------------ check 7: animal products
t.test('check 7: no animal product (H5) in DATA, UI literals, art text or CSS content', () => {
  const bad = scan(data.concat(ui, art, css), animal);
  t.eq(bad.length, 0, fail(bad, 'animal products (H5)'));
});
t.test('check 7 self-test: every product of the H5 list is flagged; animal characters, the Air Horn and plant foods pass', () => {
  selfTest('animal products', animal, [
    'a ham sandwich', 'a plate of meat', 'fish and chips', 'seafood stall', 'dairy treats', 'a cheese roll', 'a knob of butter', 'a glass of milk', 'scrambled eggs', 'a spoon of honey',
    'a beeswax candle', 'gelatin jelly', 'a leather jacket', 'a suede shoe', 'a fur coat', 'a wool scarf', 'a felt hat', 'a fleece top', 'a silk robe', 'a pearl necklace', 'coral beads',
    'ivory keys', 'a bone comb', 'a horn comb', 'a shell necklace', 'a tusk', 'a fang pendant', 'a claw ring', 'a skull ring', 'a boa of feathers', 'a down jacket', 'ice cream', 'whipped cream on top',
  ], [
    'Air Horn', 'a goat suit with floppy ears', 'The Coin Crab', 'oat milk latte', 'peanut butter on toast', 'the egg shaker', 'RawClaw', 'Kraki the Karaoke Kraken', 'a gull steals a chip',
    'lentil soup', 'ginger tea', 'noodles and beans', 'cream rim', 'upside down', 'she felt a little better', 'he sat down', 'a foghorn', 'a sparkly sequin', 'opal and opalescent',
  ]);
});

// ------------------------------------------------------------------ check 8: admin words and food remarks
t.test('check 8: no admin word (H4) and no food remark (H6) in DATA, UI prose, CSS or the page shells', () => {
  const recs = data.concat(ui, css, html);
  const a = scan(recs, admin), f = scan(recs, food);
  t.eq(a.length, 0, fail(a, 'admin words (H4)'));
  t.eq(f.length, 0, fail(f, 'food remarks (H6)'));
});
t.test('check 8 self-test: admin words and food remarks are flagged; ordinary words pass', () => {
  selfTest('admin words', admin, ['Sign the contract', 'send an invoice', 'the booking agent', 'a tax form', 'pay the fee', 'check your emails', 'more paperwork', 'the tour manager', 'update the schedule', 'accounting for gold', 'save every receipt'],
    ['Spend gold at the Merch Stall', 'Unmute a hex', 'a booth of glittering stones', 'Jordan sells T-shirts', 'a ticket stub', 'a feeling']);
  selfTest('food remarks', food, ['a vegan treat', 'a vegetarian bake', 'plant-based milk', 'meat-free Monday', 'dairy-free cake', 'a healthy lunch', 'on a diet'],
    ['lentil soup and noodles', 'ginger tea', 'a warm bowl of rice', 'a feast of nothing but applause']);
});

// ------------------------------------------------------------------ check 9: tone
t.test('check 9: no kill, die, dead, death, blood, gore, corpse, alcohol, swearing or "evil" in DATA prose, UI prose, CSS or the page shells', () => {
  const bad = scan(data.concat(ui, css, html), tone);
  t.eq(bad.length, 0, fail(bad, 'tone words (H7)'));
});
t.test('check 9 self-test: the tone words are flagged in prose; the bark key and pose ids are not prose', () => {
  selfTest('tone', tone, ['It will kill the lights', 'killed', 'You die', 'It died on stage', 'dead quiet', 'a sudden death', 'blood on the stage', 'a bit of gore', 'a corpse', 'The Gloss is evil', 'a pint of beer', 'a glass of wine', 'damn it', 'oh hell', 'a cigarette'],
    ['Defeat 500 creatures of the Soundlands.', 'Nobody sits down.', 'The lights go down.', 'The Gloss is polite and very, very shiny.', 'Roll a die.', 'A die-cut sticker.', 'The deadline is Friday.'.replace('The deadline is Friday.', 'Dead-on pitch.').replace('Dead-on', 'Spot-on')]);
  // the ids are single tokens: they are never prose, so no scan reaches them (the walkers only take whitespace-bearing strings)
  t.ok(!isProseText('kill') && !isProseText('die'), 'the bark key kill and the pose die are ids, not prose');
});

// ------------------------------------------------------------------ check 10: art text
t.test('check 10: art text is only the set of HV_ART_AUDIO 1 rule 7 (and gallery sheet text passes the lists)', () => {
  const closed = scan(art, artClosed);
  t.eq(closed.length, 0, fail(closed, 'painted text that is not in the rule 7 set'));
  const retired = scan(art, lists);
  t.eq(retired.length, 0, fail(retired, 'retired words in art text'));
});
t.test('check 10 self-test: an unknown painted word, an old sound word and a stray label are flagged; the rule 7 set passes', () => {
  const game = { kind: 'art', scope: 'game', where: 'fixture' };
  selfTest('art text (closed set)', artClosed, ['WHAM!', 'GAME OVER', 'ZAN!', 'Ouch', 'KABOOM!'], ['LA!', 'BOOM!', 'SIZZ!', 'TING!', 'WOMP!', 'PKAH!', 'NANANA!', 'TA-DA!', 'HOCUS VOCUS', 'APPLAUSE', 'SKIP', 'FLAWLESS!', 'ON AIR', 'ALL AREAS', 'CREW', 'first!', 'mid', 'who asked', '@roxorloopsandjasmin', '14', '58', '2,340'], game);
  selfTest('art text (a sheet label)', artClosed, [], ['one sprite per slab', 'phase 1: the Spinner', 'Kraki, both forms'], { kind: 'art', scope: 'sheet', where: 'fixture' });
  selfTest('art text (old sound words)', lists, ['ZAN!', 'BAN!', 'KIN!', 'PIKA!', 'WAAN!', 'BUKU!', 'DON!', 'SHH'], ['LA!', 'BOOM!', 'SIZZ!'], game);
  // the extractor itself: a fixture source goes through the same token walk
  const fx = tokenizeJs("ART.sheet('s', (g) => { g.fillText('in a sheet', 0, 0); }); function f(g) { g.fillText('SPLAT!', 0, 0); S.text('TA-DA!', 1, 2); tk.inkText(g, 'WHAM!', 0, 0, 9); const o = { text: 'HEY' }; }").filter((k) => k.t !== 'comment');
  const calls = fx.filter((k, i) => k.t === 'id' && k.v in ART_CALLEES && fx[i + 1] && fx[i + 1].v === '(').map((k) => callArgs(fx, fx.indexOf(k)));
  t.deep(calls.map((a) => pieces(a[0]).concat(pieces(a[1] || [])).join('|')), ['in a sheet', 'SPLAT!', 'TA-DA!', 'WHAM!'], 'the extractor reads the text argument of fillText, S.text and inkText');
});

// ------------------------------------------------------------------ check 11: American spellings
t.test('check 11: no American spelling in DATA or UI prose', () => {
  const bad = scan(data.concat(ui), american);
  t.eq(bad.length, 0, fail(bad, 'American spellings (H10: colour, favourite, centre, grey, recognise, travelling)'));
});
t.test('check 11 self-test: the American forms are flagged; the British forms pass', () => {
  selfTest('american spelling', american, ['a colorful hat', 'your favorite song', 'center stage', 'a gray cloud', 'recognize the tune', 'traveling light', 'a gold color', 'the theater', 'costume jewelry', 'a flavor of tea', 'an honor guard'],
    ['a colourful hat', 'your favourite song', 'centre stage', 'a grey cloud', 'recognise the tune', 'travelling light', 'the theatre', 'costume jewellery', 'a travelling band', 'the programme', 'Centred', 'honour guard']);
});

// ------------------------------------------------------------------ check 12: CSS content strings
t.test('check 12: CSS content strings pass the lists and the run rule', () => {
  const bad = scan(css, lists).concat(scan(css, nounRun));
  t.eq(bad.length, 0, fail(bad, 'retired words or the noun "run" in CSS content strings'));
});
t.test('check 12 self-test: a retired CSS content string and a noun run are flagged', () => {
  selfTest('css content', lists, ['RETAIN', 'Echo', 'Chimes'], ['HOLD', 'WON!', 'LEAD'], { kind: 'css', key: 'content' });
  selfTest('css content (run)', nounRun, ['Start a run'], ['LEAD'], { kind: 'css' });
});

// ------------------------------------------------------------------ the allowlist itself
t.test('the allowlist is small, exact, pinned and every entry has a reason', () => {
  for (const [s, why] of [...ALLOW, ...ALLOW_CONTAINS]) { t.ok(typeof s === 'string' && s.length > 0, 'allowlist string'); t.ok(typeof why === 'string' && why.length > 20, `reason for "${s}"`); }
  t.eq(ALLOW.length, 17, 'exact allowlist size (add an entry only with a bible 6.4 or plan reason, and bump this number in the same change)');
  t.ok(ALLOW_CONTAINS.length <= 2, 'at most two contains entries');
  t.eq(ALLOW_CONTAINS.length, 1, 'contains allowlist size (DATA only)');
  t.eq(new Set(ALLOW.map((e) => e[0])).size, ALLOW.length, 'no duplicate allowlist entries');
  for (const [s] of SCOPE) t.ok(allowMap.has(s), `the scope of "${s}" belongs to an allowlist entry`);
  t.ok(SCOPE.get('?')({ kind: 'art' }) && !SCOPE.get('?')({ kind: 'ui' }), 'the art placeholders are allowed in art text only');
  t.ok(SCOPE.get('Limited Edition')({ kind: 'data' }) && !SCOPE.get('Limited Edition')({ kind: 'ui' }), 'the survivor names are allowed in DATA only');
  t.ok(SCOPE.get('Page ')({ kind: 'ui', file: 'screen_menu.js' }) && !SCOPE.get('Page ')({ kind: 'ui', file: 'ui.js' }), 'the how-to pagination words are allowed in screen_menu.js only');
});
t.test('every allowlist entry is still needed (flagged without it): a stale entry would let the word come back unseen', () => {
  for (const [s] of ALLOW) t.ok(usedExact.has(s), `allowlist entry "${s}" is not needed any more (no matcher flags it): drop it`);
  for (const [s] of ALLOW_CONTAINS) t.ok(usedContains.has(s), `allowlist contains entry "${s}" is not needed any more: drop it`);
});

t.done();
