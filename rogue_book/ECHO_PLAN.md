# ECHOWAKE: the Echo re-theme of `rogue_book` (execution plan)

Status: PLAN rev 2 (three critic reviews applied, Appendix F), not started. Phases merged: none. (Each phase PR updates this line,
for example `Phases merged: P1 <sha>, P2 <sha>`; 9.0.0 says how to find the next phase.) Base commit `a2bd24b` (main, 2026-10-03). Every line number in this file is from that commit: always match on
the quoted code, never on a number alone, because earlier phases move lines.

This file is the ONLY document the executing session follows. It stands alone: the planner's six inventory lenses (data names, UI copy,
art, audio, tests and docs, narrative) are merged into it, conflicts between them are resolved here, and every exact string the work
needs is either in section 5 or in the appendices at the end. When a decision changes (section 2), change it in section 3 first and then
everywhere the glossary word appears.

## 0. How to use this plan

1. Read sections 1 to 4 once. They are short and they decide every word.
2. Then execute section 9 phase by phase, in order: P1, P2, P3, P4, P5, P6, P7a, P7b, P8, P9, P10 (eleven PRs). Each phase is ONE pull request: branch, work, `npm run check` green,
   push, draft PR, ready, squash merge, sync, play link (9.0). Never start a phase before the previous one is merged.
3. Inside a phase, the lead (you) may run the listed agents in parallel. Their files are disjoint by construction. Give each agent the
   standard preamble (9.0.4) plus its prompt. Agents never commit, never push, never edit a file they do not own; the lead reviews,
   runs the tests, commits and ships.
4. Exact strings live in section 5 (data names) and in Appendix A (story, enemies, fables, achievements, trials, tips), Appendix B (UI
   copy per file), Appendix C (UI test edits and copy budgets), Appendix D (art direction per function), Appendix E (audio engine code).
   If an appendix row and the glossary (section 3) disagree, the glossary wins: fix the string to the glossary word and note it in
   the PR body.
5. House rules for everything you write (code, copy, docs, tests, commit messages): NEVER an em dash or an en dash (a hygiene suite
   scans every text file and the owner forbids them; in player copy also never ` - ` or `--` used as a dash: use a comma, a colon or a
   full stop; a hyphen inside a compound like `Off-Key` is fine; there is NO exception: the document title is `ECHOWAKE: a rogue ballad`
   and the transition header is `A NOTE FROM THE ROAD`). No tab indentation. Never write the literal name of the platform's
   unseeded random function anywhere, not even in a doc or a comment: say "the banned random call" and use `U.rng`. ES2020 only (no
   `??=`, `||=`, `&&=`, `.at()`, private fields, static blocks). British spelling in player copy (colour, grey, armour, recognise).
   Printable ASCII in every DATA string (no music-note symbols, no curly quotes in DATA).
6. The repository folder `rogue_book/`, the URL `https://games-71g.pages.dev/rogue_book/`, the `localStorage` keys `rb_profile_v1`
   and `rb_run_v1` (and every `rb_*` key), `package.json` script names, the `build.js` entry `'rogue_book'`, test file names
   `tests/rogue_book_*` and `tools/rogue_book/` NEVER change.
7. Long file: this plan is about 420 KB with long lines. Never read it whole. Find your rows with `grep -n` (every prompt names its
   anchors, for example `grep -n '^##### boss_editor' rogue_book/ECHO_PLAN.md`) and read them with the Read tool's offset and limit.
8. Lowercase "song" is banned in UI copy, tooltips, tips, achievement and trial text, tile, keyword, status, hero and relic text: there
   the world is "the land" and a run is "a journey". "the song" and "the Great Song" appear only in lore pages, barks, fables, enemy
   says and lore, and card flavour (3.1, enforced by 8.3 check 6).

## 1. Summary, goals and non-goals

INKWOVEN's ink, brush and book theme is too close to Roguebook. The owners (RoxorLoops and Jasmin, a beatbox and singing duo) re-theme
the whole game to ECHO: a yokai called the Hush has eaten every sound; the land is grey and still; two heroes wake it hex by hex with
voice and rhythm. Ink becomes Echo, Brushes become Songs, ink wells become temple bells, the Blank becomes the Hush, Kuro becomes the
Songweaver with a flute, and because all audio is synthesized, every woken hex plays a note so the path you choose writes a melody.
The game is renamed ECHOWAKE.

Goals:

- Every player-facing word, picture and sound of the ink, brush, paper and book theme is replaced by the Echo theme (sections 3 to 7).
- The book visuals go: title book, map page frame and paper, event storybook, story book page, page-turn and ink-blob transitions.
- New Echo features that are pure presentation: the melodic reveal (each woken hex sings one note of a seeded per-map tune), the Hush
  ambience (map music is muffled and sparse until the land wakes), temple bell sound tuned to the map key.
- A permanent theme-leak test so the old theme cannot creep back (8.3).

Non-goals (hard constraints, checked by gates in 8.7):

- NO mechanic, number, balance value, cost, rarity, op, AI table, RNG stream, map generation or rule changes. The balance bot's per-run
  records must be byte-identical before and after (determinism gate, 8.7).
- NO internal id changes (policy D8): card, relic, gem, enemy, move, event, achievement, trial, lore, status, keyword, brush, tile, op,
  hook, mod, stat, motif, icon, scene, palette, fx, sfx, music, screen, tab, bus event, data-tut, CSS class and custom property, sheet
  and function names all stay. Saves from before the re-theme load unchanged.
- The anime ink LINE drawing style stays (calligraphic outline, cel shading, screen tone, gold leaf): it is a look, not the theme. Its
  internal name "Sumi-Shonen" and helpers like `ART.tk.inkPath` stay.
- No new screens, no new settings, no new mechanics, no new content ids (only new presentation functions and tests).

## 2. Decisions

Defaults are chosen; the executing session uses them unless the owner says otherwise (section 11 lists the questions). "Blocks" names
the first phase that bakes the decision in; after that phase merges, changing it costs a sweep.

| # | Decision | Default (use this) | Alternatives | Why | Blocks |
|---|---|---|---|---|---|
| D1 | Game title and tagline | **ECHOWAKE**, "a rogue ballad" (document title `ECHOWAKE: a rogue ballad`, a colon, never `--`; mixed case `Echowake`) | the same three everywhere in this plan: 1 ECHOWAKE (default), 2 YAMABIKO (the mountain-echo yokai, folklore exact, opaque outside Japan), 3 HUSHBREAKER (shonen energy; 11 letters, every fixed-width title layout must be retuned). RESOUND is dropped (generic). Tagline alternate "a rogue song" | Says the verb of the game (wake the land with Echo), and "wake" is also a vigil, which suits the melancholy. Same 8 letters as INKWOVEN, so the card back, share card, boot splash and logo keep their sizes; the logo reuses E, O, W, K and needs only C, H, A. KODAMA is out: `kodama` is already an enemy | P3 (title strings), P8 (logo letters) |
| D2 | Map resource | **Echo** (uncountable: "7 Echo", never "Echos") | none (owner) | owner pitch | P2 |
| D3 | One-use map tools | **Songs**: Drum Line (`stroke`), Ripple (`wave`), Shout (`fan`), Beat Drop (`splash`), Chorus (`halo`), Hum (`blot`); you *learn* a Song and *sing* it | none (owner) | owner pitch | P2 |
| D4 | Meta currency (was Inkstones) | **Chimes** ("+52 Chimes", "13 Chimes", always plural like today) | Notes (rejected: collides with the per-hex melody notes, the Cinder Note card and several move names); Encores | a distinct noun; furin wind chimes are shrine objects | P3 |
| D5 | Meta hub (was the Library) | **the Hall of Echoes** (title plaque says `Hall`, banner `The Hall of Echoes`) | the Shrine of Echoes (plaque `Shrine`, a stronger folklore anchor for furin Chimes and ema achievements; owner question 2); Listening Hall (too wide for the 84 px phone plaque) | it holds unlocks, feats, the bestiary, the ballads you have heard and your history; `Hall` is the width-checked plaque word | P3 |
| D6 | Structure word (was Chapter) | **Verse**: `Verse I`, `Verse II`, `Verse III` in UI, "the first verse" in prose, `VERSE ONE` in kickers | Movement (grander, but collides with the party's movement on the map); keep Chapter (zero churn, but the biggest HUD label stays a book word) | song structure is the owners' own language; story kickers become INTRO, VERSE ONE, OUTRO | P2 |
| D7 | A run, in UI copy (was a tale) | **journey** ("New Journey", "Begin the Journey", "Your journey is saved") | none | a run cannot be a "song": Songs are the map tools | P3 |
| D8 | Internal id policy | **A: keep every internal id**, including the 7 sfx ids whose names are old words (`paint ink_splash brush_pick brush_use ink_gain well page_turn`: their recipes are re-voiced, the ids stay). DESIGN.md gains section 1.1, a legacy-name table | B: rename internals (about 7,800 tokens, changes RNG streams hashed with `'brush'`, `'fable'`, `'daily'`, `'trialCurses'`, silently drops saved decks and unlocks because `RUN.deserialize` drops unknown ids); C: rename only the 7 sfx ids (the audio lens designed it, Appendix E end; optional, owner's call) | makes "no mechanic changed" provable bit for bit, needs no save migration, keeps churn to display strings | P1 |
| D9 | Event tile name | **keep "Fable"** (fables are folk tales told aloud: oral tradition fits Echo) | Whisper ("Hear 60 whispers"; costs tip, how-to regex and test edits) | lowest churn, on theme | P2 |
| D10 | Event screen concept | **a kamishibai storyteller stage**: a small wooden street-theatre box whose doors open on the scene plate, the text on a narrator's board beside it, hyoshigi clappers on a cord instead of the bookmark ribbon; the `page_turn` sound becomes two hyoshigi claps; the scene plate changes by the doors opening and closing, never by a sliding card. Keeps every `.ev-*` class and the 1136 x 592 geometry | a lantern-lit folding screen (byobu) | kamishibai is told aloud, with clapper sounds: the most "Echo" way to tell a fable | P8 |
| D11 | Kuro's resource (status `sumi`) | **Breath** | Tone | a flute player builds breath and spends it; reads well in every generated template | P2 |
| D12 | Tile names | Bookmark -> **Downbeat**; Unwritten Void -> **Dead Silence**; Chapter Boss -> **Keeper**; Ink Well -> **Temple Bell**; Brush Rack -> **Songbird**; Inkstone Forge -> **Tuning Forge**; Fable stays | Trailhead, the Hollow, Guardian, Singing Stone, Bell Forge | "Keeper" matches the lore spine (each boss is a keeper who held on too tightly) | P2 |
| D13 | Bosses | Kuzunoha, **The Nine-Voiced Fox**; Jorogumo, The Silk Courtesan (unchanged); `boss_editor` becomes **The Conductor**, title **Keeper of the Last Note**, three forms **the Conductor, the Damper, the Hush** | Keeper of the Last Rest; The Nine-Tail Voice Thief | validated against every enemy and narrative suite | P2 |
| D14 | Verse III title | **The Thunderless Citadel** (Verses I and II keep The Whispering Bamboo Grove and The Sunken Lantern City) | | lightning without thunder: the storm enemies keep their names | P4 |
| D15 | Test strategy | Harden tests first (P1: `data-act` hooks, tests read names from DATA, frozen-id checks), then rename with literal copy pins updated in the same commit as the copy. **No `DATA.TERMS` glossary object in code** | the tests lens's `DATA.TERMS` object read by data_text, run and meta | fewer moving parts for the executor; generated text is pinned by literal expected strings, updated in the same phase | P1 |

## 3. Glossary (single source of truth)

### 3.1 Words

| Internal id or term (stays) | Old player-facing | New player-facing | Grammar and notes |
|---|---|---|---|
| `R.ink`, op `ink`, keyword `ink`, `ECONOMY.startInk inkMax wellInk campInk killInk paintCost`, mods `inkMax startInk wellInk` | Ink | **Echo** | uncountable: "1 Echo", "7 Echo", "your max Echo", meter label `Echo`, pill `Echo 7/14`. "echo"/"echoes" lowercase only as plain English in prose |
| op `paint`, `RUN.paint`, hook `onPaint`, bus `map:paint`, stat `hexesPainted`, map kind `painted` | paint / painted / painting | **wake / woke / woken / waking**; state adjective **awake** | "Wake 3 hexes for free", "whenever you wake a hex", "next to any woken hex", "12 of 180 hexes awake", "34% awake", "awake ground" |
| map kind `fog`, unrevealed hex | blank paper, Unwritten page, fog | **silent** (adjective), **Silent ground** (hex name), "grey fog" allowed | the Hush made it silent |
| landmark seen in fog | glimpsed / seen | **heard** | "Keeper, heard"; legend "Heard from afar" |
| `DATA.brushes`, keyword `brush`, op `addBrush`, `R.brushes`, stat `brushesUsed` | Brush, Brushes | **Song, Songs** (capital S) | you *learn* a Song (gain), you *sing* it (use); the tray is the "Song tray"; the apply button is **Sing** ("Sing 3") |
| brush ids `stroke wave fan splash halo blot` | Long Stroke, Wave Sweep, Fan Brush, Ink Splash, Halo Ring, Quick Blot | **Drum Line, Ripple, Shout, Beat Drop, Chorus, Hum** | owner list |
| tile `well`, stat `wellsDrunk`, sfx `well` | Ink Well, well | **Temple Bell** (tile), "temple bells" / "a bell" in prose | "The bell rings: 4 Echo." |
| tile `brush` | Brush Rack | **Songbird** | "Songbirds and champions teach them." |
| tile `forge` | Inkstone Forge | **Tuning Forge** | keeps the word "forge" (tip and tip-word test) |
| tile `start` | Bookmark | **Downbeat** | |
| tile `block` | Unwritten Void, the Void | **Dead Silence** | UI reads `DATA.tiles.block.name` instead of hard-coding it |
| tile `boss` | Chapter Boss | **Keeper** | "The keeper of this verse."; boss reveal tag `KEEPER` |
| tile `event` | Fable | **Fable** (unchanged) | |
| `R.chapter`, lore `ch1_intro`, screen `chapterClear`, `boss1Kills` | Chapter | **Verse** | `Verse I`, `Verse 2` (the runInfo line uses digits like today), `VERSE ONE COMPLETE`, "per verse", "each verse" |
| `ECONOMY.inkstones`, `META` field `inkstones`, `reward.inkstones`, stat icon `inkstone` | Inkstones | **Chimes** | always plural in UI, like today; "Every Chime" in one confirm sentence |
| screen `library`, key `L`, classes `mn-lib*` | Library, The Library | **Hall** (title plaque), **The Hall of Echoes** (banner, prose: "in the Hall of Echoes") | key stays L |
| library tab `story`, story pages | Story, pages, "pages read" | tab **Ballads**; "2 of 12 ballads heard"; contents heading **Setlist**; loose pages **Stray Ballads**; groups **The Verses** (verse intros and clears), **The Endings**, **The Voices**; one story page is "a ballad" | "Verse" names ONLY the three acts (Verse I, II, III); how-to pagination keeps "page" (generic help pagination) |
| trials `trial_1..10`, stat `trialBest` | Ink Trial(s) | **Tempo Trial(s)** | short "Trial" stays where it is today; trial 10 "The Red Pen" becomes "The Red Baton" |
| `R.daily`, stat `dailyRuns` | Daily Tale | **Daily Jam** | "Play 5 Daily Jams" |
| a run | tale | **journey** | "New Journey", "No journeys yet", "Your journey is saved" |
| antagonist | the Blank | **the Hush** | always capital H, always with "the": "the Hush". Never evil: polite, patient, hungry. A yokai in the shape of a yamabiko (the mountain echo spirit) that stopped answering calls and started swallowing them |
| the world | the Living Book, the book | **the land** (all UI, tips, tooltips, achievements), **the Great Song** / "the song" (lore, barks, fables, enemy text and card flavour only) | lowercase "song" in UI copy is a leak (8.3 check 6) |
| the creator | the Author | **the Singer** | |
| status `sumi`, hero `res:'sumi'` | Sumi | **Breath** | capitalised in generated text |
| hero `kuro` title | The Inkweaver | **The Songweaver** | passive `steady_hand` named **Steady Breath** |
| final boss `boss_editor` | The Editor, Keeper of the Last Page; forms Editor, Eraser, Blank Page | **The Conductor, Keeper of the Last Note**; forms **the Conductor, the Damper, the Hush** | the red pen becomes the red baton |
| `boss_kuzunoha` title | The Nine-Tail Ink Fox | **The Nine-Voiced Fox** | |
| story screen kickers | PROLOGUE, CHAPTER ONE, CHAPTER ONE COMPLETE, EPILOGUE, INTERLUDE, A HERO OF THE BOOK, A PAGE; seals ONCE, roman, END, BLANK | **INTRO, VERSE ONE, VERSE ONE COMPLETE, OUTRO, INTERLUDE, A VOICE OF THE SONG, A BALLAD**; seals ONCE, roman, END, **REST** | |
| story button | Turn the page | **Play on** | |
| tip label | Margin note, A hint from the margins | **Liner note**, **A note from the road** | class `.mn-margin` stays |
| hero unlock | "Suzu joins the book" | **"Suzu joins the band"** | lowercase "song" is not UI copy (rule 0.8) |
| defeat | the page goes white | **a rest in the music** ("A Rest in the Music"); kicker `THE SONG FADES` | |
| victory | the ending, rewritten | **the Final Chorus**; share line "ECHOWAKE: the Hush let go" (the Hush is never destroyed: it lets go like a breath) | |
| transitions `'ink'`, `'page'` | ink blobs, page turn | sound-ring wipe, shoji door slide | kind ids stay |
| element `ink` (Kuro's damage), fx `inkSplash` | ink splat, word `SHAA!` | sound burst, word `WAAN!` | ids stay |

### 3.2 Words to avoid in player-facing text, and the allowed survivors

| Avoid | Use instead |
|---|---|
| ink, inky, Ink (currency) | Echo (currency), echo (the sound) |
| paint, painted, painting (hexes) | wake, woken, awake |
| brush, Brush, brushes | Song, Songs |
| page, pages, blank paper, storybook, book, bookmark, library, archive, manuscript, scroll (as writing) | verse, the land, silent ground, the Hall of Echoes, music hall, music box |
| author, the Author | the Singer |
| blank, the Blank | the Hush; grey, silent, still |
| quill, pen, red pen, nib | flute, baton, the red baton |
| write, wrote, written, rewrite, unwrite, handwriting | sing, sang, sung, hum, play, call; unsing |
| edit, editor, edition, draft, proofread, revision, redacted, typo, scribble, footnote, margin | rehearse, conduct, audition, cut off, tune, muffle, smother, sour note, harmony, rest |
| chapter | verse |
| Inkstones, Ink Trials, Daily Tale, tale (a run) | Chimes, Tempo Trials, Daily Jam, journey |
| erase, eraser, smudge, blot | silence, damper, muffle, hush |

Allowed survivors (each needs an allowlist entry with this reason in the theme-leak suite, 8.3): "paper" for folk craft (Paper Puppet,
Paper Crane, Oil-Paper Umbrella, A Sea of Paper Boats, A Thousand Paper Cranes, Suzu's paper talismans and Paper Seal), Blank Stare
(a generic idiom, `nopperabo`), Bounty Scroll (a bounty notice), fable, story and tale meaning a folk tale told aloud (never the world,
never a run), "read" for reading a sign, a menu or an intent, "word" for spoken words, the credits line "Drawn in ink, sung in code."
(the drawing style), the How to play pagination ("How to play, page 3 of 8"), "page" in the fixed developer gallery names. The exact
allowlist is in 8.3.

### 3.3 Capitalisation sheet

Echo (currency) / echo (sound). Song, Songs, Drum Line, Ripple, Shout, Beat Drop, Chorus, Hum. Temple Bell (tile) / temple bells (prose).
Songbird, Tuning Forge, Downbeat, Dead Silence, Keeper (tiles). Tempo Trial 1 to 10. Daily Jam. Chimes. the Hall of Echoes. Verse I, II,
III / "the first verse". the Hush. the Singer. the Great Song / the song (lore only). the Conductor, the Damper. Ballads (the story collection). Breath. Fable. ECHOWAKE (logo, share
card, document title) / Echowake (prose).

## 4. World and narrative bible

### 4.1 The premise in one breath

Once there was a land that sang itself. Every hill answered when you called, every river hummed back, and the whole country was one
long song that kept itself going: the Great Song. Its **Singer** had sung it so long and so well that one day the song simply kept going
without a voice. Then, on an ordinary night, just before the last note, the Singer's own doubt whispered that it might come out wrong,
and the Singer held a breath and never let it go. That held silence grew into **the Hush**: a polite, unhurried yokai that eats sound.
It wears the shape of a yamabiko, the mountain echo spirit of folklore, one that stopped answering calls and started swallowing them
(an echo turned inside out, which gives the antagonist its folklore root). Where it has eaten, the land is grey and still. Bamboo stops whispering, rivers stop humming,
festival drums go slack, and lightning falls without thunder. But a song that sings itself is never quite silent. Two of the voices the
Singer left inside it wake, hear each other, and decide the song is not going to end on a rest. They cross the grey land hex by hex,
waking it with voice and rhythm. **Every hex they wake plays a note, so the road they choose becomes a melody.**

The spine (it replaces the "THE SPINE" header comment in `js/data_meta.js` lines 24 to 30; exact text in Appendix A): the Singer sang
the land with four voices, nerve (Hanae, the beat), curiosity (Kuro, the harmony), tenderness (Suzu, the melody) and laughter (Raiga, the
boom). One causal chain, used by every page, lore line and art brief: (1) the Singer's fifth voice, doubt, became the Conductor, who
wanted the last note to be perfect; (2) doubt made the Singer hold a breath before the last note; (3) that held silence grew into the
Hush, a yamabiko-shaped yokai that eats sound; (4) the Conductor now conducts the Hush from the Thunderless Citadel, cutting off every
note that is not perfect and feeding it to the Hush; (5) in the final fight, phase 2 is the Hush itself pouring out of him. The Conductor
is a part of the Singer (the doubt), never the Singer, and never the Hush. Each boss is a keeper who held on too tightly:
Kuzunoha held the SOUNDS (she sang over the grove until she sang walls), Jorogumo held the PEOPLE (she kept the festival guests at one
silent supper so the Hush could not eat them), the Conductor holds the ENDING. The heroes win by letting the song move: the Conductor is
not destroyed but joined, the last line is sung together and left open on purpose, the Hush lets go like a held breath, and the land asks
to be sung again. The Singer is whoever sings along.

### 4.2 Tone

Shonen adventure meets folklore melancholy: warm, dramatic, a little funny, never mean, never crude. Sound is the emotional currency:
when something good happens, something rings, hums, chimes, laughs, chirps or sings; when the Hush wins, things go grey, soft, still,
muffled. The Hush is described by absence and never as evil. Nobody dies in the frame story: defeat is a rest in the music, "once more
from the top".

### 4.3 The heroes (names, titles and kits unchanged except Kuro)

| Hero | Voice in the band | Instrument cue | Speech |
|---|---|---|---|
| Hanae, the Blossom Blade | the beat: her cuts ring like struck bells and land on the count | hyoshigi clacks, kotsuzumi | dry, proud, never shouts; keeps the running gag "Nobody. Saw. That." exactly once |
| Kuro, **the Songweaver** | the harmony: a quiet second line under the melody, played on an oversized shakuhachi | shakuhachi | teasing with a straight face, musical jargon, meta ("I listened ahead"), never shouts |
| Suzu, the Moon Miko | the melody keeper: hums lullabies, keeps the land in tune | rin bell, koto | soft, steady, never raises her voice |
| Raiga, the Thunder Monk | the boom: his laugh is the Singer's own thunder | taiko | booming, kind, calls everyone "friend" |

The owners are a beatbox and singing duo, and the pitch says "voice and rhythm": Hanae, the beat, carries the vocal percussion
(kuchi shoga, the spoken taiko syllables `don`, `ka`, `tsu`, folklore's own cousin of beatboxing) and Suzu, the melody, carries the sung
voice. The Songs are voiced by the new `vox` voice (7.1, Appendix E 7.1.10): Hum is a closed-mouth "mm", Chorus is stacked "ah", Shout is
a "hey!", Drum Line speaks kuchi shoga, Beat Drop is a beatbox kick and sub drop. Small bells (rin, suzu) belong to Suzu alone; temple
bells belong to the map.

Kuro: he began as a harmony the Singer hummed under the melody, given a personality. He is the only one who knows he lives in a song and
listens to the last bar first. His weapon is an oversized lacquered shakuhachi carried like a staff (same silhouette as the old brush
staff, the tip anchor stays), finger holes glowing cyan; notes hang in the air as glowing sound rings that he weaves into shapes (why he is
the Songweaver); a cord with a small bronze flute charm (a miniature shakuhachi, never a bell) replaces the scroll strip; cyan note glyphs on the backs of his hands; a waveform hem.
Palette unchanged (`#7a6bff #5ff5ff #1a1740`). His resource Sumi is displayed as **Breath** (status id `sumi` kept), his passive **Steady
Breath**, his hero moment fable `kuro_footnote` becomes "Kuro's Harmony". His card archetypes (comments only): BLIGHT becomes DIRGE
(poison and burn), SUMI becomes BREATH (build and pour), SCRIBE becomes ARRANGER (card manipulation).

### 4.4 The three verses

| # | Title (lore `chN_intro.title`, map banner, bestiary heading) | Look and sound |
|---|---|---|
| I | The Whispering Bamboo Grove (kept; tests grep `/Whispering/`) | golden dusk, kodama that answer every call one beat late, bamboo murmuring the tune it is afraid to forget; scale yo (map1, G) |
| II | The Sunken Lantern City (kept; tests grep it) | a festival town that never stopped: slack drums, flutes full of water, karakuri dancing to music nobody can hear; scale in-sen (map2, A) |
| III | **The Thunderless Citadel** (was The Crimson Sky Citadel) | the same storm fortress above crimson cloud, but lightning falls in silence, bells are wrapped in grey felt, strings are cut, grey holes in the sky are cut-off notes; scale miyako-bushi (map3, D) |

### 4.5 Bosses and the Hush's servants

- **Kuzunoha, The Nine-Voiced Fox** (Verse I): a huge white fox whose nine tails each end in a small brass bell (where the ink-dipped
  brush tips were), glowing violet eyes, a floating mask. She held the sounds: every time the Hush ate a note she sang two more, until her
  song was a wall nobody could hear through. Her summons are Hollow Kodama (tree spirits with their echo eaten out).
- **Jorogumo, The Silk Courtesan** (Verse II): unchanged data; her story now reads as keeping the guests at one silent supper.
- **The Conductor, Keeper of the Last Note** (Verse III, id `boss_editor`): phase 0 the Conductor (a tall pale figure in a felt-grey
  formal haori, white gloves, a calm noh-smooth face, a thin red lacquered baton where the red pen was); phase 1 the Damper (the same
  figure swollen into a giant wrapped in quilted grey felt, arms ending in padded dampers, the band text `SHH`); phase 2 the Hush itself
  pouring out of him (a colossal grey face in a hole in the sky, mouth wide open making no sound, the storm pouring into it, with the faint
  silhouette of a yamabiko, a shaggy mountain imp, inside the grey). Victory reveal: the Conductor speaks in the Singer's own tired voice,
  because he is the Singer's doubt, "A wrong note can never be unsung, so I never let one come."
- Verse III servants are built from sound-absorbing stuff of the Edo world (grey quilted felt, cotton wadding, layered futon quilting,
  wrapped grey cloth gags and cord bindings, grey ash and frost flecks; never TV static, studio foam or black redaction bars): Muffled
  Knight, Grey Cantor, Silent Soldier, Muffle Wraith, Felt Golem, Off-Key Imp, Censor Golem (kept), Hush Inquisitor, Hush Moth, Sour
  Note. The storm creatures keep their names ("the storm with no thunder").

### 4.6 Rewrite briefs (exact strings in Appendix A)

| Content | Count | Brief | Where the exact text is |
|---|---|---|---|
| Story pages (`intro ch1_intro ch2_intro ch3_intro ch1_clear ch2_clear victory defeat hero_hanae hero_kuro hero_suzu hero_raiga`) | 12 | every page names the Author, the Blank, a book, a page or ink: all rewritten, ids kept; each text 400 to 700 characters, at least 6 sentences, starts with a letter (drop cap); shared pages never name a hero | Appendix A "Lore: every page, rewritten" |
| Barks | 30 Kuro lines, 3 single-line swaps (Hanae, Suzu), Raiga none | Kuro musical and teasing, at most one `!` | Appendix A "Barks" |
| Fables (`data_events.js`) | 48: 20 keep, 15 light, 13 rewrite | ids, ops, weights, gates and flags never change; only `title`, `text`, choice `label`, `cost`, outcome `text` | Appendix A "Exact patches" |
| Enemy names, titles, moves, says, phases, bestiary lore | Kuzunoha, Hollow Kodama, the Conductor and 9 Verse III enemies | the only cross-enemy shared move name in Verse III becomes `Smother` (wraith and Damper) | Appendix A "Validated enemy patches" (one planner override: the Conductor's `clean` move is `Tacet`, already applied there) |
| Achievements, Tempo Trials, tips | 18, 4, 8 | numbers and "Trial 1/5/10" kept; tips have no digits | Appendix A "Achievements, Tempo Trials and tips" |
| Test edits forced by the story | narrative, content, enemies | spine test, Kuro bark regex, Echo cost guard, old-words guard | Appendix A "Test changes this lens forces" |

## 5. Master rename tables (id unchanged in every row)

### 5.1 `js/data.js` (statuses, keywords, Songs, tiles, heroes)

| Line | Path (id stays) | Field | Old | New |
|---|---|---|---|---|
| 206 | `statuses.sumi` | name | `Sumi` | `Breath` |
| 206 | `statuses.sumi` | text | `Kuro\'s ink charge. Built by his skills, poured into his spells.` | `Kuro\'s breath. Built by his skills, released through his flute.` |
| 230 | `keywords.ink` | name | `Ink` | `Echo` |
| 230 | `keywords.ink` | text | `Spend Ink on the map to paint a hex and reveal it.` | `Spend Echo on the map to wake a silent hex and reveal it.` |
| 231 | `keywords.brush` | name | `Brush` | `Song` |
| 231 | `keywords.brush` | text | `A one-use brush that paints a shape of hexes for free.` | `A one-use Song that wakes a shape of hexes for free.` |
| 236 | `keywords.down` | text | `... If both fall, the tale ends.` | `... If both fall, the journey ends.` (only the last clause changes) |
| 298 | `brushes.stroke` | name / text | `Long Stroke` / `Paint 3 hexes in a straight line, starting next to any painted hex.` | `Drum Line` / `Wake 3 hexes in a straight line, starting next to any woken hex.` |
| 299 | `brushes.wave` | name / text | `Wave Sweep` / `Paint 5 hexes in a straight line, starting next to any painted hex.` | `Ripple` / `Wake 5 hexes in a straight line, starting next to any woken hex.` |
| 300 | `brushes.fan` | name / text | `Fan Brush` / `Paint a wedge of 3 hexes next to a painted hex.` | `Shout` / `Wake a wedge of 3 hexes next to a woken hex.` |
| 301 | `brushes.splash` | name / text | `Ink Splash` / `Paint a hex next to the painted area and the 6 hexes around it.` | `Beat Drop` / `Wake a hex next to the woken land and the 6 hexes around it.` |
| 302 | `brushes.halo` | name / text | `Halo Ring` / `Paint all 6 hexes around any painted hex.` | `Chorus` / `Wake all 6 hexes around any woken hex.` |
| 303 | `brushes.blot` | name / text | `Quick Blot` / `Paint any one hex within 4 of the party.` | `Hum` / `Wake any one hex within 4 of the party.` |
| 308 | `tiles.start` | name / text | `Bookmark` / `Where the tale begins.` | `Downbeat` / `Where the journey begins.` |
| 310 | `tiles.block` | name / text | `Unwritten Void` / `A hole in the story. Nothing can cross it.` | `Dead Silence` / `A hole in the land. Nothing can cross it.` |
| 311 | `tiles.enemy` | text | `A creature of the tale blocks the way.` | `A creature of the Hush blocks the way.` |
| 313 | `tiles.boss` | name / text | `Chapter Boss` / `The keeper of this chapter.` | `Keeper` / `The keeper of this verse.` |
| 318 | `tiles.well` | name / text | `Ink Well` / `Refills your Ink.` | `Temple Bell` / `Ring it to refill your Echo.` |
| 319 | `tiles.brush` | name / text | `Brush Rack` / `Take a one-use brush.` | `Songbird` / `Learn a one-use Song.` |
| 321 | `tiles.forge` | name | `Inkstone Forge` | `Tuning Forge` (text unchanged) |
| 317 | `tiles.event` | | `Fable` | unchanged |
| 341 | `heroes.kuro.title` | | `The Inkweaver` | `The Songweaver` |
| 343 | `heroes.kuro.blurb` | | `A calligrapher who writes spells into the air. Fragile up close, devastating when the page is his to fill.` | `A flautist who plays spells into the air. Fragile up close, devastating when the melody is his to carry.` |
| 345 | `heroes.kuro.passives[0].name` (id `steady_hand`) | | `Steady Hand` | `Steady Breath` |
| 352 | `heroes.suzu.blurb` | | `A shrine maiden who keeps the tale from fraying. Her talismans turn the tide of any fight.` | `A shrine maiden who keeps the land in tune. Her talismans turn the tide of any fight.` |

Rules: Song names stay unique (content.test:76). Validator error messages in data.js (for example `'paint needs n 1..12'`, asserted at
data.test:500) are NOT player copy and stay. `LISTS`, `FIXED`, `ECONOMY`, `SETTINGS`, `QUOTA`, `GUIDE` are untouched. The data.js header
comment line 1 may say `Echowake:` (comment only; never `--`).

### 5.2 `ROSTER_SRC` (data.js 374 to 450) and `CONTENT_SPEC.md` 4.1: change BOTH in the same commit

`tests/rogue_book_data.test.mjs:799-806` asserts the CONTENT_SPEC.md 4.1 markdown tables equal `DATA.ROSTER` row by row (id, name, tier,
size, role, exact strings; roles 31 to 130 characters), and each enemy file's `name` and boss `title` must equal the roster. A role that
says "call" or "calls" must name a minion of the same verse (plural with "s" accepted); `drowned_general` keeps the literal "Lantern
Wisp". The boss titles line in CONTENT_SPEC (about line 172) must equal the ROSTER titles.

| id (stays) | Old name | **New name** | **New role** (exact) |
|---|---|---|---|
| `paper_kodama` | Paper Kodama | **Hollow Kodama** | `Hollow tree spirit. Clogs the deck with silence cards.` |
| `boss_kuzunoha` | Kuzunoha (title The Nine-Tail Ink Fox) | Kuzunoha (title **The Nine-Voiced Fox**) | `White fox whose nine tails each ring a bell. Bell strikes and hollow kodama, then all nine voices at once.` |
| `tsukumogami` | Tsukumogami | Tsukumogami | `Haunted household object. Hits and shuffles silence cards into your draw pile.` |
| `redaction_knight` | Redaction Knight | **Muffled Knight** | `Felt-stuffed helm. Hits hard and adds muted cards.` |
| `void_scribe` | Void Scribe | **Grey Cantor** | `Chants silence. Strips your buffs and adds silence cards.` |
| `blank_soldier` | Blank Soldier | **Silent Soldier** | `Grey soldier that marches in step. Steady hits, weak alone.` |
| `eraser_wraith` | Eraser Wraith | **Muffle Wraith** | `Smothers your Block and your hero resource stacks.` |
| `paper_golem` | Paper Golem | **Felt Golem** | `Padded felt giant. Slow, heavy hits and Plating.` |
| `margin_imp` | Margin Imp | **Off-Key Imp** | `Off-key imp. Calls Sour Notes and adds wilt cards.` |
| `censor_golem` | Censor Golem | Censor Golem | `Stamps things silent. Muted cards, Plating, and one huge stamp.` |
| `black_bar_inquisitor` | Black-Bar Inquisitor | **Hush Inquisitor** | unchanged role |
| `blank_page` | Blank Page | **Hush Moth** | `Drifting grey moth. Gains Block, then wraps a hero in Frail.` |
| `typo_sprite` | Typo Sprite | **Sour Note** | `Mischievous sour note. Adds a wilt card.` |
| `boss_editor` | The Editor (title Keeper of the Last Page) | **The Conductor** (title **Keeper of the Last Note**) | `Pale conductor with a red baton. Becomes a felt-armed giant, then a colossal hole of silence.` |

All other 37 roster rows are unchanged. `Hollow Kodama` keeps the `Kodama` ending on purpose: `data_text.js:1240` `pluralOf` special-cases
`/Kodama$/` ("Summons 2 Hollow Kodama"). Check every new role is 31 to 130 characters before committing.

### 5.3 `js/data_text.js`: the rules-text generator vocabulary

Every player-facing rules word comes from here or from a registry name. Exactly these string sites change (the `data-kw` key stays
`ink`, so the tooltip still resolves `DATA.keywords.ink`):

| Line | Function | Old output | New output | Notes |
|---|---|---|---|---|
| 534 | `triggerPhrase` case `onPaint` | `you paint a hex` -> "Whenever you paint a hex, ..." | `you wake a hex` | relic and run-hook text |
| 539 | `triggerPhrase` case `onChapterStart` | `every ${ordinal} chapter start` / `at the start of each chapter` | `every ${ordinal} verse start` / `at the start of each verse` | follows the chapter decision |
| 557 | `limitPhrase` | `per = ... 'chapter'` -> "once per chapter", "up to 2 times per chapter" | `'verse'` | follows the chapter decision |
| 973 | `fragsOf` case `gold`/`ink` | `KW('Ink', 'ink')` -> "gain 2 Ink", "lose 1 Ink" | `KW('Echo', 'ink')` -> "gain 2 Echo" | the `data-kw` key stays `ink` so `UI.tip.kw` resolves `DATA.keywords.ink` |
| 1076 | `runFrags` case `ink` | "gain N Ink", "lose N Ink", "gain P% of your max Ink" (three `KW('Ink','ink')`) | "gain N Echo", "lose N Echo", "gain P% of your max Echo" | key stays `ink` |
| 1087 | `runFrags` case `addRelic` | "gain a random rare Treasure" | (keep) | Treasure is not theme-bound |
| 1089 | `runFrags` case `addBrush` | `gain a random Brush` / `gain ${brush name}` | `learn a random Song` / `learn ${song name}` ("Learn Ripple.") | verb "learn" for Songs |
| 1092 | `runFrags` case `paint` | `paint N hex`/`hexes` `for free` | `wake N hex`/`hexes` `for free` | |
| 1240 | `pluralOf` | `/Kodama$/` | keep (see 5.2) | only matters if `paper_kodama` loses the Kodama ending |

Words that change automatically once the registries change (no edit in data_text.js): every status name (Breath via `stName`), every
card, relic, gem, brush and enemy name (`nameOf`, `D.enemies[...].name`), "Removes Bloom, Breath, Ward and Charge" (intentText 1291),
"Spend up to 3 Breath ... for each Breath spent" (consumeParts and dmgFrags), "Adds a Silence card to your draw pile" (intentText 1300 to
1303 append " card" to curse and status names), statusText ("Breath 3: Kuro's breath...").

Comment-only mentions (update for consistency, no behaviour): header lines 1, 43 ("hand written" fine), 56, 60 to 62, 321, 613, 914,
1018, 1291 mention "Sumi"; replace with "Breath".

Words that are NOT theme-bound and stay: Energy, Block, gold, card, deck, draw pile, discard pile, Exhaust, Retain, Innate, Ethereal,
Unplayable, Treasure, hex/hexes, front/back row, hero, Elite, Minion, Boss, fight, camp, shop.

Example outputs after the change (pin these in `tests/rogue_book_text.test.mjs`, P2):

- `DATA.hookText(pilgrim_compass.hooks[0])` -> "Every 5th time you wake a hex, gain 1 Echo."
- run ops -> "Gain 30 gold. Heal both heroes for 30% of max HP. Both heroes lose 10% of max HP. Hanae gains 3 max HP. Gain 2 Echo."
- "Lose 20 gold. Lose 10% of your gold. Lose 1 Echo. Gain 50% of your max Echo. The front hero loses 2 max HP."
- "Gain a random rare Treasure. ... Learn a random Song. Add 2 curses to your deck. Add a curse to your deck. Wake 3 hexes for free. Wake 1 hex for free. Choose a card reward. A fight begins."
- "At the start of each verse, gain 2 Echo." / "Every 2nd verse start, gain 2 Echo." / "Once per verse, whenever you wake a hex, gain 1 Echo."
- gem `inkwell_amber` -> "Gain 1 Echo, 2 gold and 3 Regen".


### 5.4 Kuro, the Songweaver (`js/data_cards_kuro.js`, 37 cards; 33 names and 23 flavours change)

Every card keeps its id, numbers, ops, rarity, cost and `art.m` motif id. Names follow "Japanese-flavoured English, 1 to 3 words",
3 to 28 characters, capitalised, no hero prefix, no dash, unique among all 160 cards (checked). Rewrite the file's header comment (lines 1
to 46) with the new names and "Breath" (it is the file's contract of record). BLOCKER handled in P1: `cards_kuro.test.mjs:119` demanded
`id === 'kuro_' + snake(name)`.

| Line (name / flavor) | id (stays) | Type, rarity, cost | What it does | Old name | **New name** | Old flavor | **New flavor** |
|---|---|---|---|---|---|---|---|
| 51 | `kuro_ink_bolt` | attack starter 1 | 6 damage | Ink Bolt | **Sharp Note** | none | none |
| 57 | `kuro_ink_ward` | skill starter 1 | 5 Block | Ink Ward | **Flute Guard** | none | none |
| 63 / 67 | `kuro_first_stroke` | attack starter 1 | 4 damage, +3 per Breath spent (up to 2) | First Stroke | **Overture** | Every masterpiece starts with one smug flourish. | Every masterpiece starts with one smug first note. |
| 72 | `kuro_ink_flick` | attack common 0 | 3 damage, Front: draw 1 | Ink Flick | **Grace Note** | none | none |
| 78 | `kuro_cinder_note` | attack common 1 | 4 damage, 3 Burn, Front: 2 more Burn | Cinder Note | Cinder Note (keep: already musical) | none | none |
| 84 / 88 | `kuro_viper_nib` | attack common 1 | 2 damage twice, 2 Poison | Viper Nib | **Viper Trill** | The nib is sharp. The margin notes are sharper. | The trill is quick. The bite is quicker. |
| 91 / 95 | `kuro_ink_flood` | attack common 2 | AoE 4, +2 per Breath spent (up to 3) | Ink Flood | **Sound Swell** | Kuro apologises for the mess. He does not mean it. | Kuro apologises for the volume. He does not mean it. |
| 98 / 102 | `kuro_running_script` | attack common 1 | 2 +3 per Skill played (up to 3) | Running Script | **Running Scale** | Fast, fluid, and impossible to read in a hurry. | Fast, fluid, and impossible to hum along to. |
| 105 | `kuro_blinding_blot` | attack common 1 | Weak 1, Vulnerable 1, 3 damage | Blinding Blot | **Shrill Whistle** | none | none |
| 111 / 115 | `kuro_venom_script` | skill common 1 | 4 Poison | Venom Script | **Venom Lullaby** | Best read slowly, and from a safe distance. | Best heard softly, and from a safe distance. |
| 118 | `kuro_miasma_verse` | skill common 1 | 2 Poison to all | Miasma Verse | **Miasma Chant** (avoids "Verse" if chapters become verses) | none | none |
| 124 | `kuro_grind_ink` | skill common 1 | 3 Block, 2 Breath | Grind Ink | **Deep Breath** | none | none |
| 130 / 134 | `kuro_skim_the_scroll` | skill common 1 | 4 Block, tutor 1 from top 3 | Skim the Scroll | **Sound Check** | He read the last page first. It helps. | He heard the last bar first. It helps. |
| 137 | `kuro_redraft` | skill common 0 | discard up to 2, draw that many | Redraft | **Remix** | none | none |
| 143 / 147 | `kuro_ink_cloak` | skill common 1 | 6 Block, Front: 6 more | Ink Cloak | **Quiet Cloak** | The trick to hiding is to be the darkest thing on the page. | The trick to hiding is to be the quietest thing in the room. |
| 150 / 154 | `kuro_shared_umbrella` | skill common 1 | 4 Block to both | Shared Umbrella | Shared Umbrella (keep) | Kuro insists it is a purely practical arrangement. | (keep) |
| 157 | `kuro_ghost_ink` | skill common 1 | ally gains 1 Dodge | Ghost Ink | **Ghost Note** | none | none |
| 165 / 169 | `kuro_rot_script` | skill uncommon 1 | double the target's Poison (cap 10), exhaust | Rot Script | **Rot Reprise** | It compounds, like a bad debt. | (keep) |
| 172 | `kuro_wildfire_verse` | skill uncommon 2 (locked) | 5 Burn, 3 Burn to the others | Wildfire Verse | **Wildfire Anthem** | none | none |
| 178 / 182 | `kuro_inkblot_verdict` | attack uncommon 1 | 2 +3 per debuff | Inkblot Verdict | **Dissonance** | The verdict is in. It is a stain. | The verdict is in. It is out of tune. |
| 185 / 189 | `kuro_creeping_ink` | power uncommon 1 | Skills poison a random enemy (twice a turn) | Creeping Ink | **Creeping Drone** | It seeps between the lines. | It hums between the beats. |
| 192 | `kuro_rain_of_strokes` | attack uncommon 2 | 4 random, then 4 per Breath spent (up to 4) | Rain of Strokes | **Rain of Notes** | none | none |
| 204 / 208 | `kuro_well_of_ink` | power uncommon 1, innate | +1 Breath each turn | Well of Ink | **Circular Breathing** | Deep, dark, and mildly judgemental. | In through the nose, out through the flute, forever. |
| 211 / 215 | `kuro_shelter_script` | skill uncommon 1 | ally Block 4 +3 per Breath spent (up to 2) | Shelter Script | **Shelter Hymn** | A note in the margin: please stand behind this. | A note in the score: please stand behind this. |
| 218 / 230 | `kuro_strikethrough` | skill uncommon 1 | exhaust up to 2, 3 Block and 1 Breath each | Strikethrough | **Cut the Noise** | Cross it out. Cross it all out. | Cut it. Cut all of it. |
| 233 / 237 | `kuro_nightshade_verdict` | attack uncommon 3 | 5 per Poison on target (cap 50) | Nightshade Verdict | **Nightshade Requiem** | Sweet on paper. Bitter everywhere else. | Sweet on the ear. Bitter everywhere else. |
| 240 / 244 | `kuro_midnight_oil` | skill uncommon 0 (locked) | lose 3 HP, +1 Energy, draw 1 | Midnight Oil | **Midnight Session** | Sleep is for the well-drafted. | Sleep is for the well-rehearsed. |
| 247 | `kuro_flip_the_page` | skill uncommon 1 | swap, draw 1, ally 3 Block, Back: 1 Breath | Flip the Page | **Key Change** | none | none |
| 263 / 267 | `kuro_slow_match` | skill uncommon 1, retain (locked) | Burn 2 per turn number (cap 10) | Slow Match | Slow Match (keep) | Patience, dear reader. It is still lit. | Patience, dear listener. It is still lit. |
| 272 / 277 | `kuro_grand_flourish` | attack rare 2, retain | 3 +5 per Breath, spends all | Grand Flourish | **Grand Finale** | The signature at the bottom is always the sharpest part. | The last note is always the sharpest part. |
| 280 / 284 | `kuro_inkfall_inferno` | attack rare X | X times: 4 to all and 1 Burn | Inkfall Inferno | **Inferno Cadenza** | Some pages you do not turn. You set them alight. | Some songs you do not end. You set them alight. |
| 287 / 291 | `kuro_plague_garden` | power rare 2 | 2 Poison to all each turn | Plague Garden | Plague Garden (keep) | He waters it with footnotes. Everything else wilts. | He waters it with lullabies. Everything else wilts. |
| 294 / 299 | `kuro_epilogue_flame` | power rare 2 (locked) | 2 Burn to all, any kill: 3 Burn to all | Epilogue Flame | **Coda Flame** | Every story earns a bonfire at the end. | Every song earns a bonfire at the end. |
| 302 / 307 | `kuro_ink_reservoir` | power rare 2 | 2 Breath now, +1 per Skill | Ink Reservoir | **Bottomless Lungs** | A deep well. Do not ask what writes back. | A deep breath. Do not ask what breathes back. |
| 310 / 315 | `kuro_second_edition` | skill rare 1, exhaust (locked) | copy up to 2 cards in hand | Second Edition | **Canon** | Revised, expanded, and suspiciously familiar. | Again, a beat behind, and suspiciously familiar. |
| 318 / 322 | `kuro_scene_change` | power rare 2 (locked) | any swap: draw 1, 1 Breath | Scene Change | **Call and Response** | Bow, exit stage left, return with a better line. | One calls, one answers, and the song gets louder. |
| 325 / 330 | `kuro_inkwash_sanctum` | skill rare 2 | both heroes 3 +3 per Breath, spends all | Inkwash Sanctum | **Resonant Sanctum** | The safest place in any story is the one nobody can read. | The safest place in any song is the rest between the notes. |

### 5.5 Shared junk cards (`js/data_cards_shared.js`)

| Line (name / flavour) | id (stays) | Old name | **New name** | Old flavour | **New flavour** |
|---|---|---|---|---|---|
| 38 / 42 | `curse_regret` | Regret | Regret | You know the line you should have said. It keeps reciting it for you. | You know the line you should have sung. It keeps humming it for you. |
| 45 / 48 | `curse_smudge` | Smudge | **Wrong Note** | A thumbprint on the good page. Nobody remembers whose. | One sour note in the good song. Nobody remembers whose. |
| 51 / 55 | `curse_doubt` | Doubt | Doubt | Is that really how the story goes? | Is that really how the song goes? |
| 58 / 61 | `curse_burden` | Burden | Burden | Somebody has to carry it, and the page has chosen you. | Somebody has to carry it, and the silence has chosen you. |
| 64 / 68 | `curse_hex` | Hex | Hex | A word written backward, once, by someone who meant it. | A song sung backward, once, by someone who meant it. |
| 71 / 75 | `curse_decay` | Decay | Decay | The oldest pages go first. Yours is not so far behind. | The oldest notes fade first. Yours is not so far behind. |
| 80 / 83 | `status_blot` | Blot | **Silence** | A drop of the Blank\'s ink. It dries by itself, if you let it. | A mouthful of the Hush. It fades by itself, if you let it. |
| 99 / 102 | `status_redacted` | Redacted | **Muted** | A black bar where a good line used to be. | A gap where a good note used to be. |
| 111 / 115 | `status_wilt` | Wilt | Wilt | A pressed flower gone brittle. Every page it touches loses a little colour. | A pressed flower gone brittle. Every song it touches loses a little colour. |

Header comment line 8 ("the book's bad memories", "Ink Trials") becomes "the song's sour notes", "Tempo Trials". Intent text then reads
"Adds a Silence card to your draw pile", "Adds 2 Muted cards", "Add a Wrong Note card". Test fixtures in `tests/rogue_book_text.test.mjs`
that name "Ink Blot" or "Curse Ink" are test-local and may stay; tests that read `'Blot'` or `'Redacted'` from DATA (enemies_3:588-593,
text:760, 1031) must be checked: if they compare a literal card name, switch them to `DATA.cards.status_blot.name` and
`DATA.cards.status_redacted.name`.

### 5.6 Relics (`js/data_relics.js`) and gems (`js/data_gems.js`)

Relic text rules (treasure.test:200-290): one sentence, 12 to 90 characters, capital first, period last, names the hero for hero relics,
mentions every number, and matches keyword regexes per op, mod and trigger (those regexes change in P2, 8.2). `art.m` icon ids stay
(redrawn in P5). Keep the names Brass Lantern and Fox Mask (a narrative test greps lock messages for them).

| Line (name / text) | id (stays) | Rarity | Old name | **New name** | Old text | **New text** |
|---|---|---|---|---|---|---|
| 59 / 60 | `brass_lantern` | common | Brass Lantern | Brass Lantern | At the start of each chapter, paint 2 hexes for free toward the boss. | At the start of each verse, wake 2 hexes for free toward the boss. |
| 89 / 90 | `pilgrim_compass` | common | Pilgrim's Compass | Pilgrim's Compass | Every 5th hex you paint refunds 1 Ink. | Every 5th hex you wake refunds 1 Echo. |
| 94 | `bounty_scroll` | common | Bounty Scroll | Bounty Scroll (keep: a bounty notice, allowlisted) | Winning an Elite fight pays 20 extra gold. | (keep) |
| 99 / 100 | `ink_jar` | common | Jar of Fresh Ink | **Bottled Echo** | Start each chapter with 2 more Ink. | Start each verse with 2 more Echo. |
| 104 / 105 | `inkstone_weight` | common | Heavy Inkstone | **Heavy Singing Bowl** | Your Ink pool can hold 2 more, and taking this gives both heroes 3 max HP. | Your Echo pool can hold 2 more, and taking this gives both heroes 3 max HP. |
| 156 / 157 | `vial_of_spare_ink` | common, kuro | Vial of Spare Ink | **Spare Mouthpiece** | Kuro starts each combat with 3 Sumi. | Kuro starts each combat with 3 Breath. |
| 183 / 184 | `well_kasa` | uncommon | Well-Wisher's Kasa | **Bell-Ringer's Kasa** | Ink Wells give 1 more Ink. | Temple Bells give 1 more Echo. |
| 193 / 194 | `sable_brush` | uncommon | Sable Brush | **Songbird Whistle** | At the start of each chapter, gain a random Brush. | At the start of each verse, learn a random Song. |
| 198 / 199 | `plum_pendant` | uncommon | Plum Blossom Pendant | Plum Blossom Pendant | Every 3rd hex you paint refunds 1 Ink. | Every 3rd hex you wake refunds 1 Echo. |
| 203 / 204 | `shrine_box` | uncommon | Offering Box | Offering Box | When you rest at a camp, gain 2 Ink. | When you rest at a camp, gain 2 Echo. |
| 269 / 270 | `scholars_spectacles` | uncommon, kuro | Scholar's Spectacles | **Pocket Metronome** | Every 2nd Skill Kuro plays, he draws 1 card and gains 1 Sumi. | Every 2nd Skill Kuro plays, he draws 1 card and gains 1 Breath. |
| 292 | `branching_bookmark` | rare | Branching Bookmark | **Harmony Ribbon** | Card rewards offer 1 more card. | (keep) |
| 312 | `formation_scroll` | rare | Formation Scroll | **Marching Cadence** | Front hero starts turns with 3 Block, and the back hero gains 1 extra Block from cards. | (keep) |
| 333 | `nightlong_inkwell` | rare, kuro | Nightlong Inkwell | **Nightlong Dirge** | At the end of your turn, Kuro applies 2 Poison to all enemies. | (keep) |
| 356 | `book_of_falling_leaves` | boss | Book of Falling Leaves | **Song of Falling Leaves** | Draw 1 more card each turn, but healing outside combat is 40% weaker. | (keep) |
| 64 | `paper_umbrella` | common | Oil-Paper Umbrella | (keep: a real object) | | |
| 130 | `paper_crane` | common | Paper Crane | (keep: origami) | | |

Also: `paper_umbrella` Oil-Paper Umbrella and `paper_crane` Paper Crane keep their names (folk objects); `bounty_scroll` Bounty Scroll
keeps its name (allowlist). Already on theme and kept: `flute_of_changing_tunes`, `battle_drum`, `silver_bell`, `wintry_bell`. Header
comment lines 25 to 28 and 41 to 46 get the new words.

| Line | Gem id (stays) | Old name | **New name** | Text |
|---|---|---|---|---|
| 133 to 136 | `inkwell_amber` | Inkwell Amber | **Ringing Amber** | generated: becomes "Gain 1 Echo, 2 gold and 3 Regen" by itself (5.3) |
| 141 | `heartflame_topaz` | Heartflame Topaz | (keep) | hand-written: `If you hold Bloom, Sumi, Ward or Charge, gain 2 more of it.` -> `If you hold Bloom, Breath, Ward or Charge, gain 2 more of it.` |

Gem header comment lines 21 and 29 get the new words.

### 5.7 Logic strings (`js/run.js`, `js/meta.js`)

| File:line | Old | New | Test |
|---|---|---|---|
| run.js:378 | `` `Gained ${...} Ink.` `` / `` `Lost ${...} Ink.` `` | `` `Gained ${...} Echo.` `` / `` `Lost ${...} Echo.` `` | run.test:655 `/Ink/` -> `/Echo/` |
| run.js:472 | `'No brush to find.'` | `'No Song to find.'` | |
| run.js:500 | `` `The path opens (${...}).` `` | `` `The land wakes (${...}).` `` | |
| run.js:656 | `` `Chapter ${n} begins.` `` | `` `Verse ${n} begins.` `` | |
| run.js:742 | `'The Book lends a drop of Ink.'` | `'The land hums back one Echo.'` | |
| run.js:845 | `'Not yet: the story has not led here'` (fallback lock reason when a flag has no FLAG_HINTS entry) | `'Not yet: the journey has not led here'` | none (run.test:1340 only rejects the exact vague words) |
| run.js:846 | `` `Chapter ${req.chapter} only` `` | `` `Verse ${req.chapter} only` `` | run.test:1337 `'Chapter 3 only'` -> `'Verse 3 only'` |
| run.js:970 | `'The fable has nothing left to tell. You find a drop of Ink.'` | `'The fable has nothing left to tell. You find a little Echo.'` | run.test:1294 `/Ink/` -> `/Echo/` |
| run.js:1040 | `'A chapter boss fell.'` | `'A keeper fell.'` | |
| run.js:1104 | `'Took the brush.'` | `'Learned the Song.'` | |
| run.js:1267 | `'The last page is turned.'` | `'The last note rings out.'` | |
| meta.js:332 | `` `Chapter ${o.chapter}, Ink ${o.ink}, ${...} and ${...}` `` | `` `Verse ${o.chapter}, Echo ${o.ink}, ${...} and ${...}` `` | meta.test:332-333 (`'Verse 2, Echo 5, Hanae and Kuro'`, `'Verse 1, Echo 1, Raiga and Suzu'`), screen_menu.test:122 `/Chapter 1/` -> `/Verse 1/`, game.test:214 `/Chapter 1/` -> `/Verse 1/` |
| meta.js:31 | header comment `text:'Chapter 2, Ink 5, Hanae and Kuro'` | `text:'Verse 2, Echo 5, Hanae and Kuro'` | |

`run.js:925 'A fable unfolds.'` stays. `screen_map.js` `relicSource` compares against RUN's `'Found ' + name + '.'` log line: unchanged.
After P2 run this grep; every remaining hit must be an id, a comment or a reason code (`reason: 'ink'`, `reason: 'brush'` are internal
and stay):

```
grep -nE "\b(Ink|brush|Brush|paint|page|book|Book|Chapter|chapter|Blank)\b" rogue_book/js/run.js rogue_book/js/meta.js | grep -E "['\`]"
```

### 5.8 Enemies, story, fables, achievements, trials, tips

Exact strings: Appendix A. Names at a glance:

| Area | Old | New |
|---|---|---|
| Kuzunoha moves | Paper Fold, Ink Strike, Brush Flurry, Bleed the Page, Great Brush Stroke, Ink Needle, Frayed Ink | Call the Kodama, Bell Strike, Tail Flurry, Drown the Grove, Great Bell Toll, Needle Note, Frayed Voice |
| The Conductor moves | Editor's Notes, Margin Notes, Proofread, Red Pen, Strike Through, Footnote, Clean Slate, Eraser Swipe, Smudge Everything, Rub Through, Typos in the Erasure, Gaping Tear, Rip the Page, Unwrite, The Last Word | Places, Please, Late Seating, Rehearsal Note, Red Baton, Cut Off, Fermata, Tacet, Damper Swipe, Muffle Everything, Smother, Wrong Notes Creep In, Gaping Silence, Swallow Whole, Unsing, The Last Note |
| Story titles | Once, a Book; The Fox Puts Down Her Brush; The Crimson Sky Citadel; The Ending, Rewritten; The Page Goes White; Kuro, the Inkweaver | Once, a Song; The Fox Lowers Her Voice; The Thunderless Citadel; The Final Chorus; A Rest in the Music; Kuro, the Songweaver |
| Fable titles | The Lantern Wants a Story; The Hermit's Brushes; The Paper Kodama; A Door of Nothing; The Flooded Archive; Kuro's Footnote; Notes in Red Pen; The Unfinished Sentence; The Office of Revisions; The Cat on the Manuscript; Suzu Hears the Binding; Please Wait To Be Edited; The Patch of White; The Scribe of Small Fates | The Lantern Wants a Song; The Hermit's Songs; The Kodama's Echo; A Door of Silence; The Flooded Music Hall; Kuro's Harmony; Notes from the Podium; The Unfinished Song; The Office of Silence; The Cat on the Koto; Suzu Hears the Strings; Please Wait To Be Auditioned; The Patch of Silence; The Busker of Small Fates |
| Event costs | `1 Ink`, `2 Ink`, `2 Ink, maybe a curse`, `It may smudge your deck` | `1 Echo`, `2 Echo`, `2 Echo, maybe a curse`, `It may sour your deck` |
| Achievements | The Last Page, First Draft, Regular Reader, Ink and Insight, Cartographer of Ink, Brush Collector, One Big Sentence, Free Verse, Minimalist Author, A Tale a Day, Inkling, Ink Adept, Master of the Ink | The Last Note, First Rehearsal, Regular Listener, Flute and Insight, Cartographer of Echoes, Song Collector, One Big Crescendo, Free Verse (kept: now a perfect pun), Minimalist Composer, A Jam a Day, First Beat, Tempo Adept, Master of Tempo |
| Trials | Thin Ink, Shallow Wells, The Red Pen | Faint Echo, Cracked Bells, The Red Baton |

### 5.9 UI copy (every presentation file)

The complete table per file (index.html, gallery.html, ui.js, main.js, screen_map.js, screen_menu.js, screen_node.js, screen_combat.js,
screen_end.js, tutorial.js, scene.js) is Appendix B; the test edits that go with it and the copy length budgets are Appendix C. The
highest-traffic strings:

| Where | Old | New |
|---|---|---|
| map Echo meter | `Ink`, `'Ink ' + n + ' of ' + max` | `Echo`, `'Echo ' + n + ' of ' + max` |
| map banner and intro | `'Chapter ' + roman` | `'Verse ' + roman` |
| map progress | `pct + '% painted'`, `' hexes painted'` | `pct + '% awake'`, `' hexes awake'` |
| map apply button | `Paint`, `'Paint ' + n` | `Sing`, `'Sing ' + n` |
| map tray | `Brushes`; `No brushes. Brush racks and champions hold them.` | `Songs`; `No Songs. Songbirds and champions teach them.` |
| fog hex chip | `Unwritten page` / `Blank paper. Paint it to see what the tale holds.` | `Silent ground` / `Grey and still. Wake it to hear what it holds.` |
| mercy toast | `The Book lends a drop of Ink.` | `The land hums back one Echo.` |
| title | `New Tale`, `Daily Tale`, `Library`, tagline `a rogue storybook` | `New Journey`, `Daily Jam`, `Hall`, `a rogue ballad` |
| share text (screen_end) | `'INKWOVEN: ' + ...` | `'ECHOWAKE: ' + (win ? 'the Hush let go' : 'a rest in Verse ' + n)` |
| hero select | `Begin the Tale`, `Begin Daily Tale`, `Ink Trial` | `Begin the Journey`, `Begin Daily Jam`, `Tempo Trial` (plus `.ts-big .mn-begin { letter-spacing: .02em }` in css/menu.css:239, or the label fails the width test) |
| story screen | `Turn the page` | `Play on` |
| stat pills (`ui.js` STAT_TIP) | `['Ink', null]`, `['Brushes', null]`, `['Inkstones', 'Earned every run. Spend them in the Library to unlock new content.']` | `['Echo', null]`, `['Songs', null]`, `['Chimes', 'Earned every run. Spend them in the Hall of Echoes to unlock new content.']` |
| document title | `INKWOVEN -- a rogue storybook` | `ECHOWAKE: a rogue ballad` (lib.test:205) |

Hard-coded copies of data names must read DATA instead (P1 does this with identical output; P3 then edits only the words AROUND the
DATA read and must never put a literal tile name back): `screen_map.js:1340` (REASON_TEXT `void`) and `2195` (legend heading) for
"The Unwritten Void": use `DATA.tiles.block.name`; `screen_node.js:1925, 2046` for "The Inkstone Forge": use `'The ' +
DATA.tiles.forge.name` (`screen_node.js:1911` is a comment: optional wording only).

### 5.10 Text painted by art code (player-visible pixels)

| File (line) | Text | New |
|---|---|---|
| `js/art_scenes.js` `LOGO_LETTERS` (about 2711) | INKWOVEN letter skeletons | ECHOWAKE (new C, H, A skeletons in Appendix D 3.2) |
| `js/art.js:1626` placeholder logo | `'INKWOVEN'` | `'ECHOWAKE'` |
| `js/art_enemies_3.js:3346` | `'ERASE'` on the Eraser's sleeve | `'SHH'` |
| `js/art_enemies_3.js:2309` | `'DENIED'` on the censor golem's stamp | `'SHH'` |
| `js/art_map.js:518` | `'N'` on the compass doodle | removed with the compass |
| `js/art_fx.js` 1546, 1576, 1596, 1607, 1610; `js/art.js:1742`; `js/scene.js:144` | `'SHAA!'` | `'WAAN!'` (`ZAN!`, `KIN!` and the other sound words stay) |
| `js/art_enemies_3.js:3795` boss3 sheet `names` | `phase 0: the Editor`, `phase 1: the Eraser`, `phase 2: the Blank Page` | `phase 0: the Conductor`, `phase 1: the Damper`, `phase 2: the Hush` |
| `js/art_enemies_1.js:2583` sheet label | mentions the ink fox | the Nine-Voiced Fox |
| `js/art_heroes.js:797` banner comment | `KURO, the Inkweaver` | `KURO, the Songweaver` |

### 5.11 Internal ids that look themed and MUST stay (do not "fix" them)

| Kind | Ids |
|---|---|
| ops, hooks, mods, stats | `ink`, `paint`, `addBrush`, `onPaint`, `onChapterStart`, `inkMax`, `startInk`, `wellInk`, `hexesPainted`, `brushesUsed`, `wellsDrunk`, `dailyRuns`, `trialBest`, `boss1Kills` |
| ECONOMY keys, META and save fields | `startInk inkMax paintCost wellInk campInk killInk inkstones`, `R.ink`, `R.inkMax`, `R.brushes`, `R.chapter`, `profile.inkstones`, `reward.inkstones`, `history[].inkstones` |
| closed lists | tiles `well brush`, map kinds `painted`, elements `ink`, palettes `ink`, scenes `paper`, motifs `ink_splash ink_wave brush_stroke calligraphy scroll quill book void`, relic icons `brush inkstone ink_drop scroll`, stat icons `ink brush inkstone`, icon kind `brush`, fx `inkSplash brushDrag`, sfx `paint ink_splash brush_pick brush_use ink_gain well page_turn`, bus `map:paint map:brush map:walk`, tut anchors `ink brushes hex`, screens `library story chapterClear`, library tab `story`, combat event `ink` |
| content ids | every card id (`kuro_ink_bolt` and so on), `status_blot status_redacted curse_smudge`, relic ids (`ink_jar`, `sable_brush`, `book_of_falling_leaves` ...), gem `inkwell_amber`, enemy ids (`paper_kodama`, `blank_page`, `boss_editor` ...), move ids (`ink_strike`, `unwrite` ...), event ids (`missing_page`, `kuro_footnote` ...), achievement ids (`first_draft`, `inkling` ...), trial ids, lore ids, flags `fox_spared fox_bond` |
| presentation | CSS classes `mp-ink mp-ink-n mp-ink-l mp-drop mp-drops mp-fly-drop mp-fly-brush lg-brush mn-book mn-pg mn-gutter mn-margin mn-stones mn-stone-ico mn-storypage mn-emptybook mn-daily mn-trial ev-book ev-page ev-gutter ev-ribbon ev-seal st-page st-drop st-seal go-stone-n vc-stone vc-page en-scroll-body st-ink st-brush st-inkstone bk-ink k-ink p-paper brush-div brush-ul back-drop back-word rot-book ce-ink cr-brush s-library`; CSS tokens `--ink --paper --paper2 --sumi --brush --brush-ul --torn-top --torn-bot` (only `--drop` is split, P5); transition kinds `'ink' 'page'`; tutorial hint ids `paint ink walk tiles goal brush ...` and profile flags `tut_*`; how-to page ids `book map rows cards intents gems places after`; ART API names `ART.map.paintBloom brushPreview paper frame frameInner fogEdge`, `ART.fx.inkSplash brushDrag`, `ART.tk.inkPath inkBlot inkText paperGrain`, palette keys `pal.paper pal.paper2 pal.sumi`, gallery sheet names `map_page map_paper scene_paper ...` |
| RNG stream keys | `'brush'`, `'fable'`, `'daily'`, `'trialCurses'` in `U.hash` calls |

## 6. Art plan

Full direction per function, with line numbers, sizes and the exact test constraints, is Appendix D (IDs like MAP-24, IC-09, KU-01,
SC-02, X-03 refer to its rows). This section is the summary, the shared vocabulary and the acceptance screenshots.

### 6.1 Rules for every art task

1. Keep every internal id and API name (5.11). Only pixels change. Optional comment refresh may say "Echo".
2. The inked LINE stays (Sumi-Shonen: calligraphic outline, cel shading, halftone, gold leaf). Remove only book, page, parchment,
   brush, quill, inkstone and ink-drop imagery.
3. Hushed versus awake is the map's whole read, and MOTION is the awake signal (the premise says the land is grey AND still):
   hushed = cool grey, perfectly still, faint baked ash grain; awake = the watercolours plus echo rings, and woken hexes within 3 of the
   party move a little (bamboo bend, water ripple, lantern flicker, a faint sound ring every 4 to 6 s, seeded per hex; MAP-27). Colour is
   never the only signal: fog keeps its dotted outline, woken hexes keep their stamps. The reveal must not read as a colour wash spreading
   over grey paper (the Roguebook look): it is a circular sound wavefront with rings escaping and a note rising.
4. Every ART draw stays deterministic (`tk.rng` / `U.rng`, never the banned random call), never throws, keeps save and restore balanced.
5. Fog hexes are 200+ per frame and cached: "fog is still" is a test. Static grain is BAKED into fog sprites; animation lives only in
   `liveEdge`, `liveTile`, `paintBloom`, the frame, the token and the route.
6. New shared helpers go in `js/art.js` first (P5): `tk.note(ctx, x, y, size, o)` (o `{kind: 'eighth'|'quarter'|'beamed'|'rest',
   color, alpha, rot, line}`: ellipse head tilted -0.35 rad, stem and flag with `inkPath`; wrap with `sane(note, 1, 4)`),
   `tk.soundRings(ctx, x, y, r, o)` (o `{n: 3, gap: 0.32, color, alpha, lw, broken: false, rot}`: concentric `ctx.arc` rings; `broken`
   draws the outermost ring as left and right arcs), and new palette keys (new keys only, never change existing ones: art_core pins them)
   `hush '#cfcdd8'`, `hush2 '#8e8aa3'`, `felt '#6e6a7e'`, `bronze '#c9893a'`, `verdigris '#5fbfa8'`. Add one cell "note, soundRings" to
   the `toolkit` gallery sheet (art.js about line 1661).
7. Material swap (applies to every row of Appendix D, which was written before it): "TV static" / "static dashes" are drawn as grey ash
   and frost flecks (same dash geometry and counts, colours `#8e8aa3` and `#f2f0f6`); "anechoic foam wedges / zigzags" become layered
   futon quilting (same zigzag geometry, read as quilted ridges with a stitch line); "black mute bars" become wrapped grey cloth gags and
   cord bindings (same rectangles, filled felt `#6e6a7e` with a darker cord stroke `#46425a` across them). Internal names (`static`
   palette constants, function names) may stay. No modern studio or broadcast imagery anywhere.

### 6.2 Echo visual vocabulary (use everywhere)

| Motif | Shape | Colours | Used by |
|---|---|---|---|
| Echo ping | solid centre dot, one full ring, outer ring broken into left and right arcs | body `#5a4ae0` to `#7a6bff`, rim `#5ff5ff`, glow `#7a6bff` | stat `ink` icon, route pill, Echo meter (CSS `--echo`), logo O, favicon |
| Sound rings | 2 to 3 concentric thin circles, alpha falling outward | tile light colour or `#e8fbff` | woken hexes, reveal wavefront, bell tile, victory sky, Kuro fx |
| Note glyphs | eighth, beamed pair, quarter; a "rest" squiggle for silence | gold `#f5c96a`, white, or the 7-step hue ramp `#ff7eb6 #ff9a2e #f5c96a #3fd6b0 #5fb4ff #7a6bff #c49bff` | title drift, reveal, route dabs, Kuro, card motifs, released sounds |
| Temple bell (bonsho) | tall bronze bell, rounded crown, flared lip, two bands, a grid of boss knobs, a wooden striker log on ropes | bronze `#c9893a`, shade `#7a4a1c`, verdigris `#5fbfa8` | title (bound in Hush threads until the first win, then free), victory (ringing), well tile, defeat (whole, re-wrapped in grey threads, striker still; never cracked) |
| Hush materials | grey quilted felt, cotton wadding, layered futon quilting, wrapped grey cloth gags and cord bindings, grey ash and frost flecks, grey fog | felt `#6e6a7e`, feltD `#46425a`, wadding `#f2f0f6`, quilt shadow `#2e2b3a`, ash `#8e8aa3` / frost `#f2f0f6` | Verse III roster, final boss, Dead Silence tile, title corners, defeat |
| Instruments | shakuhachi, taiko and bachi, hyoshigi clappers, biwa, furin wind chime, rin bowl, tuning fork | lacquer, bronze, wood `#a8743c` | Kuro, icons, card motifs, tiles |

### 6.3 Work by file (phase, Appendix D rows)

| File | What changes | Phase | Appendix D rows | Test constraints (must stay green) |
|---|---|---|---|---|
| `js/art.js` | `tk.note`, `tk.soundRings`, palette keys, toolkit sheet cell, placeholder logo text, `'SHAA!'` -> `'WAAN!'` (1742) | P5 | 1.4 | art_core: palette mirrors ART_BIBLE tokens exactly (existing keys unchanged) |
| `js/art_map.js` | hushed ground, fog, woken hex echo rings, Dead Silence hole, lacquer frame with kumiko band (no gutter, pages or ribbon; `frameMetrics` and the `clearRect` window kept exactly), wavefront reveal with escaping rings and a rising note (optional `opts.note` tint), slow motion on woken hexes near the party in `liveTile` (MAP-27), note-head route dabs, echo-ping cost pill, Song preview sine band, doodles (rings, silent bell, cranes, drum instead of compass, kraken, serpent, boat) | P5 | MAP-01 to MAP-26 | art_map: window >= 1180 x 640 centred, bake once per size, frame differs between t 0.3 and 1.9, paper deterministic, fog and enemy hexes still, bloom p 0 draws nothing and p 1 equals the woken hex, clip polygon of `lineTo` points grows 0.08 < 0.2 < 0.4, neutral mid-bloom has >= 3 `arc` calls, route >= 8 dabs |
| `js/art_icons.js` | stat icons (Echo ping, Song beamed notes, Chimes wind chime), tile stamps (Downbeat hyoshigi, Temple Bell, Songbird), Song plaques with stroke-only badge glyphs, Dead Silence, relic icons `brush` (bachi), `inkstone` (rin bowl), `ink_drop` (echo vial), status `sumi` (breath curl), status card face | P5 | IC-01 to IC-20 | art_icons: Song icons each draw >= 4 `closePath` hexagons and keep splash > blot, wave > blot, wave > stroke: badge glyphs use strokes, `arc` and `ellipse` only, never `closePath`; on and off stat icons differ |
| `js/art_heroes.js` | Kuro's oversized shakuhachi (tip anchor kept at `W[1] - 206`), sound pearls, flute cord with a bronze flute charm (no bell: small bells are Suzu's), note-sigil cast, waveform hem, bust | P7a | KU-01 to KU-12 | art_core hero section: finite anchors, tip moves > 20 px in an attack, portrait and medallion safe |
| `js/art_cards.js` | motifs `ink_splash` (beat burst), `ink_wave` (sound wave), `brush_stroke` (melody ribbon), `calligraphy` (crescendo), `quill` (tuning fork), `book` (biwa), `scroll` (notation scroll), `void` (hush hole); `drips` foreground becomes falling notes; junk cards greyed | P7a | section 8 table, CA-01 to CA-07 | art_cards: every motif a distinct standalone icon, deterministic, cached per id + up + size; art_icons: every motif a round icon different from the next |
| `js/art_enemies_3.js` | Verse III roster in felt, wadding, futon quilting, cloth gags, ash flecks (6.1 rule 9); boss trio Conductor / Damper / Hush (with the faint yamabiko inside phase 2); `'ERASE'` and `'DENIED'` -> `'SHH'`; sheet labels | P7b | 9.1, 9.2 | art_enemies_3: bounds per size class (boss >= 320 tall), every pose and phase draws, phases differ, death ends with almost no part sprites |
| `js/art_enemies_1.js` | Kuzunoha bell-tipped tails with violet hush smoke, sound-ring wheel, captured-sound bubbles (`FX.page` re-skin), Hollow Kodama mist instead of ink drips | P7a | 9.3 | art_enemies_1 behavioural tests |
| `js/art_fx.js` | `FX.inkSplash` becomes a sound burst (waveform rim, sound spikes, 3 expanding rings, note heads; `nominal.inkSplash` 130 -> 150), `FX.brushDrag` a sine sound sweep, `SHAA!` -> `WAAN!` | P7a | FX-01 to FX-05 | art_fx: seeds differ, dir mirrors, ang rotates, colour changes the picture, reduceMotion and low quality never ADD calls |
| `js/art_scenes.js` | title: a bronze temple bell in a wooden belfry bound by grey Hush threads (inside x 292..988, below the logo), muffled ring pulses, rising note glyphs, grey ash and frost creeping at the corners; after the player's first win the title bell is drawn free and rings clear (`opts.rung`, presentation only); logo ECHOWAKE with sound-ring pulses; victory: the freed bell ringing; defeat: the world drained grey and the bell whole but re-wrapped in grey threads; `paper` scene: cool silk; Verse III hush rifts and drifting felt; boss3 ghost staff; moods; export the title footprint (8.2, P8) | P8 | 3.2, 3.3, SC-01 to SC-19 | art_scenes: logo draws at every width and t, cached per width, deterministic, >= 7 distinct frames over t 0.2..5.1, NaN and negative width absorbed; every scene draws; combat ground 520; `paper` still, seeded, cached; title and camp composite >= 4 cached layers |
| CSS and HTML art (`css/base.css`, `css/map.css`, `css/combat.css`, `css/node.css`, `css/end.css`, `css/menu.css`, `js/ui.js` transitions, `index.html`, `gallery.html`, `js/screen_menu.js` fallbacks, `js/screen_node.js` desk, `js/scene.js` particles) | `--drop` split into `--orb` (energy, card cost, card back, deck hint) and `--echo` (Echo meter pips and fly-ins), same 60 x 68 viewBox; meter as an equalizer row; kamishibai event stage; story lacquer plaque (paddings and `--pg-x` kept); shoji and sound-ring transitions; rotate panel phone with sound arcs; ring favicon and boot pulse; fallback title bell; how-to byobu; scene death notes | P5 (tokens, meter), P7a (scene.js), P8 (rest) | X-01 to X-13 and Appendix B section 4 (V1 to V14) | screen_end:530-547 story paddings, hygiene: inline `data:` favicon in BOTH pages |

### 6.4 Acceptance screenshots (look at every PNG with the Read tool; iterate at least three times per drawing)

Run one browser at a time, wrap long commands in `timeout 300`. Write PNGs to your scratchpad, never into the repo.

```
node tools/rogue_book/shot.mjs --sheet logo --out <sp>/logo.png
node tools/rogue_book/shot.mjs --sheet scene_title --out <sp>/title.png
node tools/rogue_book/shot.mjs --sheet title_anim --out <sp>/title_anim.png
node tools/rogue_book/shot.mjs --sheet scene_victory,scene_defeat,scene_paper,scene_ch3,scene_boss3 --out <sp>/scenes.png
node tools/rogue_book/shot.mjs --sheet map_page,map_kinds,map_frame,map_bloom,map_paper,map_doodles,map_token --out <sp>/map.png
node tools/rogue_book/shot.mjs --sheet icons_ui,icons_tiles,icons_relics,icons_status --out <sp>/icons.png
node tools/rogue_book/shot.mjs --sheet heroes,portraits --out <sp>/heroes.png
node tools/rogue_book/shot.mjs --sheet motifs --out <sp>/motifs.png
node tools/rogue_book/shot.mjs --sheet enemies3,boss3,boss1 --out <sp>/enemies.png
node tools/rogue_book/shot.mjs --sheet fx --out <sp>/fx.png
node tools/rogue_book/shot.mjs --url "rogue_book/index.html?debug=1&notutorial=1" --js "GAME.debug.open('map',{painted:0.3})" --frames 200 --out <sp>/game_map.png
node tools/rogue_book/shot.mjs --url "rogue_book/index.html?debug=1&notutorial=1" --js "GAME.debug.open('event',{})" --frames 120 --out <sp>/game_event.png
node tools/rogue_book/shot.mjs --url "rogue_book/index.html?debug=1&notutorial=1" --js "GAME.debug.open('combat',{chapter:3,enemies:['boss_editor']})" --frames 120 --out <sp>/boss.png
node tools/rogue_book/shot.mjs --url "rogue_book/index.html?debug=1&notutorial=1" --js "GAME.debug.open('combat',{heroes:['hanae','kuro'],enemies:['kappa']})" --frames 120 --out <sp>/kuro_fight.png
node tools/rogue_book/shot.mjs --url rogue_book/index.html --viewports 1280x720,844x390,390x844 --out <sp>/title.png
```

(`<sp>` is your scratchpad directory. If a `GAME.debug.open` parameter is not supported, read `GAME.debug` in `js/main.js` and DESIGN 5.10
for the real signature. Animated sheets: add `--param frames=6 --param t0=0 --param t1=1`.)

Art acceptance (every item must be true in the screenshots):

1. No open book, page stack, gutter, bookmark ribbon, page curl, parchment stain, quill, fude brush, inkstone or ink drop remains in any
   sheet or screen (the inked LINE and gold leaf remain by design).
2. Map: fog reads grey and still, woken hexes read colourful with echo rings, a reveal is a circular wavefront with escaping rings and a
   rising note, the frame is lacquered wood whose window is exactly `ART.map.frameInner(1280, 720)` = `{x: 44, y: 36, w: 1192, h: 648}`.
3. Title: the bell sits inside x 292..988 below the logo; the logo spells ECHOWAKE and pulses; grey ash and frost creep at the corners; the
   menu column (x 998) covers none of it at 1280x720, 844x390 and 390x844.
4. Kuro holds a flute in every pose, portrait, card hero art and on the map token; his cast writes a note sigil.
5. Verse III and the boss read as silence (felt, wadding, futon quilting, cloth gags and cords, ash flecks) with no paper text rows, pens,
   erasers, TV static, studio foam or black bars.
6. Map motion: in a 30 percent woken map, woken hexes near the party visibly move between two frames 1 s apart; fog does not.

## 7. Audio plan

All exact code is in Appendix E. Summary:

### 7.1 What the player hears

| Feature | Behaviour |
|---|---|
| Melodic reveal | Every map hex owns one note of a seeded per-map tune in the chapter map track's key, an octave up. Columns carry a stepwise contour (`W_STEP`, largest leap 2 degrees; simulated over 6000 maps with the real `U.rng`), rows bend it (up the map is up the scale). Notes fire one to one with the existing bloom cascade (`stepReveals`, at each `rv.started`): one tap = one held note; a chain = a phrase 0.13 s apart ending on a held cadence; the Daily Jam map sounds the same for everybody. The `single` voice changes per verse (Verse I koto, Verse II shamisen for the festival town, Verse III a glassy rin with a shorter echo for the thunderless citadel; lite mode arp). A walk hums the path back, thinned so wake notes stay the bright event: the first 6 steps of a walk each hum, after that only every second step; a step on a hex that sounded in the last 4 s is skipped; step notes are a breathy `vox` "mm" at vel 0.18 (lite: arp). Pitch is decoration, never information. |
| Song gestures (voice and rhythm) | Keyed by `DATA.brushes` ids in a `SONGS` table; every Song has a sung or spoken layer from the new formant `vox` voice (Appendix E 7.1.10), because the owners are a beatbox and singing duo: Drum Line (`stroke`) shamisen notes with a taiko AND spoken kuchi shoga per note (`don` on the first, then `ka`, `tsu` alternating); Ripple (`wave`) a rising koto run doubled softly by a vox "oo"; Shout (`fan`) a short vox "hey!" on the root with the strummed triad under it; Beat Drop (`splash`) a beatbox kick and sub drop, then the biwa an octave down, then the ring rises; Chorus (`halo`) 3 to 6 stacked vox "ah" voices with slight detune over the rin bells; Hum (`blot`) one long closed-mouth vox "mm". Chord Songs snap their root to a consonant scale degree (`CHORD_ROOTS`, Appendix E 7.1.3), so no chord holds a semitone, tritone or major seventh in any verse. |
| The Hush | `AUDIO.awake(MAP.progress(M).frac)` (called from `paintProgress`) drives the three map tracks through layer fields only (no new roles, so the measured `MIX` table stays valid) and a per-deck low-pass and gain with verse depth (ch1 lo 900 Hz floor 0.85, ch2 750 / 0.8, ch3 600 / 0.75: a muffled mood, never broken-sounding audio). The wake curve is CALIBRATED in P6 from the balance bot (Appendix E 7.2.4): full music arrives at the median share of the map a player has woken when they reach the keeper, and the melody layer by about 0.6 of it. The first woken hex of each verse briefly opens the filter (x1.5 for 2 s), so the player hears the land answer at once. The filter lives on the map deck, never on the music bus, so a fight is never muffled. |
| Temple bells | The `well` sfx (id kept) is re-voiced as a struck, beating bonsho that ducks the music 600 ms, transposed at play time into the current map key (`tune: 55`). |
| Echo send | One shared half-beat feedback delay, built once in `buildGraph`, optional like the hall; skipped when calm or lite. |
| Re-voiced map sounds (ids kept) | `paint` a sung "hah", `ink_splash` two wooden knocks and an answer, `brush_pick` a hummed motif, `brush_use` an intake of breath and a downbeat, `ink_gain` a rising echoing "ooh", `well` the temple bell, `page_turn` two sharp hyoshigi claps with a short wooden room tail (the kamishibai opening ritual, matching the event stage of D10). |
| Options | `AUDIO.options({calm, lite})` bridged from `UI.applySettings` (`calm` = reduceMotion: no echo, no hummed steps; `lite` = quality low: arp voice only, no vox, fewer notes, no echo). |
| Note marks (required, the melody made visible) | Every wake call releases a small note glyph (`tk.note`) from the hex that rises to a height that follows the note's degree (`AUDIO.wakeDegree`, pure, so it works with sound off, Effects at 0, or before audio init); soft walk notes at half alpha; at most 24 alive; under reduce motion a static mark that only fades. This is the deaf and sound-off twin of the melody (Appendix E 7.5, owned by 6B). |

### 7.2 Insertion points

| File | Anchor (match the code, line numbers from a2bd24b) | Change |
|---|---|---|
| `js/audio.js` | after `const TAPER = 1.5;` (71) | Echo constants `WAKE_FROM WAKE_SPAN HUSH_HI DEG_LO DEG_HI NOTE_CAP NOTE_CAP_LITE WAKE_GAIN ECHO` |
| `js/audio.js` | after `const TH_FINAL = [0, 0.05, 0.2, 0.4];` (551) | `TH_WAKE` (placeholder `[0, 0.15, 0.4, 0.65]`, final values from the 7.2.4 calibration) |
| `js/audio.js` | `TRACKS` map1, map2, map3 (591 to 622) | `drive: 'awake'`, `thresholds: TH_WAKE`, `hush: {lo, floor}`, per-role `layer` (roles, order and gains unchanged); moods of boss3, final, defeat |
| `js/audio.js` | `compose` desc literal (871) | `drive`, `hush` fields |
| `js/audio.js` | after `compose`, before the SOUND EFFECT RECIPES banner (882) | pure ECHO section: `SONGS`, `CHORD_ROOTS`, `snapRoot`, `W_STEP`, `contour`, `echoKey`, `degToMidi`, `hexNote`, `songDegrees`, `wakeDegree` |
| `js/audio.js` | `VOICES`, `RANGES`, `TRIM`, `HUMAN`, `VOICE_TAIL`, `SUSTAINED` (104, 890, 1301 to 1306) | the new `vox` voice `vVox` (Appendix E 7.1.10); never used in a score (MIX unchanged) |
| `js/audio.js` | `SFX_DEFS` 963 to 985 | re-voice the 7 map recipes (keys kept); `rawRecipe` learns `tune` |
| `js/audio.js` | `buildGraph` after the hall block (1413) | echo send `g.echoIn`, `g.echoDelay` |
| `js/audio.js` | `const S = {` (1428) | `awake: 1, opt: {calm: false, lite: false}, notes: [], tokens: NOTE_CAP.burst, tokT: 0` |
| `js/audio.js` | `buildDeck` (1462), `applyLayers` (1481) | deck low-pass `deck.lp`, `deck.hg`; drive-aware layers; `applyHush` |
| `js/audio.js` | `startMusic` (1532) | `if (desc.drive !== 'intensity') S.intensity = 0;` (was `desc.layers <= 1`) and the echo delay time |
| `js/audio.js` | after `intensity` (1613 to 1619); `intensity` itself | `wakeLevel`, `awake`, `options`, `wake`, `wakeExtras`; `intensity` re-targets only `drive === 'intensity'` decks |
| `js/audio.js` | `sfx` (1620) | apply `R.tune` to the pitch |
| `js/audio.js` | `render` (1670), `debug` (1705), the return object (1715), header comment | awake default for map tracks; debug fields; export `wake, awake, options, hexNote, songDegrees, wakeDegree, SONGS` |
| `js/screen_map.js` | after `const snd = (id) => { ... };` (87) | `echoInfo`, `wakeNote(s, q, r, o)` (guarded with `isFn`) |
| `js/screen_map.js` | `startReveals` (1297), `stepReveals` (1317) | records carry `song`, anchor; `snd('paint')` per cell replaced by `wakeNote(...)` with `last` on the final cell |
| `js/screen_map.js` | `applyBrushNow` (1553 to 1555) | drop the extra `snd('paint')`; pass the Song id and anchor to `startReveals` |
| `js/screen_map.js` | `arrive` (1628) | thinned soft step: `wakeNote(s, q, r, { soft: true })` after the position guard, subject to the walk rules of 7.1 |
| `js/screen_map.js` | `wakeNote`, `begin`, `drawWorld` after `drawPops` | note marks: `s.noteMarks` (cap 24), `drawNoteMarks(s, ctx, size)` (Appendix E 7.5) |
| `tools/rogue_book/bot.mjs`, `tools/rogue_book/bot/driver.mjs` | the option parser; the place the driver enters a boss node | opt-in `--awake-report` flag for the calibration (Appendix E 7.2.4); default output and `--runs-out` records unchanged |
| `js/screen_map.js` | `paintProgress` (1083) | `AUDIO.awake(p.frac)` (guarded) |
| `js/ui.js` | `applySettings` after the `setVolume` line (194) | `AUDIO.options({calm, lite})` (guarded); header line 12 lists `AUDIO.options` |

### 7.3 Accessibility and performance

Every cue keeps or gets a visual twin (the bloom, the REQUIRED rising note marks and the announce for wake notes, the progress meter
`N% awake` with `aria-valuetext` for the Hush, the ring fx and toast for the bell). No gameplay information lives only in sound; nothing flashes with the beat. Budgets: a token
bucket (14 notes/s, burst 8, 12 ringing; lite 8/5/6) with a cadence bypass; notes dropped above 176 live sources; `wake` returns before
building any node when the Effects slider is 0, when suspended or before init; the echo is one delay, two gains and one filter built
once; the hushed map schedules 10 to 25 percent of its notes, so early verses are cheaper than today; `AUDIO.awake` runs only when the
woken count changes. `MAX_LIVE` (220) is unchanged.

### 7.4 Audio tests

Audio suite A0 to A14 (A12 chord consonance, A13 the calibrated wake curve, A14 the vox voice), the browser loudness check L1 (Appendix E 7.7; the node stub cannot render audio), hygiene H1
(wrapper `snd`/`sfx` calls, `tick:` ids and quoted `'data-sfx'` keys checked against `LISTS.sfx`; verified valid on today's code),
screen_map M0 to M6 (spies on `AUDIO.wake` and `AUDIO.awake`; per-cell notes need realtime boots because `startReveals` returns early
headless; M6 the note marks), ui suite bridge. All in Appendix E.

### 7.5 Optional audio extras (only if P6 finishes with time to spare, or the owner asks)

(The rising note marks and the `vox` voice USED to be listed here; they are now required P6 scope, 7.1.)

- `hush` sfx for the verse intro (appended to the END of `LISTS.sfx`, with a recipe): Appendix E 7.8, step E2.
- Kuro's `flute_call` overlay when a Kuro card is played: Appendix E 7.8, step E3 (touches more contracts; owner's call).
- Renaming the 7 internal sfx ids (Appendix E, end): owner's call (section 11).

## 8. Test and docs plan

### 8.1 Strategy (so the rename is not a literal hunt)

Two mutation probes by the tests lens rewrote the player-facing strings in a scratch copy and ran all suites: the first probe (369
literals) broke 98 of about 162,000 assertions in 15 suites; the second (619 literals) broke 184 in 17 suites, plus about 200 assertions
of the integration suite that never ran because ONE label regex in the QA player (`/begin the tale/i`) stopped matching. 21 suites
(every art suite, audio, combat, map, scene, screen_combat, bot, hygiene, browser, cards hanae/suzu/raiga, enemies_2) were untouched.
With every internal id kept, the balance bot's per-run records came out byte-identical. So:

1. **P1 hardens first**, while the game still says Ink: stable `data-act` hooks replace label lookups in the QA player and tests; tests
   that assert a DATA-owned name read it from DATA (`DATA.brushes.stroke.name`, `DATA.tiles.boss.name`, `DATA.tiles.block.name`,
   `DATA.lore.intro.title`, the roster); the Kuro id-from-name rule becomes a frozen id list; the How to play tip regex accepts both
   wordings. Everything stays green.
2. **Each later phase edits the literal copy pins of the code it owns, in the same commit as the copy.** Do not template whole
   sentences; do not mass-edit test titles or assertion messages (cosmetic). Fix only messages that would mislead ("Kuro is bookish"
   becomes "Kuro is musical").
3. **Silent guards** stay green after a rename but stop testing; they must be edited anyway: `content.test.mjs:720` (Ink costs charged in
   every outcome), `run.test.mjs:1408` (`/kind|give|Fable/i` still fine because Fable stays), narrative 195. Rule: in every suite you
   touch, grep its regex literals for `Ink|Brush|paint|Tale|page|book|Blank|Library|Inkstone|Trial|Daily|Sumi|Chapter` even when green.
4. **Never delete an assertion to make a suite pass.** Change what it expects, with the reason in the commit message.

### 8.2 Per-suite changes and their phase

| Suite (`tests/rogue_book_*.mjs`) | Change | Phase |
|---|---|---|
| `player.mjs` (QA player, drives `game.test`) | 124/125 already use `data-act=daily/new`; 132 keep (`[aria-label*=Daily]` still matches "Daily Jam"); 142 `$('[data-act=trial-up]')` first, label fallback `/Raise the (Ink|Tempo) Trial/`; 145 `$('[data-act=begin]')` first, fallback `/begin the (tale|journey)/i`; 150 `$('[data-act=skip]') || $('[data-act=turn]')` first, fallback `/play on|turn the page|continue/i`; 410 add `play on` to the button regex `/^(continue|fight|leave|go on|play on|turn the page|move on|walk on)/i` | P1 |
| `browser.test.mjs` | 112 and 264 `s.press('[data-act=begin]', null, {...})` (keep each call's own options: `{ ms: 700 }` at 112, `{ touch: true, ms: 800 }` at 264) instead of `s.press('button', 'begin the tale', ...)`; 261 `document.querySelector('[data-act=begin]')` instead of the `/begin the tale/i` find. Read `s.press` in the suite first: if its second argument cannot be null, pass the selector form the helper supports. Acceptance: `grep -n 'begin the tale' tests/rogue_book_browser.test.mjs` returns only assertion messages | P1 |
| `screen_end.test.mjs` | 204, 212, 219, 323 click `[data-act=turn]` instead of `btnByText(g, /Turn the page/)`; 196, 228, 234, 457, 555 may keep `/^Skip/`; P3: 216 (`'A Blank Page'` fallback title -> `'A Silent Ballad'`), 274 `'CHAPTER ONE COMPLETE'` -> `'VERSE ONE COMPLETE'`, 306 and 398 `/Suzu joins the band/`, 359 `/Fell in Verse I/`, 398 `/Tempo Trial 2 unlocked/`, 445 `/... \| Tempo Trial 0/`, 741 `/Echo/` | P1, P3 |
| `screen_menu.test.mjs` | P1: 693 `DATA.lore.intro.title`. P2: 122 `/Verse 1/`. P3: copy rows of Appendix C (179, 472, 544, 616, 666, 696, 700, 723, 738, 764, 765, 775, 940, 1072, 1155, 1181, 1260, 1301, 1455, 1774, 1776, width model). P8: 1711-1735 title clearance rewritten (8.2 note below) | P1, P2, P3, P8 |
| `game.test.mjs` | P1: 673 select the tab with `x.dataset.id === 'story'`; 674 `new RegExp(DATA.lore.intro.title)` (escape it). P2: 214 `/Verse 1/` | P1, P2 |
| `cards_kuro.test.mjs` | P1: 119 becomes `t.ok(/^kuro_[a-z0-9_]+$/.test(c.id), ...)` plus, once after the loop, `t.deep(cards.map((c) => c.id).sort(), KURO_IDS, 'the 37 Kuro ids are frozen (saves store them)')` with `KURO_IDS` the sorted list of today's 37 ids written out literally; test name "the id is kuro_ plus the name" becomes "ids are frozen". P2: 793 `/sumi/` -> `new RegExp(DATA.statuses.sumi.name, 'i')` | P1, P2 |
| `enemies_1.test.mjs`, `enemies_3.test.mjs` | P1: 94 `t.eq(e.title, DATA.rosterById[r.id].title, ...)` (or the roster row `r.title`); enemies_3 158-159 compare with `DATA.rosterById.boss_editor.title` and `.name`. P2: enemies_3 200-201 the shared move literal `'Rub Through'` -> `'Smother'`. enemies_3 586-594 is a TEST-LOCAL fixture (`DATA.add('cards', { status_blot: { name: 'Blot' ...` because data_cards_shared.js is not loaded there): leave it unchanged | P1, P2 |
| `screen_combat.test.mjs` | P1 (agent 1B): line 366 `.indexOf('Nine-Tail')` -> `.indexOf(g3.DATA.enemies.boss_kuzunoha.title)` (use the DATA of that test's boot, whatever its variable is). Nothing else | P1 |
| `screen_map.test.mjs` | P1: 164-165 and 1450 `new RegExp(DATA.brushes.stroke.name)` and `DATA.brushes.fan.name`; 302 `new RegExp(DATA.tiles.boss.name + ', (glimpsed|seen|heard)')`; 292, 295, 1442 the Void checks `new RegExp(DATA.tiles.block.name)`. P3: every copy row of Appendix C. P6: M0 to M6 | P1, P3, P6 |
| `ui.test.mjs` | P3: 210, 1042 (`/bell/i`), 1044 (`/song/i`), 1132 (`/Chimes/`), 1147 (`/no saved journey/i`). P6: AUDIO stub, options bridge | P3, P6 |
| `lib.test.mjs` | 205 `'ECHOWAKE: a rogue ballad'` (with index.html) | P3 |
| `text.test.mjs` | every expected string with Ink, Sumi, paint, chapter, Brush (data lens list: 296, 426-429, 434, 435, 456, 502, 665, 672, 673, 675, 685, 687, 699, 701, 706, 1087, 1135, 1136, 1140, 1153, 1154, 1195, 1222, 1230) to the new words; the target sentences are in 5.3 | P2 |
| `treasure.test.mjs` | 217 `ink: /\becho\b/i`; 218 `paint: /wake/i, addBrush: /song/i`; 221 `inkMax: [/echo/i], startInk: [/echo/i], wellInk: [/bell/i, /echo/i]`; 229 `onChapterStart: /verse/i`, `onPaint: /wake/i`; 309 `'Every 5th time you wake a hex, gain 1 Echo.'`; 442 `'Gain 1 Echo, 2 gold and 3 Regen'` | P2 |
| `run.test.mjs`, `meta.test.mjs` | 5.7 rows | P2 |
| `content.test.mjs` | 720 the Echo cost guard (Appendix A "Block C"); 854 `startInk: /less Echo/, wellInk: /less Echo/`; 862 message wording | P4 |
| `narrative.test.mjs` | 195 `/echo/i`; 452 `' less Echo'`; 454 `'bells give ' + n + ' less Echo'`; 476 tip words `'ink'` -> `'echo'`, `'brush'` -> `'song'` (keep `fable`, `forge`, `trial`, `daily`, `bloom`); 494-520 spine test replaced (Appendix A); 542 Kuro bark regex "Kuro is musical" (Appendix A "Block B"); add the old-words guard over prose fields (Appendix A) | P4 |
| `screen_node.test.mjs` | 297 `/nothing but an echo/`, 955 `/Only silence/`, 1049 `/\+4 Echo \(3 to 7\)/`, 2078 `/No journey is underway/` | P3 |
| `audio.test.mjs` | A0 to A11 (Appendix E) | P6 |
| `hygiene.test.mjs` | H1 three `literalUses` lines (Appendix E) | P6 |
| `art_*.test.mjs` | contracts of 6.3 must stay green; test titles that say "drip", "ribbon sways", "INKWOVEN" may be relabelled (cosmetic) | P5, P7a, P7b, P8 |
| `data.test.mjs` | no edit: roster rows follow CONTENT_SPEC (P2, same commit); doc pins (P9) | P2, P9 |
| NEW `theme.test.mjs` | 8.3 | P9 |
| hygiene, bot, combat, map, scene, cards hanae/suzu/raiga, enemies_2, art_core | no change expected: run them as regression (screen_combat is NOT in this list: 1B edits its line 366 in P1) | every phase |

Title clearance test (screen_menu.test 1711-1735, P8): today it regex-reads `art_scenes.js` source for the book's `const cover` polygon
and `layer('book', ...)`. In P8 the art agent extends `ART.scene.info('title')` (art_scenes.js about 3242, it returns `{id, combat,
ground, mood, layers}`) with `focus: { x0, x1, y0, y1, k }` (the centrepiece's bounding box in stage px including its ink line and gold
fittings, and its layer parallax factor). The menu agent rewrites the test to boot `ART` (or read it through the screen boot it already
has), take `f = ART.scene.info('title').focus`, keep reading `camK` from `screen_menu.js` with the existing regex, and assert
`left >= f.x1 + f.k * camK` and `left + insetLeft >= f.x1`; keep every other assertion of that test (plaque widths, tagline indent,
gate hint indent, phone rules). Also fix the CSS comment in `css/menu.css` (about line 24) that describes the painted book. Test-local fixtures that carry old names
(`tests/rogue_book_data.test.mjs:350` title 'The Nine-Tail Ink Fox', enemies_3 586-594, text.test 760 and 1031) are fixtures, not DATA:
leave them unchanged.

### 8.3 The new permanent theme-leak suite: `tests/rogue_book_theme.test.mjs` (P9)

It must import `./rogue_book_lib.mjs`, use its loader and `t` helpers like the other suites, and end with `t.done()` (hygiene checks
that). It is also the "re-grep" CLAUDE.md demands after merging `origin/main`. It never reads `rogue_book/ECHO_PLAN.md` (the plan quotes
every old word on purpose). Define once:

```
RETIRED = /\b(Ink|Inks|Inkstones?|Inkweaver|Inkwoven|INKWOVEN|Brush(es)?|brush(es)?|[Pp]aint(s|ed|ing)?|Blank|Daily Tale|Ink Trials?|Library|Author|Editor|Eraser|Sumi|Bookmark|Unwritten|Chapter|chapter|storybook|[Bb]ooks?|[Pp]ages?|quill|calligraph\w*|manuscript|ink)\b/
TALE = /\b[Tt]ales?\b/
SONG_LC = /\bsong\b/            (case sensitive: "Song", "Songs", "SONG" and "songs" pass)
```

Checks:

1. Every DATA display field passes `RETIRED`: cards `name`, `flavor`; relics and gems `name`, `text`; enemies `name`, `title`, `lore`,
   move `name`, `say`, phase `say`; events `title`, `text`, choice `label`, `cost`, outcome `text`; achievements `name`, `text`; trials
   `name`, `text`; lore `title`, `text`, bark lines; tips; tiles, Songs, keywords, statuses `name`, `text`; heroes `name`, `title`,
   `blurb`, passive `name`. Report the field path (for example `DATA.relics.ink_jar.text`) and the word.
2. String and template literals of `js/data_text.js run.js meta.js ui.js main.js scene.js screen_map.js screen_menu.js screen_node.js
   screen_combat.js screen_end.js tutorial.js`, from `tokenizeJs` in the lib (skip comment tokens). Before testing a template literal,
   replace every `${...}` with the placeholder `X` (so `${KW('Echo', 'ink')}`, `${nameOf('brushes', op.id)}`,
   `${DATA.brushes[id].name}` and `${R.ink - before}` never match). Skip a literal when the token right before it (ignoring whitespace
   and `(`) ends `new Error`, `err` or `console.<name>` (developer messages, for example run.js:645 `'RUN.startChapter: bad chapter '`
   is an expected skip). A literal counts as prose when it contains a space and a letter and does not start with `.`, `#`, `[` or `<`.
   Prose literals pass `RETIRED` and `TALE`.
3. `rogue_book/index.html` and `gallery.html`: `<title>`, boot splash, noscript and watchdog text pass `RETIRED` and `TALE`; the index
   `<title>` equals `ECHOWAKE: a rogue ballad`.
4. `DATA.LISTS.sfx.length >= 73` and it contains the 7 kept map ids `paint ink_splash brush_pick brush_use ink_gain well page_turn`
   (guards policy D8 against a half-done rename; 74 is legal when the optional `hush` sfx of 7.5 is appended last).
5. Optional: the four docs (`README.md`, `DESIGN.md`, `ART_BIBLE.md`, `CONTENT_SPEC.md`), outside backticks, pass `RETIRED`.
6. Lowercase song: `SONG_LC` must not match in the UI and rules strings: the prose literals of check 2, the tiles, Songs, keywords,
   statuses, heroes (`title`, `blurb`, passive `name`), relic and gem `text`, achievements, trials and tips. It is NOT applied to lore
   pages, barks, events, enemies or card flavour, where "the song" is the world (rule 0.8).

The allowlist is ONE exact array of `[string, reason]` pairs, matched on the whole literal or field value; nothing else may be skipped:

| Exact string | Reason |
|---|---|
| `Pages` | How to play pagination label (screen_menu.js 1970 to 1974), generic help pagination, kept by Appendix B 3.6 |
| `Page ` | same (screen_menu.js 1971) |
| `How to play pages` | same (aria label) |
| `How to play, page ` | same (screen_menu.js 2003) |
| `This is the first page` | same (screen_menu.js 2005) |
| `Drawn in ink, sung in code. No two journeys alike.` | credits line (screen_menu.js 525): "ink" is the drawing style |
| every DATA value that contains `Blank Stare` | the generic idiom (`nopperabo`), 3.2 |
| every DATA value that contains `Bounty Scroll` | a bounty notice, 3.2 |
| the folk paper items (`Paper Puppet`, `Paper Crane`, `Oil-Paper Umbrella`, `A Sea of Paper Boats`, `A Thousand Paper Cranes`, Suzu's `Paper Seal`) | folk craft; they never match `RETIRED` anyway, listed so nobody "fixes" them |

The two "contains" rows are the only non-exact entries: implement them as `[substring, reason]` checked against DATA fields only.
If the suite finds a hit that is none of these, it is a leak: report it to the lead (9B never edits copy).

### 8.4 Docs (P9; P2 edits CONTENT_SPEC 4.1 only)

General rule: rewrite PROSE to the Echo world; keep every backticked internal id and every phrase the data suite pins; no dashes, no
tabs; never spell the banned random call (README line 62 and DESIGN currently name it: if you touch such a sentence, write "no unseeded
random call"; untouched lines already pass hygiene).

Pinned by `tests/rogue_book_data.test.mjs` (keep EXACTLY): DESIGN heading `## 3. Files, namespaces and load order` and its code block
byte for byte; in DESIGN, every op (`ink`, `paint`, `addBrush` ...), status (`sumi`), hook (`onPaint`), combat event (`ink`), bus events in
quotes (`'map:paint'`, `'map:brush'`), tut anchors (`ink`, `brushes`), screens and overlays with a leading backtick, library tabs
(`unlocks achievements story bestiary history`), fx (`inkSplash`, `brushDrag`), map kinds (`painted`), icon kinds (`brush`), card sizes,
settings, elements (`ink`), the DATA function names and the pinned phrases ("once per enemy attack hit on a hero, even when fully
blocked", "Hook damage has no attacker", `RUN.finishNode`, `RUN.resolvePending`, `RUN.checkStranded`, `RUN.take`, `RUN.dailyHeroes`,
`META.unlockedSet`, `META.check(R?)`, "a lane with no living unit", `cause:'hit'|'turn'|'consume'`, "every boss is always immune to
`stun`", `UI.announce(text)`, "a free Cut Gems button", "chapter 3 boss win -> reward -> victory", "`damageTaken` and `hitsTaken`
counters", "`once` and `every` cannot be combined", "must be a `minion` tier id", "Cut Gems (any number of socket or replace
operations)", "16 + dr/2", `window.location`), and DESIGN must NOT contain `maxHpPct`, `setIntentsVisible`, `RUN.unsocket(` or any dash.
ART_BIBLE: `currently 59` (motif count), every fx id, `FIXED ROSTER`, `CONTENT_SPEC.md`, "never references `META`", `opts.phase` with
"0 = opening form" or "`opts.phase` 0, 1, 2", "`s` 110", "`m` 170", "`l` 250", "`xl` 340", and the palette token block (art_core:89
pins the hex values). CONTENT_SPEC: the 4.1 roster tables, the 3.1 idiom code lines byte-identical (their `//` comments may change), fixed
ids in backticks, quota phrases `exactly **66**`, `at least **40**`, `**24**`, `**32**`; it mentions `DESIGN.md` and `DATA.GUIDE`.
Before you commit a doc, run `node tests/rogue_book_data.test.mjs` and `node tests/rogue_book_hygiene.test.mjs`.

| Doc | Brief |
|---|---|
| `rogue_book/README.md` | `# ECHOWAKE`, "A rogue ballad. Two heroes, one silent land, a deck of gem-socketed cards."; play link unchanged; pitch: the Hush ate every sound, wake the land hex by hex with Echo, every hex you wake plays a note; the tally "Three verses, three bosses, four heroes, ten Tempo Trials, a Daily Jam, a Hall of Echoes of meta unlocks, a bestiary, achievements and a story to find"; Map section with the Songs (Drum Line `stroke`, Ripple `wave`, Shout `fan`, Beat Drop `splash`, Chorus `halo`, Hum `blot`), temple bells, Songbirds, the melody and the Hush; Heroes "Kuro (the Songweaver, a flute, back)"; Meta: Chimes, Tempo Trials, Daily Jam; Controls with the new verbs and the same keys ("N new journey, D daily, L Hall of Echoes"); Art and sound: "an inked anime line, cel shading, screen tone and gold leaf over a grey, hushed land that blooms back into colour; every hex you wake sings a note of the land's hidden tune, and the map music sleeps under the Hush until you wake it"; "balance targets (greedy bot at Tempo Trial 0)"; keep the `rb_` sentence verbatim; add "Internal ids keep the original ink names (DESIGN 1.1)." |
| `rogue_book/DESIGN.md` | title line and tagline; section 1 pitch rewritten (Hush, grey land, voice and rhythm, temple bells, melody path, Tempo Trials, Daily Jam); ADD section **1.1 Player-facing names versus internal ids** with the table in 8.5; 4.8 heading "Map, Echo and Songs" and prose (keep every backticked id, `MAP.*` names, numbers, `16 + dr/2`, `RUN.checkStranded`); 4.9 and 4.10 Tempo Trials, Daily Jam, Chimes, the Hall of Echoes (keep `RUN.dailyHeroes`, `META.unlockedSet`, `META.check(R?)`, `ECONOMY.inkstones`, every stat key); 5.x contract prose (Echo meter, Song tray, lacquer frame, story plaque, shoji and sound-ring transitions; keep API names `ART.map.paper`, `paintBloom`, `UI.transition('page')`, sfx ids); 5.2 line 725 "echo run-level ops" -> "mirror run-level ops"; 5.7 AUDIO: add the API block and the sentence from Appendix E "DESIGN.md 5.7 additions"; 1028 sound map wording; 6 Flow "Tempo Trial"; 9 File ownership: add one row "Echo re-theme (2026-10): see ECHO_PLAN.md" |
| `rogue_book/ART_BIBLE.md` | title; section 1 "Style in one line": "Ink-line anime in a world that lost its sound: cel-shaded shonen figures, screen tone and gold leaf against a grey, hushed land that blooms back into colour wherever sound returns"; rule 8 texture: "static grain on hushed things" (keep `ART.tk.paperGrain` as the helper name); keep the line, cel, halftone and gold rules and the palette block; section 2 Kuro paragraph (Appendix A identity: shakuhachi, sound rings, cord with a suzu bell, waveform hem, cyan note glyphs); section 3 Verse III and the boss trio; section 4 cards (cost orb, notation, hushed curses); section 5 icons (Echo ping, Song, Chimes, tile stamps, Song plaques); section 6 title (temple bell and ECHOWAKE logo that pulses), victory, defeat, `paper`, map (hushed versus awake, wavefront reveal, lacquer frame, 1180 x 640 window); section 7 `inkSplash` and `brushDrag` looks; section 8 UI (lacquer, shoji, kamishibai); section 9 audio (Appendix E "ART_BIBLE.md section 9 rewrite brief") |
| `rogue_book/CONTENT_SPEC.md` | title; section 1 voice and the example names ("Petal Slash", "Moon Veil", "Temple Bell"); 3 table Kuro archetype "**Breath spells**"; 3.1 idiom comments may say Echo (code lines byte-identical); 3.2 line 94 "echo it" -> "replay it"; 4.1 tables (P2); 5 relics "Echo and Song relics"; 6 events, achievements, trials, tips, lore wording ("Song and Echo gifts", "waking (`hexesPainted`)", "fewer Echo", the spine and voices, "Kuro musical and teasing"); 7 balance "Tempo Trial 0" |

### 8.5 DESIGN.md section 1.1 (paste in P9)

```
### 1.1 Player-facing names versus internal ids

The game was first themed as INKWOVEN (ink, brushes, a living book) and re-themed to ECHOWAKE (Echo, Songs, the Hush) without changing
a single internal id, so saves, seeds and balance stayed bit-identical. Never "fix" an id below to match its display word.
```

| internal id or word | player sees | display source |
|---|---|---|
| `ink`, `R.ink`, `startInk`, `inkMax`, `wellInk`, `campInk`, `killInk`, op `ink`, keyword `ink`, element `ink` | Echo | `DATA.keywords.ink.name`, data_text.js `KW('Echo', 'ink')` |
| `brush`, `brushes`, `R.brushes`, op `addBrush`, tile `brush`, `brushKinds`, keyword `brush` | Song(s); tile Songbird | `DATA.brushes[id].name`, `DATA.keywords.brush.name`, `DATA.tiles.brush.name` |
| `paint`, `painted`, `RUN.paint`, op `paint`, hook `onPaint`, bus `map:paint`, sfx `paint`, stat `hexesPainted` | wake, woken, awake | data_text.js, screen copy |
| tile `well`, sfx `well`, `wellsDrunk` | Temple Bell | `DATA.tiles.well.name` |
| `inkstones` (profile, ECONOMY, reward), stat icon `inkstone` | Chimes | screen copy |
| screen `library`, key `L` | the Hall of Echoes | screen copy |
| `chapter`, `chapters`, `onChapterStart`, `chapterClear`, `ch1`..`ch3` | Verse | data_text.js, screen copy |
| trials, `trialBest` | Tempo Trial | `DATA.trials`, screen copy |
| `daily`, `dailyRuns` | Daily Jam | screen copy |
| status `sumi` | Breath | `DATA.statuses.sumi.name` |
| `boss_editor`, lore and move ids | The Conductor, Keeper of the Last Note | `DATA.ROSTER`, `data_enemies_3.js` |
| sfx `ink_splash brush_pick brush_use ink_gain page_turn` | a find, learning a Song, singing a Song, Echo gained, the kamishibai claps | `js/audio.js` recipes |
| scene `paper`, `ART.map.paper`, `paintBloom`, fx `inkSplash`, `brushDrag`, motifs `ink_*`, `brush_stroke`, `book`, `quill`, `scroll`, `calligraphy` | re-drawn art | ART_BIBLE |
| CSS `--ink`, `--brush`, `--sumi`, `.mp-ink`, `.st-page`, `.mn-book`, `.ev-book`, `.ev-page`, `.rot-book`, `.s-library`, `.mn-daily`, `.mn-trial`, `.brush-div`, `.lg-brush` | re-styled | `css/*.css` |

### 8.6 Site files and the cover (P9)

- Root `/home/user/Games/index.html` (about lines 310 to 311): the card `{ id:'inkwoven', href:'/rogue_book/', title:'Inkwoven', ... }`
  becomes `title:'Echowake'`, `desc:'A rogue ballad. A yokai called the Hush has eaten every sound: lead two anime heroes across a
  grey, silent land, wake it hex by hex with Echo while every hex you wake plays a note, and fight with one shared deck of gem-socketed
  cards. Three verses, three bosses, four heroes, ten Tempo Trials and a Daily Jam.'`, `tags:['cards','strategy','music']` (`music` is a
  chip in `CHIP_DEFS`; check it exists there first). Keep `href`. The `id` is unused by the page and may stay. Keep `ac` unless the
  owner asks.
- `tools/rogue_book/cover.mjs`: update the header and the comment "the book open and glowing" (now "the temple bell under the moon");
  then RUN `node tools/rogue_book/cover.mjs` after P8 is merged (needs `sharp` and `playwright-core` in node_modules and the Chromium in
  `/opt/pw-browsers`); commit the regenerated `rogue_book/cover.webp` and `rogue_book/cover.webm`. Never hand-edit them. Look at the webp.
- Optional cosmetic sweep: the `Inkwoven --` first-line header comments in about 40 js files and 6 css files become `Echowake:`
  (comments only; hygiene only checks that a header exists). Do it in P9 by one agent only, after every other phase has merged.
- Optional, dev-facing: `tools/rogue_book/bot/report.mjs` headings "INKWOVEN balance bot", columns "Ink starvation", "Ink left"; test
  loader messages "banned in Inkwoven", UA "InkwovenTest". No test reads them.
- Optional, dev-facing (gallery.html sheet titles and header comments; outside the theme suite; same agent as the header sweep):
  `js/art_enemies_1.js:2566` "Chapter 1, ..." -> "Verse 1, ..."; `js/art_enemies_2.js:3390, 3431` and `js/art_enemies_3.js:3827`
  "Chapter N film strips" -> "Verse N film strips"; `js/art_enemies_3.js:3789` "Chapter 3, the Crimson Sky Citadel: normals, elites,
  minions (" -> "Verse 3, the Thunderless Citadel: normals, elites, minions ("; header comments `js/art_scenes.js:1591`,
  `js/data_events.js:456`, `js/data_enemies_3.js:1` "the Crimson Sky Citadel" -> "the Thunderless Citadel". Comments and sheet labels
  only. (art_enemies_1.js:2583 "Kuzunoha phase" is already covered by 5.10.)

### 8.7 Gates

1. **Determinism gate (no mechanic changed).** The baseline is regenerated from the base commit whenever it is needed, so no session
   depends on files another session left behind (P1, P8 and P10 run it):
   ```
   cd /home/user/Games
   git worktree prune; rm -rf /tmp/echo_base
   git worktree add --detach /tmp/echo_base a2bd24b && ln -s /home/user/Games/node_modules /tmp/echo_base/node_modules
   mkdir -p /tmp/echo_baseline
   (cd /tmp/echo_base && node tools/rogue_book/bot.mjs --all-pairs --runs 4 --trial 0,5 --seed 7 --combat greedy --effort fast --jobs 4 --quiet --brief --runs-out /tmp/echo_baseline/det_before.json --json /tmp/echo_baseline/det_before_sum.json)
   node tools/rogue_book/bot.mjs --all-pairs --runs 4 --trial 0,5 --seed 7 --combat greedy --effort fast --jobs 4 --quiet --brief --runs-out /tmp/echo_baseline/det_after.json --json /tmp/echo_baseline/det_after_sum.json
   cmp /tmp/echo_baseline/det_before.json /tmp/echo_baseline/det_after.json && echo IDENTICAL
   git worktree remove --force /tmp/echo_base
   ```
   About 6 s per bot run. Must print IDENTICAL. If not, `node tools/rogue_book/bot.mjs --diff /tmp/echo_baseline/det_before_sum.json
   /tmp/echo_baseline/det_after_sum.json` shows the drift: a re-theme change touched logic; find it and revert that part. (`tools/` and
   the game logic are identical at a2bd24b and today apart from the opt-in `--awake-report` flag of P6, which is off here.)
2. **Save compatibility (guards data loss).** Before P2 (P1 lead) and again after P8 (P8 lead) and in P10:
   ```
   mkdir -p /tmp/echo_baseline
   node tools/rogue_book/shot.mjs --url "rogue_book/index.html?debug=1&notutorial=1" --js "GAME.newRun({heroes:['hanae','kuro'],seed:7}); GAME.save(); JSON.stringify(Object.fromEntries(Object.keys(localStorage).filter((k) => k.indexOf('rb_') === 0).map((k) => [k, localStorage.getItem(k)])))" --frames 120 --out /tmp/echo_baseline/save_before.png > /tmp/echo_baseline/save_before.txt
   grep -c rb_run_v1 /tmp/echo_baseline/save_before.txt     # must print 1 or more
   ```
   (`GAME.newRun` and `GAME.save` are documented in the main.js header lines 9 and 22.) If `/tmp/echo_baseline/save_before.txt` is
   missing in a later session, regenerate it from the base commit exactly like gate 1 (the worktree at a2bd24b, run the same command with
   that worktree as the working directory). After P8: put the printed JSON object (the line of save_before.txt that starts with `{`;
   shot.mjs may print the result as a quoted string, so unquote it once with `JSON.parse` if needed) into `/tmp/echo_baseline/store.json`,
   then run `node tools/rogue_book/shot.mjs --url "rogue_book/index.html?notutorial=1" --store "$(cat /tmp/echo_baseline/store.json)"
   --frames 90 --out /tmp/echo_baseline/save_title.png` (the title with Continue) and the same with `--js "GAME.continueRun().then(() =>
   'continued')" --frames 150 --out /tmp/echo_baseline/save_map.png`.
   Acceptance: the Continue line matches `/Verse 1, Echo \d+, Hanae and Kuro/`, `continueRun` resolves and the screenshot shows the map,
   and shot.mjs reports no console errors.
3. **`npm run check` green** before every push (9.0), and `node tests/rogue_book_all.mjs --strict` green.
4. **Theme-leak suite green** (from P9 on).
5. **Screenshots looked at**: the lists in each phase.

## 9. Phased execution

Eleven phases (P7 is split in two), each one PR, strictly in order: P1, P2, P3, P4, P5, P6, P7a, P7b, P8, P9, P10. P2, P3 and P4 change
visible words: ship them on the same day so the live site shows mixed vocabulary for as short a time as possible. Every phase ends with
the ship procedure (9.0.3) and the play link. Every phase PR also edits the `Status:` line at the top of this file (for example
`Phases merged: P1 3f2a9c1, P2 77b01de`), in the same commit.

| Phase | PR title (suggested) | Visible change | Agents (parallel) |
|---|---|---|---|
| P1 | Echowake P1: theme-proof tests and baselines | none | 3 |
| P2 | Echowake P2: data names and rules text | cards, relics, enemies, tiles, Songs, keyword and status words | 5 |
| P3 | Echowake P3: UI copy, tutorial and title strings | every screen's words, document title | 5 |
| P4 | Echowake P4: the story, fables, achievements, trials, tips | lore, barks, fables, feats | 2 |
| P5 | Echowake P5: the hushed map, icons and the Echo meter | map art, icons, cost and energy orbs | 3 |
| P6 | Echowake P6: the melodic reveal and the Hush | audio | 2 |
| P7a | Echowake P7a: Kuro's flute, card motifs, Verse I and fx | Kuro, cards, Kuzunoha, combat fx | 4 |
| P7b | Echowake P7b: Verse III and the Conductor | Verse III enemies, the final boss | 1 |
| P8 | Echowake P8: title bell, logo, event stage, story plaque, transitions | title, logo, scenes, event and story screens | 4 |
| P9 | Echowake P9: docs, theme-leak guard, cover, site card | docs, games index card, covers | 3 |
| P10 | Echowake P10: independent verification fixes | fixes only | 2 + fixers |

### 9.0 Common procedure (every phase)

#### 9.0.0 Resume protocol (a new session starts here)

This project spans many sessions and containers. Nothing outside the repository survives between them, so:

1. The plan lives in the repository: P1's first commit adds `rogue_book/ECHO_PLAN.md` (it already passes the hygiene suite: no dashes, no
   tabs, no banned call; the theme-leak suite of 8.3 never reads it). If it is missing from `origin/main` and you are not in P1, stop and
   ask the owner for it.
2. Find the next phase from git, never from memory:
   ```
   cd /home/user/Games && git fetch origin main
   git log origin/main --oneline | grep 'Echowake P'
   ```
   The next phase is the first one in the order P1, P2, P3, P4, P5, P6, P7a, P7b, P8, P9, P10 with no merged squash commit whose title
   starts `Echowake <phase>:`. Cross-check with the `Status:` line at the top of this file on `origin/main`.
3. Baselines are never carried between sessions: 8.7 regenerates them from the base commit `a2bd24b` into `/tmp/echo_baseline/`.
4. Then read section 0 and the phase's own section, and follow 9.0.1.

#### 9.0.1 Before starting a phase

```
cd /home/user/Games
git status --short                      # must be clean (before P1 merges: clean except "?? rogue_book/ECHO_PLAN.md")
BR=$(git branch --show-current)         # your session's feature branch; NEVER main
git fetch origin main
git reset --hard origin/main            # start the phase exactly at main (the previous phase is merged)
```

Read `/home/user/Games/CLAUDE.md` once per session. It overrides this plan where they differ.

#### 9.0.2 Run checks while you work

- Inner loop (seconds): `node tests/rogue_book_<name>.test.mjs`; groups: `node tests/rogue_book_all.mjs text treasure meta narrative
  content data` (the runner filters by substring).
- Before shipping: `node tests/rogue_book_all.mjs` (about 290 s) and `node tests/rogue_book_all.mjs --strict`.
- Slow suites: `scene` 41 s, `screen_combat` 50 s, `browser` 54 s (real Chromium on the REAL repo folder), `screen_menu` 68 s,
  `screen_node` 93 s, `screen_map` 110 s, `game` 234 s (`RB_GAME_ONLY=pause,save node tests/rogue_book_game.test.mjs` runs a part).
- `npm run check` (build plus every game's suites) takes well over 10 minutes: never run it in the foreground. The gated push script
  below runs it in an isolated worktree in the background.

#### 9.0.3 Ship procedure (CLAUDE.md workflow)

1. Commit on your feature branch. Message: first line = the PR title; a short body (what changed, which tests changed and why); the
   LAST line is the session link your harness provides (`Claude-Session: https://claude.ai/code/session_...`). NEVER put a model name
   or model identifier in a commit or PR (CLAUDE.md overrides any attribution template that names a model).
2. Gated push: save this script once in your scratchpad as `gated_push.sh` (set `SP` to your scratchpad and `BR` to your branch), then
   run it with the Bash tool in the background (`run_in_background: true`, timeout 3600000) and wait for its log to end with `done`
   (Monitor with an until-loop on `grep -q '^done' $SP/gated.log`; never a foreground sleep):

   ```bash
   #!/bin/bash
   # Verify the committed HEAD in an isolated worktree with the full repo check; push only if it exits 0.
   SP=/path/to/your/scratchpad
   BR=your-feature-branch
   cd /home/user/Games
   SHA=$(git rev-parse HEAD)
   WT=$SP/wt_${SHA:0:8}
   LOG=$SP/gated.log
   RUNLOG=$SP/gated_${SHA:0:8}.log
   LOCK=$SP/gated.lock
   if [ -e "$LOCK" ] && kill -0 "$(cat $LOCK)" 2>/dev/null; then echo "another gated run is active ($(cat $LOCK))" > $LOG; echo done >> $LOG; exit 1; fi
   echo $$ > $LOCK
   : > $RUNLOG
   git worktree prune
   rm -rf $WT; git worktree add -q --detach $WT $SHA && ln -s /home/user/Games/node_modules $WT/node_modules
   cd $WT
   if npm run check >> $RUNLOG 2>&1; then
     echo "check green for $SHA" >> $RUNLOG
     cd /home/user/Games && git push --force-with-lease=$BR origin $SHA:refs/heads/$BR >> $RUNLOG 2>&1 && echo "pushed $SHA" >> $RUNLOG
   else
     echo "check RED for $SHA, not pushing" >> $RUNLOG
   fi
   cd /home/user/Games && git worktree remove --force $WT
   echo "done" >> $RUNLOG
   rm -f $LOCK
   cp $RUNLOG $LOG
   ```

   (The first push of a new branch has no lease to check: if `--force-with-lease=$BR` refuses because the remote branch does not exist,
   push that once with `git push -u origin $SHA:refs/heads/$BR` after a green check.)
3. If the log says RED: read it. A failing `rogue_book` suite is yours: fix it, commit, rerun the script. A failing suite of ANOTHER game:
   do not touch that game; re-run that one suite alone (several are randomised and fail on maybe one board in five); if it still fails,
   push your work anyway (`git push origin HEAD:$BR` after confirming every `rogue_book` suite is green) and name the game and the
   assertion in your reply.
4. PR with the GitHub MCP tools only (no gh CLI for PRs), repo owner `RoxorLoops1337`, repo `Games`:
   `mcp__github__create_pull_request` (head `$BR`, base `main`, `draft: true`, the PR title, a body listing what changed, the tests
   touched, the gates run, and ending with the attribution lines your harness gives for PR descriptions minus any model identifier);
   then `mcp__github__update_pull_request` with `draft: false` (mark ready); then `mcp__github__merge_pull_request` with
   `merge_method: 'squash'`. Do not ask the owner first (CLAUDE.md). If the token has expired, the push still counts: open the PR when it
   recovers.
5. Sync the branch to main after the merge: `git fetch origin main && git reset --hard origin/main && git push --force-with-lease=$BR
   origin HEAD:refs/heads/$BR` (this push carries no new commit: it equals main, which passed the check).
6. If you ever merge `origin/main` INTO the branch instead (conflicts after a squash merge are normal): resolve keeping HEAD (your
   branch), re-run the checks, and RE-GREP your feature (from P9 on: `node tests/rogue_book_theme.test.mjs`; before P9: the grep in the
   phase's acceptance).
7. End your reply to the owner with the play link: `Play: https://games-71g.pages.dev/rogue_book/` (Cloudflare Pages rebuilds about a
   minute after the merge).

#### 9.0.4 Agent preamble (prepend to every agent prompt)

```
You are working in /home/user/Games on the rogue_book game (INKWOVEN being re-themed to ECHOWAKE). Read
/home/user/Games/rogue_book/ECHO_PLAN.md sections 0, 2 and 3 first (rules, decisions, glossary), then the sections and appendix rows
named below. The file is about 420 KB: never read it whole. Find each section with grep -n on the anchor your prompt gives (for example
grep -n '^### 3.1 Words' rogue_book/ECHO_PLAN.md) and read it with the Read tool's offset and limit. Edit ONLY the files listed as yours; other agents are editing other files in the same working tree at the same time.
Do not commit, push, create branches or worktrees, or run npm run check; the lead does that. House rules: never an em dash or an en
dash anywhere (use a comma, a colon or a full stop), no tab indentation, never write the name of the platform's unseeded random
function (use U.rng), ES2020 only, British spelling, printable ASCII in DATA strings. Never change an internal id, op, number, cost,
CSS class, data-tut value, sfx id or save field: only player-facing text, art and audio (plan section 5.11). Match code by the quoted
text, not by line numbers (other phases moved lines). When you change a test, change what it expects, never delete an assertion. When
done, run the tests listed for you, and report: files changed, tests run and their result, anything you could not do, and any string
you had to invent (with the reason).
```

### P1: theme-proof tests and baselines (no visible change)

Goal: make every test that will be affected by the rename robust BEFORE any word changes, record the baselines. The game still says Ink
at the end of P1, and every suite is green.

Lead, before launching agents:
0. Commit `rogue_book/ECHO_PLAN.md` first, alone, on the feature branch (message `Echowake P1: add the re-theme plan`, ends with the
   session link). Every later phase and session reads it from the repository (9.0.0).
1. Determinism baseline (8.7 gate 1): run the gate's commands (they build the baseline from a2bd24b in `/tmp/echo_baseline/`); it must
   already print IDENTICAL against today's main.
2. Save baseline (8.7 gate 2): run its command; `/tmp/echo_baseline/save_before.txt` must contain `rb_run_v1`.

| Agent | Owns (edit) | Task |
|---|---|---|
| 1A hooks | `js/screen_menu.js`, `js/screen_end.js`, `tests/rogue_book_player.mjs`, `tests/rogue_book_browser.test.mjs`, `tests/rogue_book_screen_end.test.mjs`, `tests/rogue_book_screen_menu.test.mjs`, `tests/rogue_book_game.test.mjs` | data-act hooks and label-free tests |
| 1B data tests | `tests/rogue_book_cards_kuro.test.mjs`, `tests/rogue_book_enemies_1.test.mjs`, `tests/rogue_book_enemies_3.test.mjs`, `tests/rogue_book_screen_combat.test.mjs` (line 366 only) | frozen ids, roster-read titles, the boss reveal title read from DATA |
| 1C DATA-read names | `tests/rogue_book_screen_map.test.mjs`, `js/screen_map.js` (the two hard-coded tile names at 1340 and 2195 only), `js/screen_node.js` (the two at 1925 and 2046 only) | DATA-read names in tests and in the hard-coded copies |

Prompt 1A (after the preamble):
```
Phase P1, agent 1A. Plan sections: 8.1, 8.2 (rows player.mjs, browser, screen_end, screen_menu, game).
1. js/screen_menu.js: add internal data-act hooks. The hero select Begin button (built with btn(BEGIN_TALE, ...) near line 785): after
   it is created set begin.dataset.act = 'begin'. The trial stepper buttons near lines 773 to 774 (mk('button', { ... 'aria-label':
   'Lower the Ink Trial' ...}) and 'Raise the Ink Trial'): add dataset: { act: 'trial-down' } and { act: 'trial-up' }. The Daily
   toggle in the hero select (.mn-daily): add data-act 'daily-toggle' to its input or toggle element. Also make the How to play tip
   regex for page 'map' (near line 1932, tip: /Painting a hex costs Ink/) tolerant: tip: /^(Painting|Waking) a hex costs (Ink|Echo)/.
   Do not change any visible text.
2. js/screen_end.js: after const skip = UI.btn('Skip', ...) (near 460) set skip.dataset.act = 'skip'; after const turn =
   UI.btn('Turn the page', ...) (near 462) set turn.dataset.act = 'turn'.
3. tests/rogue_book_player.mjs: line ~142 trial button: $('[data-act=trial-up]') first, fallback the label regex
   /Raise the (Ink|Tempo) Trial/; line ~145: $('[data-act=begin]') first, fallback /begin the (tale|journey)/i; line ~150 story():
   $('[data-act=skip]') || $('[data-act=turn]') first, then the existing label fallbacks with /play on|turn the page|continue/i; line
   ~410 button regex: add 'play on' -> /^(continue|fight|leave|go on|play on|turn the page|move on|walk on)/i.
4. tests/rogue_book_browser.test.mjs: lines 112 and 264 call s.press('button', 'begin the tale', {...}); change both to press the
   [data-act=begin] button (keep each call's options; read the suite's press(sel, text, o) helper near line 73 and pass the selector
   with no text filter). Line 261 finds the button with /begin the tale/i: use document.querySelector('[data-act=begin]') instead.
   Acceptance: grep -n 'begin the tale' tests/rogue_book_browser.test.mjs returns only assertion messages (or nothing).
5. tests/rogue_book_screen_end.test.mjs 204, 212, 219, 323: click the [data-act=turn] button instead of btnByText(g, /Turn the page/)
   (use the suite's own helpers for querying and clicking).
6. tests/rogue_book_screen_menu.test.mjs: 693 compare with DATA.lore.intro.title instead of 'Once, a Book' (use the DATA of the booted
   game in that test). Leave 1774-1776 as they are (P3 changes the label text).
7. tests/rogue_book_game.test.mjs 673: tabs.find((x) => x.dataset.id === 'story') instead of /Story/; 674: test the pane text against
   the escaped DATA.lore.intro.title instead of /Once, a Book/.
Run: node tests/rogue_book_screen_end.test.mjs; node tests/rogue_book_screen_menu.test.mjs; node tests/rogue_book_browser.test.mjs;
RB_GAME_ONLY=pause,save node tests/rogue_book_game.test.mjs; then node tests/rogue_book_game.test.mjs (234 s, run it in the background
and wait for it).
```

Prompt 1B:
```
Phase P1, agent 1B. Plan sections: 8.2 (rows cards_kuro, enemies_1, enemies_3), 5.2.
1. tests/rogue_book_cards_kuro.test.mjs line ~119: replace the id-from-name assertion with t.ok(/^kuro_[a-z0-9_]+$/.test(c.id), ...)
   inside the loop, and after the loop t.deep(cards.map((c) => c.id).sort(), KURO_IDS, 'the 37 Kuro ids are frozen: saves store
   them'), where KURO_IDS is a literal sorted array of today's 37 ids (print them once with the suite's loader to copy them). Rename the
   test title to say the ids are frozen. Keep every other name rule (unique, 1 to 3 words, capital, no hero prefix, no dash).
2. tests/rogue_book_enemies_1.test.mjs ~94: compare e.title with the roster's title (DATA.rosterById[r.id].title or r.title) instead
   of the literal 'The Nine-Tail Ink Fox'. Keep the 'Kuzunoha' name check.
3. tests/rogue_book_enemies_3.test.mjs ~158-159: compare the boss title and name with DATA.rosterById.boss_editor.title and .name
   instead of the literals. Leave the shared move literal 'Rub Through' (~200-201) for P2, and leave the test-local fixture at 586-594.
4. tests/rogue_book_screen_combat.test.mjs line 366: replace .indexOf('Nine-Tail') with .indexOf(<that boot's DATA>.enemies.boss_kuzunoha.title)
   (the boot variable there is g3: use g3.DATA or however that suite reaches DATA; read a few lines above). Touch nothing else in it.
Run: node tests/rogue_book_cards_kuro.test.mjs; node tests/rogue_book_enemies_1.test.mjs; node tests/rogue_book_enemies_3.test.mjs;
node tests/rogue_book_screen_combat.test.mjs (50 s, in the background).
```

Prompt 1C:
```
Phase P1, agent 1C. Plan sections 5.9 (last paragraph) and 8.2 row screen_map.
0. Make the hard-coded copies of tile names read DATA, with output IDENTICAL to today (no visible change): js/screen_map.js line 1340,
   the REASON_TEXT entry void: 'The Unwritten Void cannot be painted.' -> 'The ' + DATA.tiles.block.name + ' cannot be painted.' (if
   REASON_TEXT is a static object literal built before DATA is ready, turn that one entry into a getter or build the string where it is
   used); line 2195, the legend heading 'The Unwritten Void' -> 'The ' + DATA.tiles.block.name; js/screen_node.js lines 1925 and 2046
   ('The Inkstone Forge' -> 'The ' + DATA.tiles.forge.name, inside the longer sentence too). screen_node.js 1911 is a comment: leave it. Touch nothing else in those two files. (P3 later changes the
   surrounding copy; P2 renames the tiles, and these lines then follow by themselves.)
tests/rogue_book_screen_map.test.mjs: make the assertions that name DATA-owned words read them from DATA (escape them for RegExp with
this helper, added once near the top of the suite, because the suite and rogue_book_lib.mjs have none (the lib's escText and escAttr
are HTML escapes):
   const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
164-165 and 1450: /Long Stroke/ -> new RegExp(DATA.brushes.stroke.name), /Fan Brush/ -> new RegExp(DATA.brushes.fan.name);
302: /Chapter Boss, glimpsed/ -> new RegExp(esc(DATA.tiles.boss.name) + ', (glimpsed|seen|heard)');
292, 295 and the Unwritten Void part of 1442: new RegExp(esc(DATA.tiles.block.name)) (the toast and legend already contain the tile
name today). Do not change any other assertion (the copy rows change in P3). Use the DATA of the booted game in each test.
Run: node tests/rogue_book_screen_map.test.mjs (110 s) and node tests/rogue_book_screen_node.test.mjs (93 s), in the background.
```

Lead after the agents: review the diff (`git diff --stat`, then read it), run `node tests/rogue_book_all.mjs`, set the `Status:` line,
commit, ship (9.0.3).
Acceptance: all suites green; `rogue_book/ECHO_PLAN.md` is in the merged commit; `grep -n "Turn the page\|begin the tale\|Raise the Ink Trial" tests/rogue_book_player.mjs` shows them
only as fallbacks; no visible text changed (`git diff -- rogue_book/js | grep "^[-+]" | grep -v "data-act\|dataset\|tip:\|DATA.tiles"` is
empty apart from the diff headers and blank lines). Screenshots: none needed.

### P2: data names and rules text

Goal: every DATA name and generated rules sentence speaks Echo (section 5.1 to 5.7, Appendix A enemy patches). Depends: P1.

| Agent | Owns (edit) | Source |
|---|---|---|
| 2A data core | `js/data.js`, `rogue_book/CONTENT_SPEC.md` (section 4.1 tables and the boss titles line ONLY), `js/data_text.js`, `tests/rogue_book_text.test.mjs` | 5.1, 5.2, 5.3 |
| 2B cards | `js/data_cards_kuro.js`, `js/data_cards_shared.js`, `tests/rogue_book_cards_kuro.test.mjs` | 5.4, 5.5 |
| 2C treasures | `js/data_relics.js`, `js/data_gems.js`, `tests/rogue_book_treasure.test.mjs` | 5.6, 8.2 treasure row |
| 2D enemies | `js/data_enemies_1.js`, `js/data_enemies_3.js`, `tests/rogue_book_enemies_3.test.mjs` | Appendix A "Validated enemy patches", 5.2 names |
| 2E logic copy | `js/run.js`, `js/meta.js`, `tests/rogue_book_run.test.mjs`, `tests/rogue_book_meta.test.mjs`, `tests/rogue_book_screen_menu.test.mjs` (line 122 only), `tests/rogue_book_game.test.mjs` (line 214 only) | 5.7 |

Prompt 2A:
```
Phase P2, agent 2A (data core). Plan sections 5.1, 5.2, 5.3, 8.2 (text row).
1. js/data.js: apply every row of 5.1 (statuses.sumi, keywords ink/brush/down, the six brushes, tiles, heroes kuro and suzu) and every
   ROSTER_SRC row of 5.2 (names, roles, the two boss titles). Change nothing else (no LISTS, ECONOMY, validator messages).
2. rogue_book/CONTENT_SPEC.md section 4.1: make the roster tables equal the new ROSTER_SRC rows exactly (names and roles), and the boss
   titles line. Touch nothing else in CONTENT_SPEC (P9 owns the rest).
3. js/data_text.js: apply the table of 5.3 (onPaint and onChapterStart trigger phrases, limitPhrase 'verse', KW('Echo', 'ink') in
   fragsOf and runFrags, addBrush "learn a random Song" / "learn <name>", paint "wake N hexes for free"), and the comment-only "Sumi"
   mentions. Keep pluralOf /Kodama$/.
4. tests/rogue_book_text.test.mjs: update every expected sentence that contains Ink, Sumi, paint, chapter or Brush to the new generated
   wording (lines listed in 8.2). Derive each new expectation by running the generator, then check it reads as the 5.3 examples.
Run: node tests/rogue_book_text.test.mjs; node tests/rogue_book_data.test.mjs; node tests/rogue_book_content.test.mjs.
Note: data.test compares CONTENT_SPEC 4.1 with the roster, and enemies_N.test compare the enemy files' names with the roster: agent 2D
renames the enemy files at the same time, so expect enemies_* to be red until 2D is done.
```

Prompt 2B:
```
Phase P2, agent 2B (cards). Plan sections 5.4, 5.5, 8.2 (cards_kuro row).
1. js/data_cards_kuro.js: apply every name and flavour of the 5.4 table (ids, numbers, ops, art motif ids unchanged); rewrite the header
   comment (lines 1 to 46) with the new names, "Breath" for Sumi and the archetypes DIRGE, BREATH, ARRANGER.
2. js/data_cards_shared.js: apply the 5.5 table (names Wrong Note, Silence, Muted and the flavours) and header line 8.
3. tests/rogue_book_cards_kuro.test.mjs line ~793: /sumi/ -> new RegExp(DATA.statuses.sumi.name, 'i') (the DATA of that test's boot).
Run: node tests/rogue_book_cards_kuro.test.mjs; node tests/rogue_book_content.test.mjs (names unique across all cards, relics, gems,
enemies; flavour rules); node tests/rogue_book_cards_suzu.test.mjs; node tests/rogue_book_cards_raiga.test.mjs.
```

Prompt 2C:
```
Phase P2, agent 2C (treasures). Plan sections 5.6, 8.2 (treasure row).
1. js/data_relics.js: apply the relic table of 5.6 (names and texts; keep Brass Lantern, Fox Mask, Bounty Scroll, Oil-Paper Umbrella,
   Paper Crane) and the header comment wording (lines 25 to 28, 41 to 46).
2. js/data_gems.js: inkwell_amber name Ringing Amber; heartflame_topaz text with Breath; header lines 21 and 29.
3. tests/rogue_book_treasure.test.mjs: the OPWORD, MODWORD and TRIG regex maps (lines ~216 to 229) and the pins at ~309 and ~442 as
   listed in 8.2.
Run: node tests/rogue_book_treasure.test.mjs; node tests/rogue_book_content.test.mjs.
```

Prompt 2D:
```
Phase P2, agent 2D (enemies). Plan Appendix A "Validated enemy patches" (boss_kuzunoha, paper_kodama, boss_editor, redaction_knight,
void_scribe, blank_soldier, eraser_wraith, paper_golem, margin_imp, censor_golem, black_bar_inquisitor, blank_page, typo_sprite) and
section 5.2 for the names.
1. js/data_enemies_1.js and js/data_enemies_3.js: apply exactly those field patches (name, title, move names, says, phase says, bestiary
   lore). Move ids, fx, AI and numbers never change. The Conductor's 'clean' move is named Tacet. Update the header comments that list
   the old names (data_enemies_3.js lines 1 to 58, data_enemies_1.js line 1 and the role notes).
2. tests/rogue_book_enemies_3.test.mjs ~200-201: the only cross-enemy shared move name literal 'Rub Through' -> 'Smother'. If lines
   ~588-593 compare a literal status card name ('Blot', 'Redacted'), read DATA.cards.status_blot.name / status_redacted.name instead.
Limits (the suites enforce them): ch1 move names 3 to 24 chars, says 3 to 70; ch3 move names 3 to 28 chars and at most 5 words,
says 3 to 64, phase says 8 to 90, lore 60 to 260 chars and 1 to 2 sentences.
Run: node tests/rogue_book_enemies_1.test.mjs; node tests/rogue_book_enemies_3.test.mjs; node tests/rogue_book_enemies_2.test.mjs.
```

Prompt 2E:
```
Phase P2, agent 2E (logic copy). Plan section 5.7.
1. js/run.js and js/meta.js: apply every row of 5.7 (string literals only; reason codes like reason: 'ink' stay). Update the meta.js
   header comment line 31.
2. Tests: tests/rogue_book_run.test.mjs 655 and 1294 (/Ink/ -> /Echo/), 1337 ('Verse 3 only'); tests/rogue_book_meta.test.mjs 332-333
   ('Verse 2, Echo 5, Hanae and Kuro', 'Verse 1, Echo 1, Raiga and Suzu'); tests/rogue_book_screen_menu.test.mjs 122 (/Verse 1/) and
   tests/rogue_book_game.test.mjs 214 (/Verse 1/). Touch no other line of those two screen suites.
3. Run the grep of 5.7 and report every remaining hit.
Run: node tests/rogue_book_run.test.mjs; node tests/rogue_book_meta.test.mjs.
```

Lead after the agents: `node tests/rogue_book_all.mjs`; any red screen suite that asserts a generated or DATA string (for example a
relic text shown on a node page) is fixed by making that assertion read DATA (screen suites are otherwise P3's); `node
tests/rogue_book_all.mjs --strict`; determinism gate (must be IDENTICAL); commit; ship.
Acceptance: the 5.7 grep is clean; a scan of DATA display fields finds none of `Ink`, `Sumi`, `Brush`, `paint`, `Inkweaver`, `Unwritten`,
`Bookmark`, `Editor` except in `data_events.js` and `data_meta.js` (P4) (`node -e` over the booted DATA, or the Appendix A guard regex);
all suites green. Screenshots: hero select (Kuro's title and Breath), one fight with Kuro (`--js "GAME.debug.open('combat',{heroes:['hanae','kuro'],enemies:['kappa']})"`,
`opts.heroes` is supported, main.js about 320), the map legend Songs tab.

### P3: UI copy, tutorial and title strings

Goal: every presentation string per Appendix B, with the test edits of Appendix C. Depends: P2 (screen copy uses the new DATA names).

| Agent | Owns (edit) | Appendix B sections | Tests it owns |
|---|---|---|---|
| 3A map | `js/screen_map.js`, `css/map.css` (copy only) | 3.5 | `tests/rogue_book_screen_map.test.mjs` |
| 3B menus | `js/screen_menu.js`, `css/menu.css` (the `.ts-big .mn-begin` letter-spacing `.04em` -> `.02em` and its comment) | 3.6 | `tests/rogue_book_screen_menu.test.mjs` |
| 3C node pages | `js/screen_node.js`, `css/node.css` (copy only) | 3.7 | `tests/rogue_book_screen_node.test.mjs` |
| 3D endings and hints | `js/screen_end.js`, `js/tutorial.js`, `css/end.css` (copy only) | 3.9, 3.10 | `tests/rogue_book_screen_end.test.mjs` |
| 3E shell | `js/ui.js`, `js/main.js`, `js/scene.js` (2 demo lines), `js/screen_combat.js` (the reveal tag), `rogue_book/index.html` (title, meta description, watchdog text, boot `<b>`, noscript: TEXT ONLY), `rogue_book/gallery.html` (title, nav text) | 3.1, 3.2, 3.3, 3.4, 3.8, 3.11 | `tests/rogue_book_ui.test.mjs`, `tests/rogue_book_lib.test.mjs` (205) |

Prompt (same for 3A to 3E, fill in the agent's row):
```
Phase P3, agent <3A..3E>. You own: <files>. Plan sections 3 (glossary), 5.9, Appendix B sections <list>, Appendix C (test edits for
your test file, and the copy budgets).
1. Apply every row of your Appendix B sections: the "Proposed" column is the new text (rows that say keep stay). Where Appendix B says
   to read a DATA name (DATA.tiles.block.name, 'The ' + DATA.tiles.forge.name), do that instead of hard-coding the word. Keep every
   class, id, data-tut, sfx id, bus event and transition kind exactly.
2. Apply the Appendix C rows for your test file in the same edit session (rows already converted in P1 to read DATA need nothing).
3. Respect the budgets in Appendix C "Copy budgets": map info chip action line 66/52/40 characters, tutorial hint title <= 30 and text 40
   to 230, the Begin button width model (Begin the Journey needs letter-spacing .02em), slim title plaques 84 px (the plaque says Hall).
4. Grep your files for the retired words of plan 3.2 when done:
   grep -nE "['\`\"][^'\`\"]*\b(Ink|Inkstones?|Inkwoven|INKWOVEN|Brush|brushes|paint|Paint|painted|Daily Tale|Ink Trial|Tale|tale|the Book|the book|Blank|Library|Chapter|chapter)\b" <your js files>
   Every remaining hit must be an internal id, a comment, or an allowlisted survivor (plan 3.2); list them in your report.
Run: your test file(s) (screen suites are slow: run them in the background and wait).
```

Agent-specific notes to add to the prompt:
- 3A: the melody hook location (`stepReveals`) is P6's: do not add audio. The legend tab names must equal `['The land', 'Songs',
  'Controls', 'Words']` (screen_map test 1435).
- 3B: the How to play margin notes are picked by the tip regexes near lines 1932 and 1952; leave them as P1 made them (P4 tightens
  them). The story tab is `Ballads` ("2 of 12 ballads heard", `Stray Ballads`, contents heading `Setlist`); STORY_GROUPS become
  `The Verses`, `The Endings`, `The Voices`. The hero select bio heading (line 702) `'Her story'` becomes `'Her voice'` (the existing
  `.replace('Her', ...)` gives `His voice`). The tip box label (line 2000) `Margin note` becomes `Liner note`, together with
  screen_menu.test 1072 (Appendix C). The title plaque says `Hall`; the library banner `The Hall of Echoes`. The audio gate "Tap to
  begin" stays (test 76). Anchors: `grep -n '^#### 3.6' rogue_book/ECHO_PLAN.md`, `grep -n 'rogue_book_screen_menu.test.mjs:' rogue_book/ECHO_PLAN.md`.
- 3C: Appendix B 3.7 includes line 1182 (the boss relic pick hint). The forge rows keep the DATA read P1 put there. Anchor:
  `grep -n '^#### 3.7' rogue_book/ECHO_PLAN.md`.
- 3D: CURTAIN lines use the Appendix B text (Kuro 130 characters, Suzu 121); story kickers per glossary (INTRO, VERSE ONE, OUTRO,
  INTERLUDE, A VOICE OF THE SONG, A BALLAD; seal REST); share text `'ECHOWAKE: ' + (win ? 'the Hush let go' : 'a rest in Verse ' + n)`;
  share card heading `'ECHOWAKE'`; download name `'echowake-' + seed + '.png'` (fallback `'journey'`); hero unlock `' joins the band'`.
  Anchors: `grep -n '^#### 3.9\|^#### 3.10' rogue_book/ECHO_PLAN.md`.
- 3E: `ui.js` STAT_TIP rows (5.9), the error modal `Something broke the rhythm`, the transition tip header (ui.js 743, today
  `'- A HINT FROM THE MARGINS -'`) becomes exactly `'A NOTE FROM THE ROAD'` (no hyphen framing: decided, no fallback), the card back
  word `ECHOWAKE`, the rotate panel line;
  main.js toasts (`The temple bell rings (+N Echo)`, `You learn a Song: X`, `+N Chimes`), abandon confirm, placeholder screens and the
  `?gallery` labels; `index.html` `<title>ECHOWAKE: a rogue ballad</title>`, `gallery.html`'s title in the same form, and
  `tests/rogue_book_lib.test.mjs:205` together; the favicon and boot drip are P8 (do not touch them now). Anchors:
  `grep -n '^#### 3.1 \|^#### 3.2 \|^#### 3.3\|^#### 3.4\|^#### 3.8\|^#### 3.11' rogue_book/ECHO_PLAN.md`.
- 3A anchors: `grep -n '^#### 3.5' rogue_book/ECHO_PLAN.md` and `grep -n 'rogue_book_screen_map.test.mjs:' rogue_book/ECHO_PLAN.md`.
- Every agent: lowercase "song" never appears in your new UI strings (rule 0.8); Appendix B already follows it.

Lead after the agents: `node tests/rogue_book_all.mjs` (all screens), fix couplings, `--strict`, set the `Status:` line, commit, ship.
Acceptance: the retired-word grep over every presentation js file is clean except internal ids, comments and survivors; Appendix C rows
all applied; `grep -nE "['\`\"][^'\`\"]*\bsong\b" rogue_book/js/screen_*.js rogue_book/js/ui.js rogue_book/js/main.js rogue_book/js/tutorial.js`
finds nothing. Screenshots at 1280x720 AND 844x390 (look at each): title, hero select (Larger text too: `UI.setSetting('textScale', 1.3)`),
map with the info chip on a silent hex, map legend (all four tabs), Song mode bar, a reward page, the shop, an event, a camp, the forge,
the Hall of Echoes (every tab), How to play pages 1, 2 and 7, settings, pause, the story screen, chapter clear, game over, victory, the
rotate panel at 390x844.

### P4: the story, fables, achievements, trials and tips

Goal: Appendix A applied to `js/data_meta.js` and `js/data_events.js` with their tests. Depends: P2 (names), P3 (UI).

| Agent | Owns (edit) |
|---|---|
| 4A meta | `js/data_meta.js` (spine comment, achievements, trials, tips, lore, barks), `tests/rogue_book_narrative.test.mjs`, `js/screen_menu.js` (ONLY the two How to play `tip:` regexes near lines 1932 and 1952) |
| 4B fables | `js/data_events.js` (titles, texts, labels, costs, outcomes per Appendix A; header comment), `tests/rogue_book_content.test.mjs` (720, 854, 862) |

Prompt 4A:
```
Phase P4, agent 4A. Plan Appendix A: "The spine", "Lore: every page, rewritten", "Barks", "Achievements, Tempo Trials and tips",
"Test changes this lens forces"; plan 4.1 to 4.6. Anchors: grep -n '^#### 3.2 The spine\|^### 8. Lore\|^##### Barks\|^### 10. Achievements\|^### 13. Test changes' rogue_book/ECHO_PLAN.md.
1. js/data_meta.js: replace the THE SPINE header comment with the Appendix A block; apply every lore title and text (ids unchanged; each
   text starts with a letter), every bark change (Kuro's 30 lines in the listed order; the three Hanae and Suzu swaps; Raiga
   unchanged), every achievement, trial and tip row. Also update the header comment lines 6 to 30 wording (Chimes, Tempo Trials, the Red
   Baton).
2. tests/rogue_book_narrative.test.mjs: 195 (/echo/i), 452 (' less Echo'), 454 ('bells give ' + n + ' less Echo'), 476 (tip words: 'ink'
   -> 'echo', 'brush' -> 'song'), the spine test 494 to 520 replaced by the Appendix A block, 542 Kuro bark regex Block B ("Kuro is
   musical"), and add the old-words guard over prose fields (Appendix A, the OLD regex), scanning only prose fields, never ids or ops.
   Cosmetic test names 179, 285, 384, 400, 420 may say the Hush and Tempo Trials.
3. js/screen_menu.js: tighten the How to play tip regexes: page 'map' tip: /^Waking a hex costs Echo/ (it must match tip 0); page
   'places' tip: /A fable is a choice/ stays. Touch nothing else in that file.
Run: node tests/rogue_book_narrative.test.mjs; node tests/rogue_book_content.test.mjs; node tests/rogue_book_screen_menu.test.mjs (test
1071 needs seven margin notes).
```

Prompt 4B:
```
Phase P4, agent 4B. Plan Appendix A "Exact patches (every LIGHT and REWRITE fable)" and "Hard constraints". Anchors:
grep -n '^#### 9.2 Exact patches\|^### 2. Hard constraints' rogue_book/ECHO_PLAN.md.
1. js/data_events.js: apply every field patch exactly (title, text, Ln labels, Cn costs, On.m outcome texts). Ids, ops, weights, req,
   when, once, w and art.scene never change; the five 'paper' scene events keep scene: 'paper'. Update the header comment (lines 1 to
   34: Fables, Echo, Songs, the Hush).
2. tests/rogue_book_content.test.mjs: 720 becomes Appendix A "Block C" (the Echo cost is charged in every outcome), 854 startInk:
   /less Echo/, wellInk: /less Echo/, 862 message "trial 10 never takes Echo to zero".
Run: node tests/rogue_book_content.test.mjs; node tests/rogue_book_narrative.test.mjs (4A edits it; both must end green together).
```

Lead after the agents: `node tests/rogue_book_all.mjs`, `--strict`, `RB_GAME_ONLY=pause,save node tests/rogue_book_game.test.mjs` then
the full game suite (it plays every fable), commit, ship. Acceptance: the Appendix A old-words guard is green; the story screen shows
the new pages with a drop cap; How to play has seven liner notes. Screenshots: story screen for `intro`, `ch3_intro`, `victory`,
`defeat`, `hero_kuro`; three fables (`kuro_footnote`, `missing_page`, `waiting_room`); the Hall of Echoes Achievements and Ballads tabs.

### P5: the hushed map, icons and the Echo meter

Goal: Appendix D sections 1 (helpers), 4 (art_map, including MAP-27, the motion of woken hexes), 6 (art_icons) and X-01 (CSS orbs and
the meter), with the material swap of 6.1 rule 7. Depends: P4.

Lead first: apply the `js/art.js` helpers (6.1 item 6: `tk.note`, `tk.soundRings`, palette keys, toolkit sheet cell, placeholder logo
text `'ECHOWAKE'`, `'SHAA!'` -> `'WAAN!'` at 1742) yourself or with agent 5A, run `node tests/rogue_book_art_core.test.mjs`, THEN
launch 5B and 5C.

| Agent | Owns (edit) | Appendix D rows |
|---|---|---|
| 5A map art | `js/art.js` (helpers, if the lead did not), `js/art_map.js` | 1.4, MAP-01 to MAP-27 |
| 5B icons | `js/art_icons.js` | IC-01 to IC-20 (IC-05 Chimes, IC-07 Breath curl, IC-13 Songbird as patched) |
| 5C CSS orbs and meter | `css/base.css` (`--drop` split into `--orb` and `--echo`, `.c-cost`, `.back-drop` keep using the orb), `css/map.css` (`.mp-drop`, `.mp-fly-in` use `--echo`; the meter becomes an equalizer row; `.mp-intro-brush` and `.mp-title::after` optional waveform stroke), `css/combat.css` (`.cm-orb` uses `--orb`), `css/node.css` (`.dk-hint-mark` uses `--orb`) | X-01, Appendix B section 4 V1 to V3 |

Prompt (5A, 5B, 5C, fill in the row):
```
Phase P5, agent <5A..5C>. You own: <files>. Plan sections 6.1, 6.2, 6.3, 6.4 and Appendix D rows <list>.
Redraw only the pixels; keep every function name, signature, id, sheet name and palette key; keep frameMetrics and the clearRect window
exactly (5A); badge glyphs on Song icons use strokes, arc and ellipse only, never closePath (5B); the new CSS SVG tokens keep the 60 x 68
viewBox so no size changes (5C). Render your sheets with tools/rogue_book/shot.mjs (commands in 6.4), LOOK at every PNG with the Read
tool, compare with the brief and iterate at least three times. Do not write PNGs into the repo.
Run: 5A node tests/rogue_book_art_map.test.mjs and art_core; 5B node tests/rogue_book_art_icons.test.mjs; 5C node
tests/rogue_book_screen_map.test.mjs (meter classes) and tests/rogue_book_screen_combat.test.mjs (orb), both in the background.
```

Lead: `node tests/rogue_book_all.mjs`, commit, ship. Acceptance: 6.4 items 1 and 2 for the map; the meter reads as Echo pings or
equalizer bars, cost and energy orbs are round orbs (no drop). Screenshots: map sheets (`map_page map_kinds map_frame map_bloom map_paper
map_doodles map_token`), icon sheets, the live map at 1280x720 and 844x390 with 30 percent woken, a reveal mid-bloom (step the debug
clock: `GAME.debug.tick`), the same map twice 1 s apart (woken hexes near the party move, fog does not), combat hand (cost orbs), the
energy orb.

### P6: the melodic reveal and the Hush

Goal: Appendix E (all of it is this phase; inside Appendix E the audio sub-steps are named E1, E2, E3, never P-numbers). Depends: P5
(the bloom accepts `opts.note`). Runs as 2 parallel agents because every screen call is guarded with `isFn`.

Required scope (no longer optional): the formant `vox` voice and its use in the Songs and walk notes (Appendix E 7.1.10, 7.1.3),
`CHORD_ROOTS` (7.1.3), the calibrated wake curve with the louder hush floor and the first-wake lift (7.2.1, 7.2.4), the thinned walk
notes (7.1.2), the per-verse `single` voice (7.1.3), the rising note marks (7.5), the re-voiced `page_turn` hyoshigi claps (end of
Appendix E).

| Agent | Owns (edit) | Appendix E parts |
|---|---|---|
| 6A engine | `js/audio.js`, `tests/rogue_book_audio.test.mjs`, `tools/rogue_book/bot.mjs` and `tools/rogue_book/bot/driver.mjs` (only the opt-in `--awake-report` flag) | 7.1.1 to 7.1.8, 7.1.10, 7.2 (with the 7.2.4 calibration), 7.3, 7.6, the re-voiced recipes (end of Appendix E), tests A0 to A15, the audio.js header contract |
| 6B wiring | `js/screen_map.js` (only the audio anchors of 7.1.9, the walk thinning, the note marks of 7.5 and `paintProgress`), `js/ui.js` (applySettings bridge, header line 12), `tests/rogue_book_screen_map.test.mjs` (M0 to M6), `tests/rogue_book_ui.test.mjs` (stub, options bridge), `tests/rogue_book_hygiene.test.mjs` (H1) | 7.1.9, 7.5, ui and hygiene parts of 7.7 |

Prompt 6A:
```
Phase P6, agent 6A (audio engine). Plan section 7 and Appendix E (anchor: grep -n '^## Appendix E' rogue_book/ECHO_PLAN.md, then read
it in chunks with offset and limit), all of it except the screen_map, ui and hygiene parts.
1. Calibrate first (Appendix E 7.2.4): add the opt-in --awake-report flag to tools/rogue_book/bot.mjs and bot/driver.mjs, run it, and
   compute WAKE_SPAN and TH_WAKE from the measured median. Then run the determinism gate (plan 8.7 gate 1) to prove the flag changed
   nothing when it is off.
2. Implement in js/audio.js, at the anchors of plan 7.2: the Echo constants (with the calibrated WAKE_SPAN), TH_WAKE (calibrated), the
   map track fields (drive, thresholds, hush with lo 900/750/600 and floor 0.85/0.8/0.75, layer per role: roles, order and gains
   unchanged, so the MIX table stays valid), compose fields, the pure ECHO section (SONGS with the vox entries and per-verse single
   voice, CHORD_ROOTS, snapRoot, W_STEP, contour, echoKey, degToMidi, hexNote, songDegrees, wakeDegree), the vox voice vVox and its
   table entries (7.1.10; never used in a score), the echo send in buildGraph, the S state fields, buildDeck low-pass, drive-aware
   applyLayers and applyHush, the first-wake lift, startMusic (drive !== 'intensity' resets intensity; echo delay time), intensity only
   re-targets intensity decks, wakeLevel, awake, options, wake, wakeExtras, the tune option in rawRecipe and sfx, render and debug
   fields, the return object (also export HUSH = {from, span, th} for the tests), the three mood strings, the line 895 comment, and the
   seven re-voiced SFX_DEFS bodies under their EXISTING keys. Update the audio.js header contract (lines 1 to 63) with every new
   function. audio.js references only U and DATA (never MAP, RUN, META, UI); nothing may throw; ES2020.
3. Tests A0 to A14 in tests/rogue_book_audio.test.mjs (A2 and A7 are the ids-kept versions in Appendix E; A13 pins the calibrated
   numbers and names the measured median in a comment). Then run the browser loudness check L1 (Appendix E 7.7) and tune the `vol`
   of the re-voiced recipes until it passes; it replaces a by-ear pass.
Run: node tests/rogue_book_audio.test.mjs; node tests/rogue_book_hygiene.test.mjs. Report the measured median and the chosen numbers.
```

Prompt 6B:
```
Phase P6, agent 6B (audio wiring). Plan section 7.2 (screen_map and ui rows) and Appendix E 7.1.2, 7.1.9, 7.5, 7.7 (screen_map M0 to
M6, ui suite, hygiene H1). Anchor: grep -n '^##### 7.1.9\|^#### 7.5\|^#### 7.7' rogue_book/ECHO_PLAN.md.
1. js/screen_map.js: the wakeNote helper after const snd; startReveals gets song and anchor; stepReveals calls wakeNote per cell (last on
   the final cell) instead of snd('paint'); applyBrushNow plays snd('brush_use') then startReveals(s, tiles, origin, 0.07, <song id>,
   <anchor>) (drop the extra snd('paint')); arrive adds the thinned soft wakeNote after the position guard (Appendix E 7.1.2: the first
   6 steps of a walk, then every second step; skip a hex that sounded in the last 4 s); paintProgress calls AUDIO.awake(p.frac). Every
   AUDIO call guarded (typeof AUDIO !== 'undefined' && AUDIO && isFn(AUDIO.x), the one-argument isFn of screen_map.js) and wrapped in
   safe(). Pass the note degree to the bloom: where the screen draws ART.map.paintBloom for a cell, add opts.note = ((deg % 7) + 7) % 7
   with deg from AUDIO.wakeDegree (computed once per reveal record, guarded, works with sound off). The rising note marks of Appendix E
   7.5 (required): every wakeNote call pushes a mark, even when AUDIO.wake returns false (muted) or AUDIO is missing (deg 0).
   Header comment line 69 lists AUDIO.wake, AUDIO.awake and the note marks.
2. js/ui.js applySettings: ui.js's local helper is the two-argument isFn(au, 'name') (see the setVolume line near 194). Right after
   the setVolume line add exactly:
   if (isFn(au, 'options')) safe(() => au.options({ calm: !!o.reduceMotion, lite: o.quality === 'low' }));
   Header line 12 lists AUDIO.options.
3. Tests: screen_map M0 to M6 (realtime boots for per-cell notes: startReveals returns early headless), ui suite stub and bridge,
   hygiene H1 (three literalUses lines).
Run: node tests/rogue_book_screen_map.test.mjs (background), node tests/rogue_book_ui.test.mjs, node tests/rogue_book_hygiene.test.mjs.
```

Lead: `node tests/rogue_book_all.mjs`; the determinism gate (IDENTICAL: the bot flag is opt-in); set the `Status:` line; commit (the
PR body records the measured median awake share and the chosen WAKE_SPAN and TH_WAKE); ship. Acceptance (objective, no listening
needed): map tracks report `layers: 4`, `drive: 'awake'` and a `hush` with lo 900, 750, 600 and floor 0.85, 0.8, 0.75; other tracks
`drive` `'intensity'` (8) or `null`; MIX table unchanged; A12 (no chord holds 1, 6 or 11 semitones), A13 (calibration pinned), A14 (vox
renders, starts at zero gain, no score uses it), the browser loudness check L1 (offline peaks: `paint` and `ink_gain` below `card_pick`, `well` within 3 dB of
`relic_get`) green; a chain plays a phrase ending on a held note (M3); each Song has its gesture (M4); walking hums, thinned (M2, not
with reduced motion); note marks appear one per wake call, also with Effects at 0 (M6); Effects volume 0 builds no node (A5); quality
low plays single arp tones (A6); `npm run check` green. Optional extras of 7.5 (`hush` sfx E2, `flute_call` E3) only if time remains
(separate commit, same PR). A by-ear listen is an owner item (section 11), not part of done.

### P7a: Kuro's flute, card motifs, Verse I and combat fx

Goal: Appendix D sections 7, 8, 9.3, 10 and X-10, with the material swap of 6.1 rule 7. Depends: P6 (and P5's helpers). P7 is split so
one lead never holds five large art agents in one context: P7a ships first, P7b (Verse III alone) second.

| Agent | Owns (edit) | Appendix D rows |
|---|---|---|
| 7A Kuro | `js/art_heroes.js` | KU-01 to KU-12 (KU-05: a bronze flute charm, never a bell) |
| 7B motifs | `js/art_cards.js` | section 8 table, CA-01 to CA-07 |
| 7D Verse I and fx | `js/art_enemies_1.js`, `js/art_fx.js` | 9.3, FX-01 to FX-05 |
| 7E combat scene | `js/scene.js` | X-10 (`'WAAN!'`, `P_INK` summon colour, death releases bright note motes, fallback `inkSplash`/`brushDrag` stand-ins) |

Prompt (fill in the row):
```
Phase P7a, agent <7A|7B|7D|7E>. You own: <file>. Plan sections 4.3 to 4.5 (looks), 6.1 to 6.4 and Appendix D rows <list>. Anchors:
grep -n '^### 7. `js/art_heroes.js`\|^### 8. `js/art_cards.js`\|^#### 9.3\|^### 10. `js/art_fx.js`\|^| X-10' rogue_book/ECHO_PLAN.md.
Keep every rig, anchor name, id, size class, pose, phase and API; keep Kuro's tip anchor at W[1] - 206 (7A). Draw with the art.js
helpers tk.note and tk.soundRings where useful. Render your sheets (6.4), LOOK at them, iterate at least three times.
Run: 7A node tests/rogue_book_art_core.test.mjs; 7B art_cards and art_icons; 7D art_enemies_1 and art_fx; 7E
node tests/rogue_book_scene.test.mjs (41 s) and screen_combat (background).
```

Lead: `node tests/rogue_book_all.mjs`, set the `Status:` line, commit, ship. Acceptance: 6.4 item 4. Screenshots: heroes and portraits
sheets, motifs, boss1, fx; a live fight with Kuro casting (`--js "GAME.debug.open('combat',{heroes:['hanae','kuro'],enemies:['kappa']})"`
at 1280x720).

### P7b: Verse III and the Conductor

Goal: Appendix D sections 9.1 and 9.2, the `'SHH'` texts, the sheet labels, with the material swap of 6.1 rule 7 and the faint
yamabiko inside phase 2 (4.5). Depends: P7a. One agent (or the lead alone).

| Agent | Owns (edit) | Appendix D rows |
|---|---|---|
| 7C Verse III | `js/art_enemies_3.js` | 9.1, 9.2, the `'SHH'` texts, sheet labels |

Prompt:
```
Phase P7b, agent 7C. You own: js/art_enemies_3.js. Plan sections 4.1 (the causal chain), 4.5, 6.1 to 6.4 and Appendix D 9.1 and 9.2
(anchor: grep -n '^#### 9.1\|^#### 9.2' rogue_book/ECHO_PLAN.md). Keep every rig, anchor name, id, size class, pose, phase and API.
Apply 6.1 rule 7 everywhere (ash and frost flecks, futon quilting, cloth gags and cords; no TV static, foam or black bars). Phase 2 is
the Hush pouring out of the Conductor, with the faint silhouette of a yamabiko (a shaggy mountain imp) inside the grey face. Render
enemies3 and boss3 (all three phases), LOOK, iterate at least three times.
Run: node tests/rogue_book_art_enemies_3.test.mjs.
```

Lead: `node tests/rogue_book_all.mjs`, set the `Status:` line, commit, ship. Acceptance: 6.4 item 5. Screenshots: enemies3, boss3 (all
three phases), and the live boss fight in each phase: open it with
`--js "GAME.debug.open('combat',{chapter:3,enemies:['boss_editor']})"`, then in later shots force each phase with
`GAME.debug.combat().setHp(...)` on the boss (read the `setHp` signature in the main.js header, line 33, and DESIGN 5.10), with
`--frames 120` between the call and the shot.

### P8: title bell, logo, scenes, event stage, story plaque, transitions

Goal: Appendix D section 3, 5 and X-02 to X-09, X-11; Appendix B section 4 (V4 to V15); the title clearance test; the title bell that
is free after the player's first win; the defeat bell whole and re-wrapped. Depends: P7b.

| Agent | Owns (edit) | Rows |
|---|---|---|
| 8A scenes and logo | `js/art_scenes.js` | 3.2 (logo: C, H, A skeletons, pulses), 3.3 (title bell, `titleHush`, notes; `opts.rung` on the title scene: threads gone and a clear ring after the first win, part of the layer cache key), SC-01 to SC-19 (defeat: the bell whole, re-wrapped in threads, striker still; never cracked), plus `ART.scene.info('title').focus = {x0, x1, y0, y1, k}` (8.2) |
| 8B menus | `js/screen_menu.js` (fallback title painting, fallback logo text and drips, library backdrop, How to play diagram `paintBook`; the title `ART.scene.draw(ctx, 'title', ...)` call near line 579 passes `rung: S.won`, with `S.won = META.trialMax() > 0` set once on enter (meta.js 411: true exactly when the profile has a win; guard it with `isFn`; ART never reads META)), `css/menu.css` (How to play byobu, liner-note card, `.mn-emptybook`, `.mn-storypage` per V15, the book comment near line 24), `tests/rogue_book_screen_menu.test.mjs` (1711-1735 rewrite) | X-09, V7 to V9, V13, V15 |
| 8C event stage | `js/screen_node.js` (`paintDesk` dusk street, camp Meditate icon, forge tuning fork), `css/node.css` (kamishibai: `.ev-book`, `::before`, `::after`, `.ev-page.left/right`, `.ev-gutter`, `.ev-ribbon`, `.ev-plate`, `.ev-seal`; the scene plate changes by the stage doors opening and closing, NEVER by a sliding or flipping card, which would bring the page turn back) | X-03, V10, Appendix B 3.7 visual rows |
| 8D shell art | `css/end.css` (story plaque, keep paddings and `--pg-x`), `js/ui.js` (`paintInk` sound-ring wipe, `paintPage` shoji slide), `css/base.css` (`.rot-book` phone with sound arcs, `.back-drop` echo rings on the card back), `rogue_book/index.html` (favicon, `#boot i` pulse ring and keyframes `bootPulse` with the reduce-motion rule kept), `rogue_book/gallery.html` (same favicon) | X-02, X-04 to X-08, V4, V5, V11, V12, V14 |

Prompt (fill in the row):
```
Phase P8, agent <8A..8D>. You own: <files>. Plan sections 2 (D1, D10), 4, 6 and Appendix D rows <list>, Appendix B section 4 <V rows>.
Keep every class name, id, geometry the tests pin (event stage 1136 x 592, story paddings and --pg-x, transition kind ids 'ink' and
'page', the logo animation >= 7 distinct frames, the title layer composite >= 4 cached layers). 8A: the bell must stay inside x 292..988
and below the logo (logoDraw(ctx, 640, 172, 740) occupies about y 115..235); export ART.scene.info('title').focus. 8B: rewrite the
title clearance test as plan 8.2 says, using that focus export (if 8A is not done yet, code against the documented shape). 8D: favicons
stay inline data: URIs in BOTH pages (hygiene); the boot pulse keeps the reduce-motion rule.
Render and LOOK: logo, scene_title, title_anim, scene_victory, scene_defeat, scene_paper, scene_ch3, scene_boss3 (8A); the title at
1280x720, 844x390, 390x844, How to play pages, the Hall (8B); an event (8C); the story screen, a transition mid-way (step the clock),
the rotate panel at 390x844, the card back (8D).
Run: 8A art_scenes; 8B screen_menu (background); 8C screen_node (background); 8D screen_end, ui, hygiene, lib.
```

Lead: `node tests/rogue_book_all.mjs`, determinism gate (IDENTICAL), save compatibility check (8.7 gate 2), set the `Status:` line,
commit, ship. Acceptance: 6.4 items 1 and 3; no book visual left anywhere (V1 to V15 done); the title with a profile that has a win
(`--store` a profile whose `stats.wins` is 1) shows the bell free of threads. Screenshots: every screen list of P3 again, plus the title
animation strip and a transition strip.

### P9: docs, theme-leak guard, cover and site card

Goal: 8.3, 8.4, 8.5, 8.6. Depends: P8 (the cover needs the final title art).

| Agent | Owns (edit) |
|---|---|
| 9A docs | `rogue_book/README.md`, `rogue_book/DESIGN.md`, `rogue_book/ART_BIBLE.md`, `rogue_book/CONTENT_SPEC.md` (all but 4.1) |
| 9B guard | NEW `tests/rogue_book_theme.test.mjs` |
| 9C site and sweep | root `index.html` card, `tools/rogue_book/cover.mjs` comments, optional `Inkwoven --` header comment sweep in `rogue_book/js/*.js` and `rogue_book/css/*.css` (comment lines only), optional `tools/rogue_book/bot/report.mjs` labels |

Prompt 9A:
```
Phase P9, agent 9A (docs). Plan 8.4 (briefs and the pinned phrases), 8.5 (DESIGN 1.1), 4 (world), 6 and 7 (art and audio summaries),
Appendix E "DESIGN.md 5.7 additions" and "ART_BIBLE.md section 9 rewrite brief".
Rewrite the prose of the four docs to the Echo world; keep every backticked id and every pinned phrase of 8.4; add DESIGN section 1.1;
never write the name of the banned random call. Run node tests/rogue_book_data.test.mjs and node tests/rogue_book_hygiene.test.mjs
after EACH doc.
```

Prompt 9B:
```
Phase P9, agent 9B (theme-leak suite). Plan 8.3. Create tests/rogue_book_theme.test.mjs following the pattern of the other suites
(import ./rogue_book_lib.mjs, boot the data and presentation scripts it needs, end with t.done()). Implement checks 1 to 4 (5 optional).
Every allowlist entry is [exact string, reason]. Make it fail loudly with the field path and the offending word. Then run it; for every
hit decide: a real leak (report it to the lead with file and field; do not fix files you do not own) or a legitimate survivor of plan
3.2 (allowlist it with the reason).
Run: node tests/rogue_book_theme.test.mjs; node tests/rogue_book_hygiene.test.mjs (it checks every suite's shape).
```

Prompt 9C:
```
Phase P9, agent 9C (site). Plan 8.6. Update the root index.html card (title, desc, tags; check that 'music' exists in CHIP_DEFS);
update tools/rogue_book/cover.mjs comments; then, if asked by the lead, the optional header comment sweep (first comment line only,
"Inkwoven --" -> "Echowake:") and the bot report labels. Do not run cover.mjs: the lead runs it after merging the art.
Run: node tests/rogue_book_hygiene.test.mjs.
```

Lead: fix the real leaks 9B found (you own nothing else in this phase, so fix them yourself in a separate commit, naming each); set
the `Status:` line;
run `node tools/rogue_book/cover.mjs`, look at `rogue_book/cover.webp`, commit both cover files; `node tests/rogue_book_all.mjs`,
`--strict`; ship. Acceptance: theme-leak suite green and in `npm run check`; data suite green (doc pins); root card shows Echowake with
the new cover on `https://games-71g.pages.dev/` after deploy.

### P10: independent verification

Goal: an independent check by agents that did not build the work, then one fix PR. Depends: P9 merged.

| Agent | Task |
|---|---|
| 10A desktop playthrough | Drive the real game with `tools/rogue_book/shot.mjs --steps` at 1280x720: title, hero select (Kuro and Suzu if unlocked, else Hanae and Kuro), a full verse: wake hexes, sing every Song you get, ring a temple bell, a fight, an elite, a fable, the shop, a camp (Meditate), the forge, the boss; the story pages; game over or verse clear; the Hall of Echoes every tab; settings; How to play every page; pause. Screenshot every screen. Report every leftover old-theme word, book visual, broken layout, clipped text, console error. |
| 10B phone and sweep | The same flow at 844x390 with touch (`--viewports 844x390`) plus the rotate panel at 390x844 and Larger text (1.3) on the title, hero select and map; then the string sweep: `node tests/rogue_book_theme.test.mjs`, the grep of P3 over every `rogue_book/js` file, `grep -rniE "inkwoven|storybook|the blank|inkstone|ink trial|daily tale" rogue_book/*.md rogue_book/*.html index.html`; the determinism gate; the save compatibility check. Report findings. |

Prompt (10A and 10B):
```
Phase P10, agent <10A|10B>. You did not build this re-theme; your job is to find what is wrong. Read plan sections 1 to 4 and 8.7.
<task from the table>. Look at every screenshot with the Read tool. Do not edit any file in the repo. Report a numbered list of
findings: where (screen, viewport, file if known), what is wrong, the expected text or look per the glossary, and severity
(blocker: a leftover old word or book visual, a broken flow, a test gap; polish: anything else).
```

Lead: fix every blocker (one agent per file group if many), re-run the affected suites and `node tests/rogue_book_all.mjs`, run the
determinism gate and the save compatibility check one last time, set the `Status:` line to `Phases merged: all (P1 to P10)`, commit, ship. Report to the owner: what shipped across P1 to P10 (eleven PRs), the decisions used (section 2), the
gates (IDENTICAL determinism, saves load, theme-leak suite green, check green), any finding left as polish, and the play link.

## 10. Risks and mitigations

| # | Risk | Mitigation |
|---|---|---|
| R1 | One renamed button label stalls the 234 s integration suite (`player.mjs` finds buttons by label) | P1 adds `data-act` hooks first; label regexes become fallbacks that accept both wordings |
| R2 | A global search and replace of `paint`, `well`, `ink`, `brush`, `ink_splash` corrupts save data, op ids, motif ids or sfx ids | never search and replace; edit by quoted anchors; 5.11 lists the ids that must stay; the determinism gate and the theme suite's check 4 catch slips |
| R3 | Roster names live in three places (data.js ROSTER_SRC, data_enemies_N.js, CONTENT_SPEC 4.1) | the same P2 PR changes all three (agents 2A and 2D); data.test and enemies tests compare them |
| R4 | The How to play margin notes are picked by regex on tip text: rewriting tips silently drops notes | P1 makes the regex tolerant, P4 tightens it together with the tips; screen_menu test 1071 counts seven notes |
| R5 | Silent guards stop testing after a rename (content:720, narrative:195) | P4 rewrites them (Block C, `/echo/i`); every agent greps its suite's regexes for old words |
| R6 | Story pages must begin with a letter (drop cap; screen_end:171) | Appendix A texts all start with a letter; never open a page with a quote mark |
| R7 | `Begin the Journey` fails the hero select width model at Larger text | `.ts-big .mn-begin { letter-spacing: .02em }` (test allows <= .05); fallback label `Set Out` |
| R8 | Kuro card ids tied to names by a test | P1 replaces it with a frozen id list; ids never change (saves store them) |
| R9 | Title art replacement breaks the clearance test that regex-reads `art_scenes.js` | P8 exports `ART.scene.info('title').focus`; the test reads it |
| R10 | The audio `MIX` table cannot be regenerated in the repo | only `layer`, `drive`, `thresholds`, `hush` and `mood` change on scores; no role added or removed |
| R11 | The hush filter on the music bus would muffle fights | it lives on the map deck (Appendix E); A9 asserts a combat deck has no `lp` |
| R12 | `startMusic` keeps a stale fight intensity on the now-layered map tracks | the reset condition becomes `desc.drive !== 'intensity'` (audio test line 641 keeps passing) |
| R13 | Per-cell wake notes are invisible to headless tests (`startReveals` returns early) | M3 and M4 use realtime boots; M2 and M5 run headless |
| R14 | Re-voiced sfx loudness is estimated (no in-repo loudness tool) | the browser loudness check L1 (Appendix E 7.7) renders each recipe in a real OfflineAudioContext and compares peaks: `paint` and `ink_gain` below `card_pick`, `well` within 3 dB of `relic_get`; a by-ear listen is an owner item (section 11) |
| R15 | Animated fog would break "fog is still" and cost 200 draws per frame | static stays baked into fog sprites |
| R16 | `paintBloom` tests are geometric: an `arc` clip would break the area test | the wavefront clip is a polygon of 28 `lineTo` points; rings are separate `arc` strokes |
| R17 | Song icon tests count `closePath`: badge glyphs could break hex counts | badges use strokes, `arc` and `ellipse` only |
| R18 | `FX.inkSplash` is shared by Kuro's hits, summons, deaths and every map reveal: a busy burst spams a 7-hex Song | `ART.fx.nominal.inkSplash` is a radius in px that SCENE uses for culling (art_fx.js 54), not a budget: it goes 130 -> 150 px; keep the burst's draw-call count no higher than today; reduceMotion and low quality never add calls |
| R19 | Doc rewrites drop phrases the data suite pins | 8.4 lists them; 9A runs data and hygiene tests after each doc |
| R20 | Mixed vocabulary on the live site between P2, P3 and P4 | ship them the same day; each PR is self-consistent and green |
| R21 | Status names are checked for lowercase use in card text (content.test 253-276) | "Breath" only appears capitalised in generated text; hand-written card texts must not use "breath" lowercase |
| R22 | "Echo" is both the currency and the theme; "Song" is the map tool | Echo stays uncountable; a run is a journey, never a song (glossary) |
| R23 | Merge conflicts after squash merges resurrect old strings | resolve keeping HEAD, re-run checks, run the theme-leak suite (P9 on) or the phase grep |
| R24 | `npm run check` exceeds the 10 minute foreground limit | the gated push script runs it in a worktree in the background |
| R25 | Covers are binaries | regenerate with `tools/rogue_book/cover.mjs` after P8; never hand-edit |
| R26 | The plan, the baselines or the phase position are lost between sessions | the plan is committed in P1; baselines regenerate from a2bd24b (8.7); the next phase comes from git (9.0.0) |
| R27 | The hushed soundtrack is muffled for most of a run if players wake less of the map than assumed | P6 calibrates the wake curve from the bot's measured median (Appendix E 7.2.4), raises the filter floor, and lifts the filter on the first woken hex |
| R28 | Pentatonic chords sound sour on some roots of in-sen and miyako-bushi | `CHORD_ROOTS` snaps chord roots; test A12 checks every root of all three scales |

Final verification workflow (P10 and the owner's own look): independent desktop and phone playthroughs with screenshots of every
screen, the string sweep (theme-leak suite plus the greps), the determinism gate IDENTICAL against the P1 baseline, the save
compatibility check, `npm run check` green, and the live site checked one minute after the last merge (title, a map reveal with sound,
the games index card and cover).

## 11. Open questions for the owner

Defaults are in section 2; the work does not wait for answers, but a different answer is cheapest before the phase in brackets.

1. Title: ECHOWAKE (default, "a rogue ballad"), YAMABIKO, or HUSHBREAKER? Tagline "a rogue ballad" or "a rogue song"? Please search
   the app stores and the web for "Echowake" before P3 so the name is free. [before P3; logo letters before P8]
2. Meta currency "Chimes" and the hub "the Hall of Echoes" (plaque "Hall"): happy, or prefer "the Shrine of Echoes" (plaque "Shrine")?
   [before P3]
3. Structure word "Verse" (Verse I, II, III) and the story collection "Ballads": happy, or Movement / keep Chapter? [before P2]
4. Keep the event name "Fable", or switch to "Whisper"? [before P2]
5. Final boss "The Conductor, Keeper of the Last Note" (forms the Conductor, the Damper, the Hush) and "The Nine-Voiced Fox" with bell
   tails: ok, or should the fox's tails carry singing foxfire instead (moves Foxfire Cry, Great Howl; needs a re-validation pass)?
   [before P2]
6. The seven internal sound ids keep their old names (`paint`, `well`, `page_turn` ...) and only sound new. Rename them too (no player
   difference, 34 call sites)? [any time]
7. Optional audio extras: a `hush` breath at each verse intro, Kuro's flute phrase on his cards? (The note marks and the sung `vox`
   voice are now in the default plan.) [P6]
8. Root games index: add the `music` tag and a new accent colour for the card? [P9]
9. Should a first-launch notice tell existing players that Inkwoven is now Echowake (their saves carry over)? Not in this plan; it would
   be a small new UI string. [after P10]
10. A by-ear listen after P6 (on a phone and on headphones): the vox Songs, the temple bell, and whether the hushed map music opens
    early enough. The numbers are calibrated and tested; taste is yours. [after P6]

---

## Appendix A. Narrative exact strings (story, enemies, fables, achievements, trials, tips, narrative tests)

Source: the narrative lens. Every replacement string here was machine-checked in a scratch harness against the real validators and suites (lengths, ASCII, spacing, no dashes, no doubled words, British spelling, hero naming, gold and hex number words, the Echo cost rule). Paste them as written. Field keys in the fable patches: `title`, `text`, `L<n>` = `choices[n].label`, `C<n>` = `choices[n].cost`, `O<n>.<m>` = `choices[n].out[m].text`. One planner override is already applied: the Conductor's `clean` move is named `Tacet` (the tile is Dead Silence). Kuro's card names are NOT here: section 5.4 is authoritative for them. The Suzu curtain-call line and Kuro's curtain-call line are in Appendix B (screen_end.js). Where a row below mentions "section N" it means a section of this appendix. In "Test changes this lens forces", the enemies title rows, game.test 674 and the screen rows were already made DATA-driven in P1 and the UI rows belong to P3: P4 applies only the narrative.test and content.test rows (the others are marked "done in P1" or "P3" there). Planner revision 2 changed these strings after the machine check, each re-measured against the same limits: the intro page (683 characters, 7 sentences, now names the yamabiko and the doubt), the boss_editor, blank_page and black_bar_inquisitor lore, the achievements first_draft, happy_endings, brush_collector and free_verse, and tips 6 and 29.

### 2. Hard constraints for every narrative string (from the validators and suites)

These are enforced, not stylistic. A writer who breaks one turns `npm run check` red.

| Where | Rule | Source |
| --- | --- | --- |
| All copy | printable ASCII only; no em or en dash; no `--`, ` - ` or ` -- ` used as a dash; no tabs or line breaks; no double spaces; no leading or trailing space; a space after `. , ! ? ; :` before a letter (an ellipsis `...` is fine); straight quotes only (no curly quotes); no markup `<x`; no doubled word like "the the" (allowed doubles: no, bye, ha, kata, tick, twang, ow, boom, krr, sit, cut, closer, hold, a thousand); British spelling (colour, armour, honour, grey, favour, centre, defence, realise, recognise) | narrative.test 1b, content.test "house style" and "card flavour" |
| Story pages (`intro ch1_intro ch2_intro ch3_intro ch1_clear ch2_clear victory defeat hero_*`) | title 5 to 40 chars, unique; text 400 to 700 chars (content suite: at least 300), unique, one paragraph, at least 6 sentences, ends with `. ! ?`; **text must begin with an ASCII letter** (the story screen builds a drop cap from `text[0]` and the screen_end suite asserts `.st-drop b` equals it) | narrative.test "lore", content.test 887, screen_end.test 171 |
| Shared story pages | intro, chapter intros and clears, victory, defeat never name Hanae, Kuro, Suzu or Raiga (the party is chosen by the player) | narrative.test "lore is the spine" |
| `hero_<id>` | title starts with the hero name and contains `DATA.heroes[id].title` without "The " (so "Kuro, the Songweaver" needs title "The Songweaver") | narrative.test |
| Barks | exactly 5 lines for each of start, hurt, kill, down, win, swap; 4 to 64 chars; end with `. ! ?` or `...`; 120 lines all unique across heroes; no hero names another hero; Raiga: at least 60 percent of lines shout (`!`), at least 40 percent mention friend/thunder/storm/boom, 4 to 12 lines say "friend", at least 20 lines with `!`; Suzu at most 3 percent `!`; Kuro and Hanae at most 5 percent `!` (content: at most 3 lines); Hanae keeps the running gag line `Nobody. Saw. That.` exactly once; some Raiga and Hanae lines are 8 chars or fewer | narrative.test barks, content.test 865 |
| Fables | title at most 40, unique; text 60 to 220, unique; 2 to 4 choices; label 4 to 48, unique in the event; cost 3 to 32; 1 to 3 outcomes, each 40 to 300 chars, ends with `. ! ? ' "`, distinct within the choice; no "todo/tbd/lorem/xxx" | data.js validator 1237, narrative.test |
| Fable numbers | an outcome that says "<word> gold" or "<word> hexes" must match a `gold` op of that size or a `paint` op of that n (hexes are exempt when the outcome has `addBrush`); a label naming "<n> gold" must equal `req.gold`; a cost "N gold" must be charged; a certain Ink (Echo) price must be shown in `cost` and the cost string must match the currency word; "Lose a card" really removes one; a curse cost that is not certain says may/maybe/might; "Hurts the front hero" really hurts `who:'front'`; a label of a certain fight contains "fight"; no "N HP" in prose | content.test 699 to 727, narrative.test costs |
| Fable hero naming | the scene text names no hero unless `when.hero` is set (then only that hero, and the title or text must name them); an outcome may only name the hero of its `req.hero` or of the moment | narrative.test hero moments |
| Achievements | name 5 to 28 chars, unique; text 15 to 100 chars (content allows 110), ends with `. ! ?`; text quotes its threshold number (except trialBest and boss kills); the trialBest ones contain "Trial 1", "Trial 5", "Trial 10" | narrative.test, content.test 795 to 808 |
| Trials | name at most 24, unique; text 20 to 96 chars, starts with a capital, ends with `.`; text quotes its own numbers by regex (see section 13 for the regexes that must change with Echo) | narrative.test, content.test 840 |
| Tips | 30, unique, 30 to 110 chars, a sentence, **no digits at all**; the joined tips must contain a fixed list of words (list changes with Echo, section 13); `screen_menu.js` HOWTO pages pick a tip by regex (`tip: /Painting a hex costs Ink/` at line 1932 must follow tip 0) | narrative.test, screen_menu.js 1929 to 1957 |
| Enemy copy | lore 60 to 260 chars, starts with a capital, 1 or 2 sentences (chapter 3 suite), unique; move name 3 to 28 chars, at most 5 words, unique per enemy; `say` at most 70 (ch1), 48 (ch2), 64 (ch3), 80 (content); phase say 8 to 90 (ch3 boss at least 15); in chapter 3 the ONLY move name shared by two enemies may be the wraith's and the boss's shared Block-piercing move (today "Rub Through", proposed "Smother": the test string must change with it) | enemies_1/2/3 suites, content.test 169 |
| Enemy names | `name` (and boss `title`) in `data_enemies_N.js` must equal `DATA.ROSTER_SRC` in `data.js` (the roster test compares them), and `CONTENT_SPEC.md` 4.1 is the human copy: rename in all three together | enemies_3.test 146, data.js 370 |
| Relic names used by tests | the lock test greps `/Brass Lantern/` and `/Fox Mask/` in lock reasons: keep those two relic names | narrative.test integration locks |


#### 3.2 The spine (replaces the "THE SPINE" comment in `data_meta.js` lines 24 to 30)

Paste as the new header comment (no dashes, plain prose):

```
// THE SPINE (why the land is the way it is; the pages below say it a little at a time)
//   The Singer sang the land with four voices: nerve (Hanae, the beat), curiosity (Kuro, the harmony), tenderness (Suzu, the
//   melody) and laughter (Raiga, the boom). The Singer's fifth voice, doubt, became the Conductor, who wanted the last note to be
//   perfect. Doubt made the Singer hold a breath just before the last note, and that held silence grew into the Hush, a yokai in the
//   shape of a yamabiko, the mountain echo that stopped answering calls and started swallowing them. The Conductor conducts the Hush
//   from the citadel, cutting off every note that is not perfect and feeding it to the Hush; in the last fight the Hush itself pours
//   out of him. He is a part of the Singer, never the Singer. Each boss is a keeper who held on too tightly: Kuzunoha held the SOUNDS (singing over the
//   grove until she sang walls), Jorogumo held the PEOPLE (keeping the festival guests at one silent supper so the Hush could not
//   eat them), the Conductor holds the ENDING. The heroes win by letting the song move. The ending: the Conductor is not destroyed
//   but joined, the last line is sung together and left open on purpose, the Hush lets go like a held breath, and the land asks to
//   be sung again. The Singer is whoever sings along.
```

#### 6.5 Validated enemy patches (names, titles, moves, says, phases, lore)

Only listed fields change. Move ids, fx, AI and HP stay. Chapter 3 says are at most 64 chars, chapter 1 at most 70; phase says 8 to 90.

##### boss_kuzunoha (chapter 1, boss)

| field | old | new |
| --- | --- | --- |
| title | `The Nine-Tail Ink Fox` | `The Nine-Voiced Fox` |
| moves.paper_fold.name | `Paper Fold` | `Call the Kodama` |
| moves.paper_fold.say | `Fold, little pages. Fold, and live.` | `Answer me, little echoes. Answer, and live.` |
| moves.ink_strike.name | `Ink Strike` | `Bell Strike` |
| moves.ink_strike.say | `Every stroke is a sentence.` | `Every note is a promise.` |
| moves.brush_flurry.name | `Brush Flurry` | `Tail Flurry` |
| moves.brush_flurry.say | `Let me write you smaller.` | `Let me sing you smaller.` |
| moves.ink_bleed.name | `Bleed the Page` | `Drown the Grove` |
| moves.ink_bleed.say | `Words run. So does ink.` | `Hear nothing but me.` |
| moves.tail_sweep.name | `Tail Sweep` | same |
| moves.tail_sweep.say | `Turn the page!` | `Louder!` |
| moves.great_stroke.name | `Great Brush Stroke` | `Great Bell Toll` |
| moves.great_stroke.say | `One great stroke.` | `One great note.` |
| moves.mask_gaze.name | `Mask Gaze` | same |
| moves.mask_gaze.say | `Look at me. Look, and forget.` | `Listen to me. Listen, and forget.` |
| moves.ink_needle.name | `Ink Needle` | `Needle Note` |
| moves.tails_rise.name | `Nine Tails Rise` | same |
| moves.tails_rise.say | `Nine tails... one stroke.` | `Nine tails... one song.` |
| moves.nine_tails.name | `Nine-Tail Storm` | same |
| moves.nine_tails.say | `NINE TAILS. ONE STROKE!` | `NINE VOICES. ONE SONG!` |
| moves.frayed_ink.name | `Frayed Ink` | `Frayed Voice` |
| moves.frayed_ink.say | `The page is running out.` | `The song is running out.` |
| phases[0].say | `You broke the mask. Very well, little storybook. Read my TRUE tails!` | `You broke the mask. Very well, little songbirds. Hear my TRUE voices!` |
| lore | `A white fox who learned to write and never stopped. Each of her nine tails ends in a brush, and every stroke rewrites a little more of the grove.` | `A white fox who learned to sing and never stopped. Each of her nine tails rings with its own voice, and every note drowns out a little more of the grove.` |

##### paper_kodama (chapter 1, minion)

| field | old | new |
| --- | --- | --- |
| name | `Paper Kodama` | `Hollow Kodama` |
| moves.ink_smudge.name | `Ink Smudge` | `Hollow Hum` |
| moves.paper_slap.name | `Paper Slap` | `Twig Slap` |
| lore | `A hollow doll folded from a torn page and given a face by the fox's brush. It carries a little of the Blank inside, and it spills.` | `A tree spirit with its echo eaten out, given a borrowed voice by the fox. It carries a little of the Hush inside, and it spills.` |

##### boss_editor (chapter 3, boss)

| field | old | new |
| --- | --- | --- |
| name | `The Editor` | `The Conductor` |
| title | `Keeper of the Last Page` | `Keeper of the Last Note` |
| moves.handout.name | `Editor's Notes` | `Places, Please` |
| moves.handout.say | `Pages, please. Take notes.` | `Quiet, please. Take your seats.` |
| moves.margin.name | `Margin Notes` | `Late Seating` |
| moves.margin.say | `One more proofreader.` | `One more for the quiet seats.` |
| moves.proofread.name | `Proofread` | `Rehearsal Note` |
| moves.proofread.say | `Let us see what needs correcting.` | `Let us hear what needs correcting.` |
| moves.pen.name | `Red Pen` | `Red Baton` |
| moves.strike.name | `Strike Through` | `Cut Off` |
| moves.footnote.name | `Footnote` | `Fermata` |
| moves.footnote.say | `See page two hundred and four.` | `Rest for two hundred and four bars.` |
| moves.clean.name | `Clean Slate` | `Tacet` |
| moves.clean.say | `A fresh page. How lovely.` | `A clean silence. How lovely.` |
| moves.swipe.name | `Eraser Swipe` | `Damper Swipe` |
| moves.smudge.name | `Smudge Everything` | `Muffle Everything` |
| moves.rub.name | `Rub Through` | `Smother` |
| moves.typos.name | `Typos in the Erasure` | `Wrong Notes Creep In` |
| moves.gape.name | `Gaping Tear` | `Gaping Silence` |
| moves.tear.name | `Rip the Page` | `Swallow Whole` |
| moves.unwrite.name | `Unwrite` | `Unsing` |
| moves.unwrite.say | `Never written. Never was.` | `Never sung. Never was.` |
| moves.seep.name | `Storm Seeps In` | same |
| moves.last.name | `The Last Word` | `The Last Note` |
| moves.last.say | `...the end.` | `...and silence.` |
| phases[0].say | `Too many words. Far too many words. Let me rub some out.` | `Too many notes. Far too many notes. Let me damp some down.` |
| phases[1].say | `You cannot correct what has no words left.` | `You cannot correct what has no sound left.` |
| lore | `The Living Book's most careful editor loved the story so much he could not bear its flaws. He cut everything he could, rubbed out what was left, and now he is only the last blank page.` | `The Singer's most careful listener loved the song so much he could not bear a wrong note. He cut off every note he could, damped down what was left, and now he conducts the Hush, holding the Singer's breath.` |

##### redaction_knight (chapter 3, normal)

| field | old | new |
| --- | --- | --- |
| name | `Redaction Knight` | `Muffled Knight` |
| moves.cleave.name | `Black-Bar Cleave` | `Felt-Bar Cleave` |
| moves.strike.name | `Strikethrough` | `Cut Short` |
| moves.blackout.name | `Blackout` | `Muffle Up` |
| moves.blackout.say | `CLASSIFIED.` | `SHHH.` |
| lore | `Its face is a black bar and so is its opinion of you. Somewhere under the armour was a knight with a name, and the name has been struck out.` | `Its helm is stuffed with grey felt and so is its opinion of you. Somewhere under the armour was a knight with a battle cry, and the cry has been smothered.` |

##### void_scribe (chapter 3, normal)

| field | old | new |
| --- | --- | --- |
| name | `Void Scribe` | `Grey Cantor` |
| moves.ink.name | `Blank Ink` | `Hollow Chant` |
| moves.erase.name | `Erase the Margin` | `Unsing the Air` |
| moves.erase.say | `Words are so temporary.` | `Songs are so temporary.` |
| moves.blot.name | `Blot Out` | `Drone Out` |
| lore | `It writes in ink the colour of nothing, and everything it writes stays blank. Its favourite hobby is proofreading other people's power.` | `It chants in a voice the colour of nothing, and everything it sings stays silent. Its favourite hobby is shushing other people's power.` |

##### blank_soldier (chapter 3, normal)

| field | old | new |
| --- | --- | --- |
| name | `Blank Soldier` | `Silent Soldier` |
| lore | `Cut from one sheet and folded into a drill sergeant's dream: identical, loyal, and much braver in a crowd. Alone, it is a rectangle with a spear.` | `Grey, faceless and marching in perfect step without a sound: a drill sergeant's dream. Alone, it is a very quiet man with a spear.` |

##### eraser_wraith (chapter 3, normal)

| field | old | new |
| --- | --- | --- |
| name | `Eraser Wraith` | `Muffle Wraith` |
| moves.smudge.name | `Smudge` | `Muffle` |
| moves.rub.name | `Rub Through` | `Smother` |
| lore | `It drifts through the citadel with one soft grey hand held out, rubbing. Block, momentum and hard-won stacks fade under it like pencil, and it hums while it works.` | `It drifts through the citadel with one soft grey hand held out, pressing. Block, momentum and hard-won stacks go quiet under it like a damped string.` |

##### paper_golem (chapter 3, normal)

| field | old | new |
| --- | --- | --- |
| name | `Paper Golem` | `Felt Golem` |
| moves.fold.name | `Fold Up` | `Pad Up` |
| moves.slam.name | `Origami Slam` | `Padded Slam` |
| lore | `A giant folded by patient hands from the pages of an unfinished chapter. It is slow and it is big, and every fold it adds makes the next slam worse for you.` | `A giant stitched by patient hands from the felt of a thousand muffled drums. It is slow and it is big, and every layer it adds makes the next slam worse for you.` |

##### margin_imp (chapter 3, normal)

| field | old | new |
| --- | --- | --- |
| name | `Margin Imp` | `Off-Key Imp` |
| moves.call.name | `Scribble a Friend` | `Hum a Friend` |
| moves.doodle.name | `Nasty Doodle` | `Nasty Jingle` |
| moves.scribble.name | `Frantic Scribble` | `Frantic Warble` |
| lore | `A scribbling imp that lives in the margins of old pages and draws horns on everyone. It keeps a very long list of your mistakes and reads it aloud, slowly.` | `A tuneless imp that lives under old stages and sings flat at everyone. It keeps a very long list of your mistakes and hums it back, slowly.` |

##### censor_golem (chapter 3, elite)

| field | old | new |
| --- | --- | --- |
| moves.smack.name | `Ink-Pad Smash` | `Felt-Pad Smash` |
| moves.censor.name | `Redaction Stamp` | `Silence Stamp` |
| moves.censor.say | `Nothing to see here.` | `Nothing to hear here.` |
| phases[0].say | `THIS PAGE IS NOW UNDER REVIEW.` | `THIS SONG IS NOW UNDER REVIEW.` |
| lore | `Built by the Blank to approve nothing. One arm is a rubber stamp the size of a door, its chest is a black bar, and its only word is a very final one.` | `Built by the Hush to approve nothing. One arm is a rubber stamp the size of a door, its chest is a grey gag, and its only word is a very final one.` |

##### black_bar_inquisitor (chapter 3, elite)

| field | old | new |
| --- | --- | --- |
| name | `Black-Bar Inquisitor` | `Hush Inquisitor` |
| moves.chains.name | `Black Chains` | `Grey Chains` |
| moves.chains.say | `Hold still. The sentence is not yet written.` | `Hold still. The verdict is not yet sung.` |
| lore | `The Blank's inquisitor keeps a court where the verdict is written in advance. It has a soft spot for the weakest hero in the room, mostly because that is the quickest way to finish the paperwork.` | `The Hush's inquisitor keeps a court where the verdict is decided in advance. It has a soft spot for the weakest hero in the room, mostly because that is the quickest way to close the session.` |

##### blank_page (chapter 3, minion)

| field | old | new |
| --- | --- | --- |
| name | `Blank Page` | `Hush Moth` |
| moves.cut.name | `Paper Cut` | `Wing Cut` |
| lore | `A sheet of paper that has not decided to be a story yet. It drifts about looking innocent, and folds itself around anyone who tries to write on it.` | `A grey moth whose wings make no sound at all. It drifts about looking innocent, and wraps itself around anyone who tries to sing near it.` |

##### typo_sprite (chapter 3, minion)

| field | old | new |
| --- | --- | --- |
| name | `Typo Sprite` | `Sour Note` |
| moves.misspell.name | `Misspell` | `Go Flat` |
| moves.poke.name | `Glitch Poke` | same |
| lore | `It lives where words go wrong. Where it lands a letter slides, a meaning drifts, and somebody's careful turn arrives one Energy short.` | `It lives where songs go wrong. Where it lands a note slides, a beat drifts, and somebody's careful turn arrives one Energy short.` |

### 8. Lore: every page, rewritten (data_meta.js `DATA.add('lore', ...)`, ids kept)

All twelve story pages change: every one names the Author, the Blank, a book, a page or ink. Each new text below passed the narrative
and content suite rules (title 5 to 40, text 400 to 700 with at least 6 sentences, starts with a letter for the drop cap, ASCII, no dash,
no doubled word, British spelling, shared pages name no hero) and the new spine test below. Brief per page:

| id | Old title | New title | What the page now says |
| --- | --- | --- | --- |
| intro | Once, a Book | Once, a Song | a land that sang itself; the Singer held a breath and never let go; the Hush eats the song one sound at a time; two voices wake and refuse to end on a rest |
| ch1_intro | The Whispering Bamboo Grove | same | first verse; kodama answer one beat late; the white fox with nine ringing tails sings the grove back louder than the Hush can swallow; "She sings so loud she has stopped listening"; Take a breath. Find the beat. Wake a way. |
| ch1_clear | The Fox Puts Down Her Brush | The Fox Lowers Her Voice | Kuzunoha's tails droop like bells with the ringing gone; she sang walls; birdsong returns; a shrine bell rings and a girl with silver hair (Suzu, unlocked) looks up |
| ch2_intro | The Sunken Lantern City | same | second verse; a festival town that never stopped, slack drums and flutes full of water; the lady spinning silk holds everything together |
| ch2_clear | The Threads Come Loose | same | Jorogumo kept the guests so the Hush could not eat them; keeping a song is not letting it be sung; guests walk home humming; silent lightning; a broad man (Raiga, unlocked) cracks his knuckles |
| ch3_intro | The Crimson Sky Citadel | The Thunderless Citadel | the last verse is conducted, not sung; bells wrapped in felt, strings cut, lightning without thunder, grey holes that are cut-off notes; the Keeper of the Last Note rehearses one chord with a red baton |
| victory | The Ending, Rewritten | The Final Chorus | the Conductor speaks in the Singer's tired voice ("A wrong note can never be unsung"); the heroes sing the last line together and leave it open; the Hush lets go like a sigh; the fox yips along; the land asks to be sung again |
| defeat | The Page Goes White | A Rest in the Music | voices fade, the land goes grey; it does not hurt; the Hush is polite that way; a rest is not the end of the music; the beat comes back around; once more from the top |
| hero_hanae | Hanae, the Blossom Blade | same | sung on the very first bar on a brave day; never misses her cue; her cuts ring like struck bells and leave petals; sung to win |
| hero_kuro | Kuro, the Inkweaver | Kuro, the Songweaver | began as a harmony; knows he lives in a song; listens to the last bar first; his flute plays spells because it played him; fears a harmony is the first thing a conductor cuts |
| hero_suzu | Suzu, the Moon Miko | same | sung late at night when the song would not come; the bell left ringing; keeps the song in tune; someone gentle is still humming the melody |
| hero_raiga | Raiga, the Thunder Monk | same | sung in a thunderstorm by a Singer laughing too hard to hold the note; his thunder is the Singer's own laugh; the Hush stops to listen |

##### intro

- old title: `Once, a Book`  ->  **new title: `Once, a Song`** (12 chars)
- new text (REVISION 2: 683 chars, 7 sentences, starts with a letter for the drop cap; it carries the causal chain of plan 4.1 and the yamabiko):

> Once there was a land that sang itself. Its Singer had loved it so long and so well that one day the song simply kept going without a voice. Then, on an ordinary night, just before the last note, a small doubt whispered that it might come out wrong, and the Singer held a breath and did not let it go. The held silence grew. It took the shape of a yamabiko, the mountain echo that once answered every call, and it began to swallow the calls instead: the Hush, unhurried and polite, eating the song one sound at a time. But a song that sings itself is never quite silent. Somewhere inside it, two voices woke, heard each other, and agreed that the song was not going to end on a rest.

##### ch1_intro

- old title: `The Whispering Bamboo Grove`  ->  **new title: `The Whispering Bamboo Grove`** (27 chars)
- new text (607 chars, starts with a letter for the drop cap):

> The first verse smells of rain and warm cedar. The Whispering Bamboo Grove glows in golden dusk, every stalk murmuring the tune it is afraid to forget. Kodama answer every call, one beat late. A kappa guards a bridge with terrible manners. And somewhere in the middle, a white fox with nine ringing tails is singing the grove back, note by note, louder than the Hush can swallow. Nobody asked her to. Nobody thanked her, either. 'She means well,' the bamboo whispers. 'That is the trouble. She sings so loud she has stopped listening.' The land lies grey and still. Take a breath. Find the beat. Wake a way.

##### ch1_clear

- old title: `The Fox Puts Down Her Brush`  ->  **new title: `The Fox Lowers Her Voice`** (24 chars)
- new text (597 chars, starts with a letter for the drop cap):

> Kuzunoha's nine tails drooped one by one, like bells with the ringing gone out of them. The song ran out of her, and the wildness with it, and she sat down in the bamboo, very small for a fox the size of a house. 'I was only trying to keep it,' she said. 'Every time the Hush ate a note, I sang two more. I never noticed I had stopped singing songs and started singing walls.' The grove went quiet, and then, quite suddenly, it was full of birdsong. The verse ended by itself. Far behind it, a shrine bell rang once, and a girl with silver hair looked up. Her verse had just been allowed to begin.

##### ch2_intro

- old title: `The Sunken Lantern City`  ->  **new title: `The Sunken Lantern City`** (23 chars)
- new text (599 chars, starts with a letter for the drop cap):

> The second verse is played in lantern light on black water. The Sunken Lantern City drifts under a sky like a folded kimono, every canal lined with paper lamps and every lamp watching. Once this was a festival town, and the festival never stopped: now the drums are slack and the flutes are full of water. Karakuri dolls dance to music nobody can hear. A tea house serves guests who never leave, and in the tallest window a lady in a very fine kimono is spinning silk. She is the keeper of the city. She holds it together, thread by thread. She holds everything together. Look how tightly she holds.

##### ch2_clear

- old title: `The Threads Come Loose`  ->  **new title: `The Threads Come Loose`** (22 chars)
- new text (685 chars, starts with a letter for the drop cap):

> When the last silk thread snapped, the city did not fall. It exhaled. Jorogumo sat among the wreck of her kimono, fingers still tying knots in nothing. 'The Hush was going to eat them,' she said. 'The guests, the lamps, the music, all of them. So I kept them. I kept them here.' Nobody answered, because everyone knew the answer, and it was not unkind: keeping a song is not the same as letting it be sung. One by one the lanterns went out, and the guests rose from the table at last and walked home humming. Lightning flickered over the next verse, and no thunder followed. Somewhere ahead, a broad man laughed at the silent storm, cracked his knuckles, and started walking toward it.

##### ch3_intro

- old title: `The Crimson Sky Citadel`  ->  **new title: `The Thunderless Citadel`** (23 chars)
- new text (610 chars, starts with a letter for the drop cap):

> The last verse is not sung at all. It is conducted. The Thunderless Citadel hangs above a sea of storm cloud, its bells wrapped in grey felt, its halls lined with instruments whose strings have been cut. Lightning strikes in neat, careful lines, and no thunder follows. Through the window slits the sky is coming apart in grey holes, and every hole is a note that was cut off before it could ring. At the very top waits the Keeper of the Last Note, who has been rehearsing a single chord with a red baton for a very long time so that nothing in it will ever have to change. Every hex you woke was leading here.

##### victory

- old title: `The Ending, Rewritten`  ->  **new title: `The Final Chorus`** (16 chars)
- new text (617 chars, starts with a letter for the drop cap):

> The Conductor lowered his red baton, and his face came apart like a held breath let go. 'It had to be perfect,' he whispered, in the Singer's own tired voice. 'A wrong note can never be unsung, so I never let one come.' The Singer had not vanished. The Singer had only stopped believing the last note could be good enough. The heroes did not shout. They stood beside him, breathed in, and sang the last line together, and left it open at the end on purpose. The Hush let go like a sigh. In the bamboo, a small white fox yipped along. Then the whole land rang its first note and asked, very politely, to be sung again.

##### defeat

- old title: `The Page Goes White`  ->  **new title: `A Rest in the Music`** (19 chars)
- new text (609 chars, starts with a letter for the drop cap):

> The echoes thinned. The bamboo, the lanterns, the storm, all of it went grey and soft, and the heroes heard their own voices fade to nothing. It did not hurt. That was the worst part. The Hush is polite that way. But a song that sings itself does not stay silent for long, and a rest is not the end of the music. The beat comes back around. The colour seeps in, the first bell rings, and two voices open their eyes a little hoarse and a little wiser, with a very clear memory of where the fox likes to hide. Once more from the top. Try a different road. The song is patient. It has all the notes in the world.

##### hero_hanae

- old title: `Hanae, the Blossom Blade`  ->  **new title: `Hanae, the Blossom Blade`** (24 chars)
- new text (620 chars, starts with a letter for the drop cap):

> The Singer sang Hanae on the very first bar, on a day the Singer felt brave. She was meant to be the hero: the one who steps forward first, so the rest of the song has somewhere to stand. She has a very good ponytail, an even better blade, and a reputation for never missing her cue. Every cut she makes rings like a struck bell and leaves petals, because the Singer once sang 'like a blossom' and never took it back. She will tell you she is afraid of nothing. She will say it a little fast. The truth is that she was sung to win, and nobody ever sang what happens if she does not, so she has decided never to find out.

##### hero_kuro

- old title: `Kuro, the Inkweaver`  ->  **new title: `Kuro, the Songweaver`** (20 chars)
- new text (652 chars, starts with a letter for the drop cap):

> Kuro began as a harmony. The Singer needed someone to carry the tune where the melody could not reach, so a quiet second line was hummed under the first, glasses and all, and then, because the Singer was kind, given a personality. It got out of hand. He is the only one who knows he lives in a song, and he listens to the last bar first, which he says is sensible and everyone else says is cheating. His flute plays spells because it is the flute that played him. He teases to stay warm. He counts the rests for exits. Deep down he suspects a harmony is the first thing a conductor cuts, and he would like everyone to please stop humming that out loud.

##### hero_suzu

- old title: `Suzu, the Moon Miko`  ->  **new title: `Suzu, the Moon Miko`** (19 chars)
- new text (602 chars, starts with a letter for the drop cap):

> The Singer sang Suzu late at night, on the evenings when the song would not come. She is the shrine at the edge of the map, the bell left ringing for whoever is lost. She keeps the song in tune: every slack string, every note gone sour, she feels in her hair, and she mends what she can without making a fuss. She is seventeen and steadier than a mountain. She waits at the edge of the verse until it is safe to enter, and then enters anyway, because it is never quite safe. The Singer sang her to make a promise to the listener: however wrong the song goes, someone gentle is still humming the melody.

##### hero_raiga

- old title: `Raiga, the Thunder Monk`  ->  **new title: `Raiga, the Thunder Monk`** (23 chars)
- new text (620 chars, starts with a letter for the drop cap):

> Raiga was sung in a thunderstorm by a Singer who was laughing too hard to hold the note. He was meant to be the comic relief. He declined. He takes every blow with a grin and returns it louder, and his thunder is not lightning at all but a laugh, the Singer's own, caught in the song and never let go. He weighs about as much as a temple bell and carries his sorrows a good deal more lightly. He calls everyone friend, means it, and it is somehow always a relief. Ask him about endings and he will tell you they are only the last chorus everyone has agreed to enjoy. Then he will laugh, and the Hush will stop to listen.

##### Barks

`barks_kuro`: replace all 30 lines (every key, order as listed):

| key | old (5) | new (5) |
| --- | --- | --- |
| start | `Chapter, verse, and a great deal of ink.`<br>`Let us see how this scene reads.`<br>`I have read ahead. It goes fine. For most of us.`<br>`Please stand clear of the margins.`<br>`Ah, the rising action. My favourite.` | `Verse, chorus, and a great deal of flute.`<br>`Let us hear how this scene plays.`<br>`I listened ahead. It goes fine. For most of us.`<br>`Please keep clear of the high notes.`<br>`Ah, the crescendo. My favourite.` |
| hurt | `Ow. Noted, and underlined.`<br>`That was a very unfair footnote.`<br>`Rude. I was in the middle of a sentence.`<br>`I would like to file a complaint with the Author.`<br>`Hm. An adverse review.` | `Ow. That was a very sour note.`<br>`That was a very unfair key change.`<br>`Rude. I was in the middle of a bar.`<br>`I would like to file a complaint with the Singer.`<br>`Hm. A harsh review from the cheap seats.` |
| kill | `And so it ends. Sorry. Spoilers.`<br>`Marked, corrected, and struck through.`<br>`Revised for clarity.`<br>`Edited. You are welcome.`<br>`Now that is a final draft.` | `Fine. That is the musical word for the end.`<br>`Cut from the score.`<br>`Rest. Several bars of it.`<br>`Tuned out. You are welcome.`<br>`Now that is a final cadence.` |
| down | `Cut to a scene... I am not in.`<br>`Tell them it was a very good last line.`<br>`Turn the page. I will catch up.`<br>`Footnote me. Later.`<br>`Well. That is a plot twist.` | `Cut to a verse... I am not in.`<br>`Tell them it was a very good last note.`<br>`Play on. I will catch the next bar.`<br>`Mark me as a rest. For now.`<br>`Well. That is a key change.` |
| win | `Curtain. Applause, if you please.`<br>`A satisfying scene. This one qualified.`<br>`End of chapter. I will take notes.`<br>`Well written, if I say so myself.`<br>`See? Last page first. Always works.` | `Curtain. Applause, if you please.`<br>`A satisfying performance. This one qualified.`<br>`End of the verse. I will hum the reprise.`<br>`Well played, if I say so myself.`<br>`See? Last bar first. Always works.` |
| swap | `Front row? Terrible seats for reading.`<br>`Pardon me, borrowing the spotlight.`<br>`I get to be brave? How novel.`<br>`The front. Fascinating. Ink everywhere.`<br>`Trade places. The plot demands it.` | `Front row? Terrible seats for listening.`<br>`Pardon me, borrowing the spotlight.`<br>`I get the solo? How thrilling.`<br>`The front. Fascinating. Echoes everywhere.`<br>`Trade places. The tempo demands it.` |

`barks_hanae` and `barks_suzu`: three single-line swaps; `barks_raiga`: no change.

| set.key | old | new |
| --- | --- | --- |
| hanae.win | `Another page, another win.` | `Another verse, another win.` |
| suzu.kill | `It is over. Go back to the page.` | `It is over. Go back to the song.` |
| suzu.kill | `Be still. The story has room for you elsewhere.` | `Be still. The song has room for you elsewhere.` |


#### 9.2 Exact patches (every LIGHT and REWRITE fable)

Field keys: `title`, `text`, `L<n>` = `choices[n].label`, `C<n>` = `choices[n].cost`, `O<n>.<m>` = `choices[n].out[m].text`. Only the listed fields change; ids, ops, weights, `req`, `when`, `once`, `w` and `art.scene` stay exactly as they are. Every new string below was machine-checked against the narrative and content suites (lengths, ASCII, spacing, no dashes, no doubled words, British spelling, hero naming, the gold and hexes number words, and the Echo cost rule once the test is switched to `/echo/i`).

##### fox_in_the_snare (LIGHT)

| field | old | new |
| --- | --- | --- |
| text | `A white fox kit is tangled in a hunter's snare, one ink-dipped tail thrashing. It has stopped struggling and started glaring, which is either a very good sign or a very bad one.` | `A white fox kit is tangled in a hunter's snare, one bell-tipped tail thrashing. It has stopped struggling and started glaring, which is either a very good sign or a very bad one.` |
| O0.0 | `The kit nips you twice out of pure principle, then shoots free, stops, bows once like a tiny courtier, and vanishes into the bamboo. Where it stood, one ink pawprint is drying into a neat little note in the margin of your map.` | `The kit nips you twice out of pure principle, then shoots free, stops, bows once like a tiny courtier, and vanishes into the bamboo. Where it stood, one small pawprint is still humming a neat little note, and the note follows you.` |

##### stone_lantern_story (LIGHT)

| field | old | new |
| --- | --- | --- |
| title | `The Lantern Wants a Story` | `The Lantern Wants a Song` |
| text | `An old stone lantern, unlit for a century, says it will shine if someone tells it a story. It would like a good one. It has already heard most of the others.` | `An old stone lantern, unlit for a century, says it will shine if someone sings it a song. It would like a good one. It has already heard most of the others.` |
| L0 | `Tell it a story` | `Sing it a song` |
| O0.0 | `You tell of a fox, a bridge, and a very serious cucumber. It glows a proud pale gold. 'Acceptable,' it says, and light spills down the path ahead.` | `You sing of a fox, a bridge, and a very serious cucumber. It glows a proud pale gold. 'Acceptable,' it says, and light spills down the path ahead.` |
| L1 | `Let Kuro recite one from the margins` | `Let Kuro play it a tune` |
| O1.0 | `He recites the one nobody remembers writing. The lantern weeps warm wax, and the road ahead lights itself for a long way.` | `He plays the one nobody remembers composing. The lantern weeps warm wax, and the road ahead lights itself for a long way.` |
| C2 | `1 Ink` | `1 Echo` |

##### hermit_brush_seller (REWRITE)

| field | old | new |
| --- | --- | --- |
| title | `The Hermit's Brushes` | `The Hermit's Songs` |
| text | `A hermit in a bamboo hut sells brushes of every size, all of them slightly damp. 'They are single use,' she says, 'like most good ideas.' She looks at your deck with interest.` | `A hermit in a bamboo hut sells songs of every length, all of them a little out of breath. 'They are single use,' she says, 'like most good ideas.' She looks at your deck with interest.` |
| L0 | `Buy a Wave Sweep` | `Buy a Ripple` |
| O0.0 | `She wraps it in a leaf and does not let go until you promise to use it properly. 'Five hexes,' she says. 'Enough to change your mind about a whole afternoon.'` | `She hums it into a leaf and does not let go until you promise to sing it properly. 'Five hexes,' she says. 'Enough to change your mind about a whole afternoon.'` |
| L1 | `Trade a card for a brush` | `Trade a card for a song` |
| O1.0 | `She takes the card, sniffs it, nods, and hands you a brush from behind her ear. 'Fair,' she says, pocketing your coins. 'Cards are lighter than brushes. Both weigh on you, and I charge for the lifting.'` | `She takes the card, sniffs it, nods, and hums you a song from behind her ear. 'Fair,' she says, pocketing your coins. 'Cards are lighter than songs. Both weigh on you, and I charge for the carrying.'` |
| O1.1 | `She takes the card, reads it, and goes very quiet. 'Where did you get this?' she asks, and does not wait for an answer. She hands you the good brush from the back of the hut, and still takes the coins.` | `She takes the card, reads it, and goes very quiet. 'Where did you get this?' she asks, and does not wait for an answer. She teaches you the good song from the back of the hut, and still takes the coins.` |

##### paper_kodama_pilgrim (REWRITE)

| field | old | new |
| --- | --- | --- |
| title | `The Paper Kodama` | `The Kodama's Echo` |
| text | `A paper kodama shuffles along the road with a torn page clutched to its chest. It is hollow, folded, and very determined. When it sees you it stops, and holds out the page with both hands.` | `A hollow kodama shuffles along the road with one small echo cupped in its hands. It has no voice of its own. When it sees you it stops, and holds the echo out with both hands.` |
| L0 | `Read the torn page` | `Listen to the echo` |
| C0 | `It may smudge your deck` | `It may sour your deck` |
| O0.0 | `It is a spell, or the start of one, in a hand older than the grove. The kodama watches, hugely pleased. You take one good idea away with you.` | `It is a spell, or the start of one, in a voice older than the grove. The kodama watches, hugely pleased. You take one good idea away with you.` |
| O0.1 | `The page is half Blank. A word slides off it, in through your eyes and out the back of your head. Nothing hurts, but something is quietly missing.` | `The echo is half Hush. A note slides in through your ears and out the back of your head. Nothing hurts, but something is quietly missing.` |
| L1 | `Ask it to fold you a copy` | `Ask it to echo a card` |
| O1.0 | `It folds a duplicate of one of your cards with tiny, terrifying precision. The copy is still warm. The kodama bows, and then, slowly, with great dignity, unfolds a little at the edges.` | `It echoes one of your cards back with tiny, terrifying precision. The copy is still warm. The kodama bows, and then, slowly, with great dignity, goes a little quieter at the edges.` |
| O2.0 | `It vibrates with quiet joy. Then it presses the page into your hand anyway, and shuffles off down the road, much lighter.` | `It vibrates with quiet joy. Then it presses the echo into your hand anyway, and shuffles off down the road, much lighter.` |

##### missing_page (REWRITE)

| field | old | new |
| --- | --- | --- |
| title | `A Door of Nothing` | `A Door of Silence` |
| text | `In the middle of the grove hangs a rectangle of nothing, perfectly white, the size of a door. The bamboo leans away from it. Something is missing here, and you can feel it like a lost tooth.` | `In the middle of the grove hangs a doorway of perfect silence, grey and still. The bamboo leans away from it. Something is missing here, and you can feel it like a lost tooth.` |
| O1.0 | `Your hand comes back holding a coin with no face on it, and then another, and another. They spend fine.` | `Your hand comes back holding a coin that makes no sound when it drops, and then another, and another. They spend fine.` |
| O1.1 | `Your hand comes back a little paler, and your memory of breakfast is gone. A small mercy: so is the dread.` | `Your hand comes back a little greyer, and your memory of breakfast is gone. A small mercy: so is the dread.` |
| O1.2 | `Your hand comes back holding a brush that is not yours, and is still warm.` | `Your hand comes back holding a song that is not yours, and it is still warm.` |
| L2 | `Paint over it` | `Sing into it` |
| C2 | `2 Ink, maybe a curse` | `2 Echo, maybe a curse` |
| O2.0 | `You paint bamboo across the doorway, stalk by careful stalk. The white shivers, holds, and thickens into green. The whole grove breathes out.` | `You sing bamboo into the doorway, note by careful note. The grey shivers, holds, and thickens into green. The whole grove breathes out.` |
| O2.1 | `You paint bamboo across the doorway, stalk by careful stalk, but the white drinks the green and spits something back: a smear that lands, somehow, in your deck.` | `You sing bamboo into the doorway, note by careful note, but the silence swallows the green and spits something back: a sour note that lands, somehow, in your deck.` |

##### fox_returns (LIGHT)

| field | old | new |
| --- | --- | --- |
| text | `A white fox with two tails, one dipped in ink, waits on a mossy bridge post. She looks exactly like a kit you once untangled, only taller, and she is holding a small carved mask in her mouth.` | `A white fox with two tails, one tipped with a tiny bell, waits on a mossy bridge post. She looks exactly like a kit you once untangled, only taller, and she is holding a small carved mask in her mouth.` |
| O1.0 | `She runs. You run. The tiles are wet, and the city rearranges itself politely around the fox. Five hexes open ahead of you like a sentence someone finally finished.` | `She runs. You run. The tiles are wet, and the city rearranges itself politely around the fox. Five hexes ring open ahead of you like a song someone finally finished.` |
| O3.0 | `She leans into it, eyes shut, both tails thumping. Something in the whole party unclenches. She leaves a scrap of ink on your sleeve, which is how foxes say thank you.` | `She leans into it, eyes shut, both tails thumping. Something in the whole party unclenches. She leaves a little yip ringing in your ears, which is how foxes say thank you.` |

##### lantern_ferry (LIGHT)

| field | old | new |
| --- | --- | --- |
| text | `The ferryman is a paper lantern on a pole, steering a boat of folded newsprint. Fare is thirty gold, he says. Or one story. Or, if you are honest, one thing you are afraid of.` | `The ferryman is a paper lantern on a pole, steering a boat of folded paper. Fare is thirty gold, he says. Or one song. Or, if you are honest, one thing you are afraid of.` |
| O0.0 | `He poles you through a wide glowing arc of canals, humming. When you step off, the map ahead has been quietly redrawn in your favour, and then some.` | `He poles you through a wide glowing arc of canals, humming. When you step off, the land ahead has quietly woken in your favour, and then some.` |

##### flooded_archive (REWRITE)

| field | old | new |
| --- | --- | --- |
| title | `The Flooded Archive` | `The Flooded Music Hall` |
| text | `A flooded archive, shelves knee-deep in black water. Books float open, their pages bleeding letters like tea. One volume on the top shelf is still dry, and humming.` | `A flooded music hall, knee-deep in black water. Drums float upside down, their skins gone slack. On the top shelf one flute is still dry, and humming to itself.` |
| L0 | `Wade in for the dry book` | `Wade in for the dry flute` |
| O0.0 | `You wade, you climb, you take it down. It is a spell in an older hand, and it is very happy to be read again.` | `You wade, you climb, you take it down. It plays a spell in an older key, and it is very happy to be played again.` |
| O0.1 | `You wade. The water is deeper than it looked, and colder, and something drifts past that is not a book. You get the volume anyway.` | `You wade. The water is deeper than it looked, and colder, and something drifts past that is not a drum. You get the flute anyway.` |
| L1 | `Let Kuro read the spines` | `Let Kuro listen to the shelves` |
| O1.0 | `Kuro reads the spines from the doorway, one finger raised. 'Third shelf, fourth from the left. Do not touch the fifth.' He is right. The fifth was a mimic.` | `Kuro listens from the doorway, one finger raised. 'Third shelf, fourth from the left. Do not touch the fifth.' He is right. The fifth was a mimic.` |
| L2 | `Wring out a wet page` | `Shake out a drowned flute` |
| O2.0 | `You wring a page into a bucket. Half a sentence survives: 'the bravest thing about her was that she was afraid.' You keep it.` | `You shake a flute out over a bucket. Half a lullaby survives, words and all: 'the bravest thing about her was that she was afraid.' You hum it all afternoon.` |

##### kuro_footnote (REWRITE)

| field | old | new |
| --- | --- | --- |
| title | `Kuro's Footnote` | `Kuro's Harmony` |
| text | `Kuro stops at a torn poster and goes very still. Beside his name, in a hand he knows better than his own, someone has scribbled a note. He has not read it. Not yet.` | `Kuro stops beside a broken music box and goes very still. It is playing his harmony, the quiet line under the melody, in a voice he knows better than his own. He has not heard the end. Not yet.` |
| L0 | `Let him read it` | `Let him listen` |
| O0.0 | `'K.,' it says. 'Keep? Cut?' And below, pressed so hard the paper tore: KEEP. Kuro folds the poster carefully and says nothing for several hexes. He is grinning by the third.` | `At the end the voice stops, hums his line once more, and then, very firmly, sings it a third time: keep. Kuro closes the lid carefully and says nothing for several hexes. He is grinning by the third.` |
| L1 | `Ask him to read it aloud` | `Ask him to sing along` |
| O1.0 | `He does the voice. It is an excellent voice, low and tired and fond. By the second line the whole party is grinning, and by the last, laughing.` | `He does the voice. It is an excellent voice, low and tired and fond. By the second bar the whole party is grinning, and by the last, laughing.` |
| O1.1 | `He gets as far as the second line and stops. 'Sorry,' he says, very quietly. 'Give me a minute.' You give him several. The whole party is a little sturdier for having watched.` | `He gets as far as the second bar and stops. 'Sorry,' he says, very quietly. 'Give me a minute.' You give him several. The whole party is a little sturdier for having watched.` |
| L2 | `Write a note under it` | `Hum a harmony of your own` |
| C2 | `1 Ink` | `1 Echo` |
| O2.0 | `You add, in your best hand: AGREED. Kuro pretends to be annoyed for nearly four seconds.` | `You hum a line on top of his, in your best voice, which in music means AGREED. Kuro pretends to be annoyed for nearly four seconds.` |

##### sentry_bridge (LIGHT)

| field | old | new |
| --- | --- | --- |
| O1.0 | `'Correct,' he says, which surprises everyone, himself included. 'Pass.' Two hexes of bridge unroll ahead like a scroll.` | `'Correct,' he says, which surprises everyone, himself included. 'Pass.' Two hexes of bridge unroll ahead like a festival banner.` |

##### rokurokubi_gossip (LIGHT)

| field | old | new |
| --- | --- | --- |
| O2.1 | `She trades you something better: where the Blank is thin, and where the canal doubles back on itself. You mark it on your map in your own small handwriting.` | `She trades you something better: where the Hush is thin, and where the canal doubles back on itself. You hum it to yourself until you know it by heart.` |

##### fox_at_the_gate (REWRITE)

| field | old | new |
| --- | --- | --- |
| text | `Three white tails, one dipped in ink, curl around a broken gargoyle. The fox has grown. She writes something on the gate stone with one paw: a door, and beneath it a smaller word, HURRY.` | `Three white tails, one tipped with a tiny bell, curl around a broken gargoyle. The fox has grown. She sings one clear note at the gate stone, and it hums back a door, and then, faintly, HURRY.` |
| O1.0 | `She writes better on each of you, in a cramped, careful hand, and it holds. The ache goes out of your bones as if it had never been written in.` | `She sings over each of you, a small, careful lullaby, and it holds. The ache goes out of your bones as if it had never been sung in.` |
| O2.0 | `She presses a paw to the flat of your hand. The ink dries into a stone the colour of the last light in the grove. 'For luck,' she says, which, for a fox, is practically a speech.` | `She presses a paw to the flat of your hand. The note in it settles into a stone the colour of the last light in the grove. 'For luck,' she says, which, for a fox, is practically a speech.` |
| O3.0 | `She thinks very hard, writes one word on the gate, and steps back. The word is RELIC. Something small and brass drops out of the stone, still warm, looking faintly surprised.` | `She thinks very hard, sings one long note at the gate, and steps back. The note rings like a bell. Something small and brass drops out of the stone, still warm, looking faintly surprised.` |
| O3.1 | `She thinks very hard, writes something long, smudges the ending, and looks deeply embarrassed. A good deal of ink runs down the wall onto your boots. You collect what you can.` | `She thinks very hard, sings something long, cracks on the high note, and looks deeply embarrassed. A good deal of echo rolls down the wall and around your boots. You collect what you can.` |

##### kill_your_darlings (REWRITE)

| field | old | new |
| --- | --- | --- |
| title | `Notes in Red Pen` | `Notes from the Podium` |
| text | `The corridor walls are covered in neat red-pen comments. Show, don't tell. Cut for length. Too many adjectives. Beside a sketch of your party, in capitals: NEEDS WORK.` | `A rehearsal hall, chairs in neat rows. From an empty podium a dry voice gives notes on a loop. Too loud. Too slow. Cut the solo. Then, clearly about your party: NEEDS WORK.` |
| L0 | `Kill your darlings` | `Cut your favourite solo` |
| O0.0 | `A card fades from the deck like a word struck out, and the red pen, thorough, strikes at you as well. The comments rustle approvingly. Someone leaves fifteen gold at your feet, as if for good homework.` | `A card fades from the deck like a note cut off, and the baton, thorough, raps at you as well. The empty chairs creak approvingly. Someone leaves fifteen gold at your feet, as if for good practice.` |
| L1 | `Show, do not tell` | `Play it, do not explain` |
| O1.0 | `You act it out instead, loudly. It is brave, and it stings, and the card you were thinking of is better for it.` | `You play it instead, loudly. It is brave, and it stings, and the card you were thinking of is better for it.` |
| L2 | `Write a comment of your own` | `Give a note of your own` |
| O2.0 | `You write THIS IS FINE in the margin, in your best hand. The wall recoils in one satisfying rustle, and a little of its ink runs down and pools in your favour.` | `You call THIS IS FINE at the podium, in your best voice. The hall recoils in one satisfying echo, and a little of it rolls back and pools in your favour.` |
| O2.1 | `You write ACTUALLY, NO. The comments argue back, all at once, in tiny capitals. Then they run out of room, fall silent, and drop something into your pocket to make you stop.` | `You call ACTUALLY, NO. The voice argues back, all at once, in tiny capitals. Then it runs out of breath, falls silent, and drops something into your pocket to make you stop.` |

##### unfinished_sentence (REWRITE)

| field | old | new |
| --- | --- | --- |
| title | `The Unfinished Sentence` | `The Unfinished Song` |
| text | `On a ruined wall a sentence stops mid-word: 'And then the hero, who had never once been afraid, s'. There is a pen on the floor, still warm. The rest of the wall is bare.` | `In a ruined room a music box sings one line and stops mid-word: 'And then the hero, who had never once been afraid, s'. A flute lies on the floor, still warm. The rest is silence.` |
| O0.0 | `'...stood up.' The pen glows red-gold. Hot ink runs down your arm and into your deck, and a card comes out better.` | `'...stood up.' The flute glows red-gold. Hot sound runs down your arm and into your deck, and a card comes out better.` |
| O2.0 | `'...read ahead.' A drawer you had not noticed slides open, and inside are a few pages nobody thought to cut.` | `'...listened ahead.' A drawer you had not noticed slides open, and inside are a few tunes nobody thought to cut.` |
| O2.1 | `'...read ahead.' A drawer slides open, and beneath the ordinary pages lies one written in a very good hand indeed.` | `'...listened ahead.' A drawer slides open, and beneath the ordinary tunes lies one sung in a very good voice indeed.` |
| O3.0 | `Some sentences are better left open. You leave the pen where it lay. The Blank, respecting this, gives you a wide berth and a little ink.` | `Some songs are better left open. You leave the flute where it lay. The Hush, respecting this, gives you a wide berth and a little echo.` |

##### void_tear (LIGHT)

| field | old | new |
| --- | --- | --- |
| text | `A tear in the sky, white and perfectly silent. Words drift toward it and vanish: 'the', 'and', half of 'mercy'. The wind smells of nothing. Nothing, it turns out, has a very specific smell.` | `A tear in the sky, grey and perfectly silent. Sounds drift toward it and vanish: a bird's call, a bell, half of a laugh. The wind smells of nothing. Nothing, it turns out, has a very specific smell.` |
| O0.0 | `The world is one long white breath. You come out the far side with your map overshot by a good eight hexes, and something small and blank tucked into your deck.` | `The world is one long grey breath. You come out the far side eight hexes on, with something small and silent tucked into your deck.` |
| O0.1 | `The white lasts longer than you thought. You come out with less map and more smudge.` | `The grey lasts longer than you thought. You come out with less road and more clutter.` |
| O1.0 | `You hold up whatever regret you have been carrying. The tear takes it gently, the way a cat takes a fish, and gives back a little ink out of politeness.` | `You hold up whatever regret you have been carrying. The tear takes it gently, the way a cat takes a fish, and gives back a little echo out of politeness.` |

##### lightning_rod (LIGHT)

| field | old | new |
| --- | --- | --- |
| O3.0 | `You ground it. The storm sulks, then sighs and lets the matter drop. A little static sparks off your fingertips and settles as ink.` | `You ground it. The storm sulks, then sighs and lets the matter drop. A little static sparks off your fingertips and settles as a low, friendly hum.` |

##### censor_office (LIGHT)

| field | old | new |
| --- | --- | --- |
| title | `The Office of Revisions` | `The Office of Silence` |
| text | `A tidy desk in a storm. A clerk with a black bar where his eyes should be stamps a form, reads it, stamps it again. 'Request for revision?' he says. 'Take a number. Or a stamp. Nobody is sure.'` | `A tidy desk in a storm. A clerk with a felt gag where his mouth should be stamps a form, reads it, stamps it again. 'Request for silence?' he mimes. 'Take a number. Or a stamp. Nobody is sure.'` |
| O0.0 | `The clerk stamps it three times. A card leaves your deck with the faintest sigh, as if being politely cropped out of a group portrait. 'Approved,' he says, and looks almost pleased. 'There is a filing fee.'` | `The clerk stamps it three times. A card leaves your deck with the faintest sigh, as if being politely hushed out of a group portrait. 'Approved,' he mimes, and looks almost pleased. 'There is a filing fee.'` |
| O1.1 | `He stamps you, at length. The stamp is heavier than expected, and so is its owner: a knight in a black-barred helm. It seems he was never a clerk at all.` | `He stamps you, at length. The stamp is heavier than expected, and so is its owner: a knight in a felt-stuffed helm. It seems he was never a clerk at all.` |

##### library_cat (REWRITE)

| field | old | new |
| --- | --- | --- |
| title | `The Cat on the Manuscript` | `The Cat on the Koto` |
| text | `In the ruins of a great library, a very fat cat sits on the last manuscript, washing one paw. The Blank has eaten the shelves around it. It has not eaten the cat. It has clearly not tried.` | `In the ruins of a great music hall, a very fat cat sits on the last koto, washing one paw. The Hush has eaten the hall around it. It has not eaten the cat. It has clearly not tried.` |
| O0.0 | `It allows this, closes its eyes, and warmth comes off it like a stove. Nothing is erased within three feet. You stay a while, and nobody is in a hurry.` | `It allows this, closes its eyes, and purrs like a stove. Nothing goes quiet within three feet of it. You stay a while, and nobody is in a hurry.` |
| O1.0 | `It eats, or half eats, or thoughtfully considers eating. In gratitude it stands, stretches, and leaves you a brush it had been sitting on. You did not notice the brush.` | `It eats, or half eats, or thoughtfully considers eating. In gratitude it stands, stretches, and leaves you a song it had been sitting on. You did not notice the song.` |
| O2.0 | `It moves like water, with contempt. Under it lie a few clean pages, still crisp from never being read.` | `It moves like water, with contempt. Under it, the koto still holds a few tunes in its strings, never once played.` |
| O2.1 | `It moves, but not before it bites you, precisely, in the fleshy part of the thumb. Under it, a few clean pages.` | `It moves, but not before it bites you, precisely, in the fleshy part of the thumb. Under it, a few tunes still caught in the strings.` |

##### weeping_eraser (LIGHT)

| field | old | new |
| --- | --- | --- |
| text | `An eraser wraith kneels in a ring of white dust, weeping. Everything it touches vanishes, so it has tried very hard to touch nothing. It has, by now, run out of nothing.` | `A muffle wraith kneels in a ring of grey dust, weeping without a sound. Everything it touches goes silent, so it has tried very hard to touch nothing. It has, by now, run out of nothing.` |
| O0.0 | `You sit near it, not touching. It cries a little more, then a little less. At last it gives you the one sentence it could not bring itself to rub out.` | `You sit near it, not touching. It cries a little more, then a little less. At last it gives you the one sound it could not bring itself to smother.` |

##### suzu_cracked_binding (REWRITE)

| field | old | new |
| --- | --- | --- |
| title | `Suzu Hears the Binding` | `Suzu Hears the Strings` |
| text | `Suzu stops, one hand held against the air, listening. Deep under the stone, the book's spine is creaking, thread by thread. 'It is the binding,' she says quietly. 'It is coming loose. I think I can hold it.'` | `Suzu stops, one hand held against the air, listening. Deep under the stone, something huge is humming out of tune, string by string. 'It is the song itself,' she says quietly. 'It is coming loose. I think I can hold it.'` |
| L1 | `Help her pull the threads tight` | `Help her tighten the strings` |
| C1 | `Rope burn for both` | `String burn for both` |
| O1.0 | `It is rough work, all splinters and thread. Both your hands are raw by the end, and the book feels, from the inside, very slightly more like a book.` | `It is rough work, all splinters and wire. Both your hands are raw by the end, and the song feels, from the inside, very slightly more like a song.` |
| L2 | `Leave it to the Author` | `Leave it to the Singer` |

##### paper_boat_prayers (LIGHT)

| field | old | new |
| --- | --- | --- |
| text | `Thousands of paper boats drift through the storm clouds, each carrying a candle and a single word, every candle out. Somebody folded them all by hand, in one night. They are waiting.` | `Thousands of paper boats drift through the storm clouds, each carrying a candle and a tiny bell, every candle out, every bell still. Somebody folded them all by hand, in one night. They are waiting.` |
| C0 | `1 Ink` | `1 Echo` |
| O0.0 | `The flame catches. The word on the boat is HOME, and something in the party remembers the shape of it. The light travels a long way before it goes.` | `The flame catches, and the bell rings one word: HOME. Something in the party remembers the shape of it. The light travels a long way before it goes.` |
| L1 | `Read the words` | `Ring the bells` |
| O1.0 | `Hope. Sorry. Later. Please. Mine. Wait. Home. Whoever wrote them meant every one.` | `Hope. Sorry. Later. Please. Mine. Wait. Home. Whoever tuned them meant every one.` |
| O2.0 | `You fold one inside your coat. It weighs nothing and warms one hip. Later, on the road, it unfolds a little, into a brush.` | `You fold one inside your coat. It weighs nothing and warms one hip. Later, on the road, it unfolds a little, and hums you a song.` |

##### waiting_room (REWRITE)

| field | old | new |
| --- | --- | --- |
| title | `Please Wait To Be Edited` | `Please Wait To Be Auditioned` |
| text | `A pristine waiting room with a ticket dispenser and a single chair. The sign says PLEASE WAIT TO BE EDITED. The chair is warm. Your ticket says you are number one.` | `A pristine waiting room with a ticket dispenser and a single chair. The sign says PLEASE WAIT TO BE AUDITIONED. The chair is warm. Your ticket says you are number one.` |
| O0.0 | `The clock strikes. Nothing happens. The Editor, you gather, is running behind. You keep the ticket. It is the only proof anyone was here.` | `The clock strikes. Nothing happens. The Conductor, you gather, is running behind. You keep the ticket. It is the only proof anyone was here.` |

##### jade_door (LIGHT)

| field | old | new |
| --- | --- | --- |
| O0.1 | `Behind it, a library the size of a closet, and one book with your party on the cover.` | `Behind it, a music room the size of a closet, and one song with your party's names in it.` |

##### wandering_storyteller (LIGHT)

| field | old | new |
| --- | --- | --- |
| O2.0 | `'Ah,' she says. 'Nobody knows. But I have heard the last page is blank, and I have heard it is not the bad kind.' She smiles as if she has told you nothing at all.` | `'Ah,' she says. 'Nobody knows. But I have heard the last note is a rest, and I have heard it is not the bad kind.' She smiles as if she has told you nothing at all.` |
| L1 | `Let Kuro correct her citations` | `Let Kuro correct her rhythm` |
| O3.0 | `You tell her about a fox and a kappa. She writes it down. 'That will do,' she says, and hands you a few coins for it.` | `You tell her about a fox and a kappa. She hums it back to you. 'That will do,' she says, and hands you a few coins for it.` |

##### weary_travellers (LIGHT)

| field | old | new |
| --- | --- | --- |
| text | `Three travellers share a small fire and a smaller pot of soup. They wave you over without asking who you are, which, in a book, is either great trust or great foreshadowing.` | `Three travellers share a small fire and a smaller pot of soup. They wave you over without asking who you are, which, in a song, is either great trust or great foreshadowing.` |
| L1 | `Trade for a brush` | `Trade for a song` |
| O1.0 | `One of them has a spare brush wrapped in an old scarf. 'Bought it from a hermit,' he says. 'Never had the nerve.'` | `One of them has a spare song wrapped in an old scarf. 'Learned it from a hermit,' he says. 'Never had the nerve to sing it.'` |

##### blank_patch (REWRITE)

| field | old | new |
| --- | --- | --- |
| title | `The Patch of White` | `The Patch of Silence` |
| text | `A patch of the road has gone white. Not snow: nothing. A butterfly flutters into it and does not come out. The edge of it is advancing, slowly, like a very patient tide.` | `A patch of the road has gone grey. Not fog: nothing. A cricket hops into it and stops mid-chirp. The edge of it is advancing, slowly, like a very patient tide.` |
| L0 | `Paint it back` | `Sing it back` |
| C0 | `2 Ink` | `2 Echo` |
| O0.0 | `You paint a wobbly stretch of road across the white. It holds, thin as a wish. On the far side the road remembers whom it belongs to.` | `You sing a wobbly stretch of road across the grey. It holds, thin as a wish. On the far side the road remembers whom it belongs to.` |
| O0.1 | `You paint a wobbly stretch of road across the white, and it takes, all at once, like a held breath let go. Where the patch stood, something small and bright is left behind.` | `You sing a wobbly stretch of road across the grey, and it takes, all at once, like a held breath let go. Where the patch stood, something small and bright is left behind.` |
| O1.0 | `Suzu presses a talisman to the edge. The Blank pauses, considers, and turns aside. She says nothing. She looks tired, and very, very good at this.` | `Suzu presses a talisman to the edge. The Hush pauses, considers, and turns aside. She says nothing. She looks tired, and very, very good at this.` |
| L2 | `Throw in a cursed page` | `Throw in a cursed card` |
| O2.0 | `The Blank eats it without chewing. Even it looks a little unwell afterward.` | `The Hush swallows it without chewing. Even it looks a little unwell afterward.` |
| O3.0 | `You step around it, keeping to the green. The white does not follow. It only waits, which is the Blank's whole personality.` | `You step around it, keeping to the green. The grey does not follow. It only waits, which is the Hush's whole personality.` |

##### scribes_bargain (REWRITE)

| field | old | new |
| --- | --- | --- |
| title | `The Scribe of Small Fates` | `The Busker of Small Fates` |
| text | `A tiny scribe, inked to the elbows, offers to edit your fate for a small fee. 'One line,' he says. 'Anything you like. No refunds, no repeats, and not the ending.'` | `A tiny busker, drumming a beat on an upturned bowl, offers to sing your fate a new line for a small fee. 'One line,' he says. 'Anything you like. No refunds, no encores, and not the ending.'` |
| O0.0 | `He writes: 'and they were very sturdy.' The ink dries on your ribs and tingles. Tomorrow you will be surprised how little a tree branch hurts.` | `He sings: 'and they were very sturdy.' The tune settles in your ribs and tingles. Tomorrow you will be surprised how little a tree branch hurts.` |
| O1.0 | `He writes: 'and they found a lot of gold.' Fate reads the line, says 'that is not how this works,' but a little of it leaks through.` | `He sings: 'and they found a lot of gold.' Fate hears the line, says 'that is not how this works,' but a little of it leaks through.` |
| O1.1 | `He writes it in the wrong ink. The gold, on reflection, was not yours.` | `He sings it in the wrong key. The gold, on reflection, was not yours.` |
| L2 | `Strike out a line` | `Cut a line` |
| O2.0 | `He strikes it out with a small silver knife, and it is gone before you can miss it. He charges nothing. He looks nearly fond of you.` | `He cuts it short with one sharp beat on the bowl, and it is gone before you can miss it. He charges nothing. He looks nearly fond of you.` |
| L3 | `Decline the pen` | `Decline the song` |
| O3.0 | `You decline. The scribe nods and blows on his fingers. 'Wise,' he says. 'Everyone wants a good ending. It does not work like that.'` | `You decline. The busker nods and taps out one last beat. 'Wise,' he says. 'Everyone wants a good ending. It does not work like that.'` |

##### raiga_storm_laugh (LIGHT)

| field | old | new |
| --- | --- | --- |
| text | `Raiga throws back his head and laughs for no reason at all, and everything within earshot laughs with him. The Blank, which had been creeping toward the path, stops. It seems, for a moment, to be listening.` | `Raiga throws back his head and laughs for no reason at all, and everything within earshot laughs with him. The Hush, which had been creeping toward the path, stops. It seems, for a moment, to be listening.` |


### 10. Achievements, Tempo Trials and tips (data_meta.js)

All checked: achievement names 5 to 28 and texts 15 to 100 with their numbers and "Trial N"; trial names at most 24 and texts 20 to 96
quoting their mods under the Echo regexes of section 13; tips 30 to 110 chars with no digits, and the joined tips contain every required
word once `ink` and `brush` become `echo` and `song`. Tip 0 is the one `screen_menu.js` HOWTO page `map` looks up by regex.

##### Achievements (ids and stats and rewards unchanged; `reward.inkstones` key stays)

| id | old name | new name | old text | new text |
| --- | --- | --- | --- | --- |
| ch1_clear | `Out of the Grove` | `Out of the Grove` | `Defeat Kuzunoha, the Nine-Tail Ink Fox, and turn the first page.` | `Defeat Kuzunoha, the Nine-Voiced Fox, and end the first verse.` |
| ch3_clear | `The Last Page` | `The Last Note` | `Defeat the Editor and rewrite the ending.` | `Defeat the Conductor and sing the ending.` |
| first_draft | `First Draft` | `First Rehearsal` | `Finish your first run, win or lose. Every book starts somewhere.` | `Finish your first run, win or lose. Every journey starts somewhere.` |
| regular_reader | `Regular Reader` | `Regular Listener` | `Finish 10 runs. The book is starting to recognise you.` | `Finish 10 runs. The land is starting to recognise your voice.` |
| happy_endings | `Happy Endings` | same | `Win 5 runs. Some tales are worth telling more than once.` | `Win 5 runs. Some journeys are worth taking more than once.` |
| ink_and_insight | `Ink and Insight` | `Flute and Insight` | `Win 3 runs with Kuro in the party.` | same |
| cartographer | `Cartographer of Ink` | `Cartographer of Echoes` | `Paint 500 hexes across all your runs.` | `Wake 500 hexes across all your runs.` |
| brush_collector | `Brush Collector` | `Song Collector` | `Use 25 one-use brushes.` | `Sing 25 Songs on the map.` (25 characters: the bare `Sing 25 Songs.` is 14, under the 15 minimum) |
| fable_fan | `Fable Fan` | same | `Read 60 fables. Some of them were even true.` | `Hear 60 fables. Some of them were even true.` |
| pest_control | `Pest Control` | same | `Defeat 500 creatures of the tale.` | `Defeat 500 creatures of the land.` |
| one_big_sentence | `One Big Sentence` | `One Big Crescendo` | `Deal 100 damage in a single turn.` | same |
| free_verse | `Free Verse` | same (kept: now a perfect pun, and a named genre like jazz would break the folklore setting) | `Play 3 or more free cards in one turn, on 10 different turns.` | same |
| minimalist_author | `Minimalist Author` | `Minimalist Composer` | `Win a run with 15 cards or fewer. Every word earns its place.` | `Win a run with 15 cards or fewer. Every note earns its place.` |
| charity_case | `Charity Case` | same | `Be rescued by the book's mercy 3 times. It happens to the best of us.` | `Be rescued by the land's mercy 3 times. It happens to the best of us.` |
| daily_reader | `A Tale a Day` | `A Jam a Day` | `Play 5 Daily Tales.` | `Play 5 Daily Jams.` |
| inkling | `Inkling` | `First Beat` | `Win a run on Ink Trial 1.` | `Win a run on Tempo Trial 1.` |
| ink_adept | `Ink Adept` | `Tempo Adept` | `Win a run on Ink Trial 5.` | `Win a run on Tempo Trial 5.` |
| master_of_ink | `Master of the Ink` | `Master of Tempo` | `Win a run on Ink Trial 10. The Red Pen bows.` | `Win a run on Tempo Trial 10. The Red Baton bows.` |

Unchanged: ch2_clear, petal_and_steel, moonlit_vigil, thunder_and_laughter, treasure_hunter, curio_cabinet, big_spender, jewellers_eye, champion_hunter, not_a_scratch, wall_breaker, slow_burn, face_in_the_petals, musical_chairs.

##### Tempo Trials (ids, levels and mods unchanged)

| id | old name | new name | old text | new text |
| --- | --- | --- | --- | --- |
| trial_3 | `Slow Mending` | same | `Camp rests, healing fables and chapter healing restore 15% less.` | `Camp rests, healing fables and verse healing restore 15% less.` |
| trial_4 | `Thin Ink` | `Faint Echo` | `Every chapter begins with 1 less Ink.` | `Every verse begins with 1 less Echo.` |
| trial_6 | `Shallow Wells` | `Cracked Bells` | `Ink wells give 1 less Ink, and fallen heroes rise with 15% HP, not 25%.` | `Temple bells give 1 less Echo, and fallen heroes rise with 15% HP, not 25%.` |
| trial_10 | `The Red Pen` | `The Red Baton` | `Enemies hit 10% harder, and card rewards offer one card fewer.` | same |

##### Tips (array index, 0 based)

| i | old | new |
| --- | --- | --- |
| 0 | `Painting a hex costs Ink. Wells, kills and Meditate at camp all give it back.` | `Waking a hex costs Echo. Temple bells, kills and Meditate at camp all give it back.` |
| 1 | `Brushes paint whole shapes for free. Save the long ones for when the boss is far away.` | `Songs wake whole shapes for free. Save the long ones for when the boss is far away.` |
| 2 | `You can only walk on painted hexes, but you can paint far ahead: the game finds the cheapest chain for you.` | `You can only walk on woken hexes, but you can wake far ahead: the game finds the cheapest chain for you.` |
| 6 | `If both heroes fall, the tale ends. Keep the front hero healthy and the back hero alive.` | `If both heroes fall, the journey ends. Keep the front hero healthy and the back hero alive.` (91 chars) |
| 23 | `Stranded with no Ink and no path? The book takes pity and gives you enough for one hex.` | `Stranded with no Echo and no path? The land takes pity and gives you enough for one hex.` |
| 24 | `Most kills refill a little Ink, and elites more. Minions give none. Fighting is how you cross the page.` | `Most kills refill a little Echo, and elites more. Minions give none. Fighting is how you cross the land.` |
| 28 | `Every hero hides a resource: Bloom, Sumi, Ward or Charge. Learn which cards build it and which spend it.` | `Every hero hides a resource: Bloom, Breath, Ward or Charge. Learn which cards build it and which spend it.` |
| 29 | `Ink Trials make the tale harder. Win one to unlock the next. The Daily Tale gives everyone the same seed.` | `Tempo Trials make the journey harder. Win one to unlock the next. The Daily Jam gives everyone the same seed.` (109 chars, inside 30 to 110) |


### 13. Test changes this lens forces (exact)

| File:line | Now | Change to |
| --- | --- | --- |
| `tests/rogue_book_narrative.test.mjs:195` | `if (certainInk > 0) t.ok(c.cost && /ink/i.test(c.cost), ...)` | `/echo/i` and message `a certain Echo price is shown in cost` |
| `narrative.test.mjs:452` | `startInk: (v, s) => new RegExp(Math.abs(v) + ' less Ink').test(s)` | `' less Echo'` |
| `narrative.test.mjs:454` | `new RegExp('wells give ' + Math.abs(v) + ' less Ink')` | `new RegExp('bells give ' + Math.abs(v) + ' less Echo')` |
| `narrative.test.mjs:476` | word list starts `['ink', 'brush', ...` | `['echo', 'song', ...` (rest unchanged; `fable`, `trial`, `daily`, `bloom` stay) |
| `narrative.test.mjs:494 to 519` | the spine test (Author, Blank, Editor, red pen, Keeper of the Last Page, turns back, footnote, binding, Author per hero, Blank recurs 6 times) | replace with the block below |
| `narrative.test.mjs:542` | the bookish Kuro regex (chapter, verse, ink, page, footnote, margin...), message `Kuro is bookish` | the musical regex in block B below, still at least 0.6, message `Kuro is musical` (the proposed 30 lines score 1.00) |
| `narrative.test.mjs` 179, 285, 384, 400, 420 | test names mention the Blank and Ink Trials | cosmetic: the Hush, Tempo Trials |
| `tests/rogue_book_content.test.mjs:720` | the cost check that matches 1 Ink or 2 Ink, then reads the digit with `/(\d) Ink/` | block C below (otherwise the check silently stops checking) |
| `content.test.mjs:854` | `startInk: /less Ink/, wellInk: /less Ink/` | `/less Echo/` for both |
| `content.test.mjs:862` | message `trial 10 never takes Ink to zero` | cosmetic: Echo |
| `tests/rogue_book_enemies_1.test.mjs:94` | `'The Nine-Tail Ink Fox'` | done in P1 (reads the roster title) |
| `tests/rogue_book_enemies_3.test.mjs:158 to 159` | `'Keeper of the Last Page'`, `'The Editor'` | done in P1 (reads the roster) |
| `enemies_3.test.mjs:200` | `n === 'Rub Through'` | `n === 'Smother'` (P2, agent 2D) |
| `tests/rogue_book_game.test.mjs:674` | `/Once, a Book/` | done in P1 (reads `DATA.lore.intro.title`) |
| `tests/rogue_book_cards_kuro.test.mjs:119` | id must equal `kuro_` + snake(name) | done in P1 (frozen id list, plan 8.2) |
| `tests/rogue_book_screen_end.test.mjs:274` and the `/Turn the page/` clicks | `'CHAPTER ONE COMPLETE'`, `/Turn the page/` | clicks done in P1 (`[data-act=turn]`); 274 `'VERSE ONE COMPLETE'` in P3 (Appendix C) |
| `tests/rogue_book_screen_map.test.mjs:1695`, `screen_menu.test.mjs:723` | `/Chapter I/`, `/Chapter 1: /` | P3 (Appendix C): `/Verse I/`, `/Verse 1: /`; `/Whispering/` stays |
| `tests/rogue_book_lib.test.mjs:205` | `'INKWOVEN -- a rogue storybook'` | P3: `'ECHOWAKE: a rogue ballad'` |

Block B (narrative.test.mjs:542, Kuro's bark regex):

```js
t.ok(frac('kuro', /verse|chorus|flute|note|\bbars?\b|scene|song|sing|sung|tune|tempo|key|crescendo|cadence|coda|score|solo|spotlight|curtain|applause|perform|play|listen|\brest\b|melody|harmony|rhythm|beat|encore|review|singer|echo|reprise|seats|musical/i) >= 0.6, 'Kuro is musical');
```

Block C (content.test.mjs:720, Echo costs are charged in every outcome):

```js
if (/\b1 Echo\b|\b2 Echo\b/.test(c.cost || '')) { const n = Number(/(\d) Echo/.exec(c.cost)[1]); if (!c.out.every((o) => A(o.ops).some((x) => x.op === 'ink' && x.n === -n))) bad.push(`${e.id}[${ci}]: cost "${c.cost}" is not charged in every outcome`); }
```

Replacement for the spine test (narrative.test.mjs 494 to 519). It is exactly what the proposed pages in section 8 pass (checked):

```js
t.test('lore is the spine: the Singer, the Hush, the Conductor, each keeper who held on, each hero and why they were sung', () => {
  const T = (id) => DATA.lore[id].text;
  t.ok(/Singer/.test(T('intro')) && /Hush/.test(T('intro')), 'the intro names the Singer and the Hush');
  t.ok(/two voices/.test(T('intro')), 'and the two who wake');
  t.ok(/yamabiko/.test(T('intro')) && /held a breath/.test(T('intro')), 'the Hush is a held breath in the shape of a yamabiko');
  t.ok(/Grove/.test(T('ch1_intro')) && /fox/.test(T('ch1_intro')) && /nine/.test(T('ch1_intro')), 'verse 1 introduces the grove and the fox');
  t.ok(/Lantern City/.test(T('ch2_intro')) && /silk/.test(T('ch2_intro')) && /holds/.test(T('ch2_intro')), 'verse 2 introduces the city and the one who holds it together');
  t.ok(/Citadel/.test(T('ch3_intro')) && /red baton/.test(T('ch3_intro')) && /Keeper of the Last Note/.test(T('ch3_intro')), 'verse 3 introduces the citadel and the Keeper');
  t.ok(/Kuzunoha/.test(T('ch1_clear')) && /walls/.test(T('ch1_clear')), 'the fox held the sounds and sang walls');
  t.ok(/Jorogumo/.test(T('ch2_clear')) && /kept/.test(T('ch2_clear')), 'the spider held the people and kept them');
  t.ok(/Conductor/.test(T('victory')) && /perfect/.test(T('victory')) && /Singer/.test(T('victory')) && /again/.test(T('victory')), 'the victory reveals the Conductor speaks with the Singer\'s voice (he is the Singer\'s doubt) and the land asks to be sung again');
  t.ok(/the last line together/.test(T('victory')) && /open/.test(T('victory')), 'the ending is sung together and left open');
  t.ok(/fade|grey/.test(T('defeat')) && /comes back around/.test(T('defeat')) && !/dead|die|kill/i.test(T('defeat')), 'defeat is soft: the beat comes back around, nobody dies');
  t.ok(/silver hair/.test(T('ch1_clear')) && /shrine/.test(T('ch1_clear')), 'the end of verse 1 points at Suzu, who unlocks now');
  t.ok(/storm|thunder/.test(T('ch2_clear')) && /knuckles/.test(T('ch2_clear')), 'the end of verse 2 points at Raiga, who unlocks now');
  const hero = { hanae: /first bar|hero/, kuro: /harmony/, suzu: /shrine|bell|tune/, raiga: /thunderstorm|laugh/ };
  L.heroIds.forEach((h) => {
    const l = DATA.lore['hero_' + h];
    t.ok(new RegExp(h[0].toUpperCase() + h.slice(1)).test(l.text) && l.title.toLowerCase().indexOf(h) === 0, `hero_${h} is about ${h}`);
    t.ok(/Singer/.test(l.text), `hero_${h} says why the Singer sang them`);
    t.ok(hero[h].test(l.text), `hero_${h} carries their signature imagery`);
    t.ok(l.title.indexOf(DATA.heroes[h].title.replace(/^The /, '')) >= 0, `hero_${h} title carries the hero title from DATA.heroes`);
  });
  const all = stories.map((s) => s.text).join(' ');
  t.ok(all.split('Hush').length >= 6, 'the Hush recurs through the pages');
  t.ok(!/Hanae|Kuro|Suzu|Raiga/.test([T('intro'), T('ch1_intro'), T('ch2_intro'), T('ch3_intro'), T('ch1_clear'), T('ch2_clear'), T('victory'), T('defeat')].join(' ')), 'the shared story pages never name a hero (the party is chosen by the player)');
  t.ok(all.length > 6000, 'a lot of story');
});
```

Recommended new guard (narrative.test.mjs, section 1b), so the old theme cannot creep back. Scan ONLY prose fields (event `title`, `text`, choice `label`, `cost`, outcome `text`; lore `title`, `text`, bark lines; achievement `name`, `text`; trial `name`, `text`; tips), never ids or op names (op names `ink` and `paint` are mechanics ids and must stay):

```js
const OLD = /\b(ink|inks|inked|inky|brush|brushes|pages?|books?|author|blank|quill|scrolls?|write|writes|writing|written|wrote|paint|painted|painting)\b/i;
```

With the proposals in this file every one of those prose strings passes (checked; the kept fables only contain "small print", "handwriting" and "blanket", none of which match).

### 14. Style guide and glossary for writers

#### 14.1 Voice

- Shonen adventure meets folklore melancholy: warm, dramatic, a little funny, never mean, never crude (CONTENT_SPEC 1). Short sentences. A fairy tale told aloud by someone who loves the characters.
- Sound is the sensory anchor. When something good happens, something rings, hums, chimes, laughs, chirps or sings. When the Hush wins, things go grey, soft, still, muffled. Describe the Hush by absence, never as evil: it is polite, patient, hungry, and in the end a breath held too long.
- Nobody dies in the frame story. Defeat is a rest in the music: "once more from the top".
- Hero voices: Hanae dry and proud (no shouting), Kuro musical and teasing with a straight face (no shouting), Suzu soft and steady (never raises her voice), Raiga booming and kind ("friend", "HA!", thunder).
- British spelling: colour, armour, honour, favour, grey, centre, defence, realise, recognise, apologise, travellers, jewellers.

#### 14.2 House rules for anything written (code, copy, docs, tests)

- NEVER an em dash or an en dash. In player copy also never ` - `, ` -- ` or `--` as a dash: use a comma, a colon or a full stop. Hyphens inside compounds (red-gold, mid-word) are fine.
- No tab indentation, no curly quotes, no double spaces, printable ASCII only, a space after punctuation.
- Never write the literal text of the forbidden random function call in docs or comments (refer to "the banned random call" or `U.rng`).
- Numbers: tips contain no digits at all; fables only state gold or hexes that the ops really give; achievement and trial texts quote their own numbers.
- Limits: section 2 table.

#### 14.3 Words to avoid in player-facing text

| Avoid | Use instead |
| --- | --- |
| ink, inky, Ink (currency) | Echo (currency, capital E); echo (the sound) |
| paint, painted, painting (hexes) | wake, woken, waking; "wake a hex", "woken ground" |
| brush, Brush, brushes | Song, Songs (the one-use tools: Drum Line, Ripple, Shout, Beat Drop, Chorus, Hum) |
| page, pages, blank paper | verse, the land, grey (silent) hexes |
| book, the Living Book, storybook, bookmark | the land, the Great Song, the song |
| author, the Author | the Singer |
| blank, the Blank | the Hush (always "the Hush", capital H); grey, silent, still |
| quill, pen, red pen, nib | flute, baton, the red baton |
| scroll, manuscript, library, archive | music hall, music box, koto, instrument; the the Hall of Echoes (meta) |
| write, wrote, written, writing, rewrite, unwrite, handwriting | sing, sang, sung, hum, play, call; unsing |
| edit, editor, edition, draft, redraft, proofread, revision, strike through, redacted, typo, scribble, doodle, footnote, margin, sentence (grammar) | rehearse, conduct, the Conductor, audition, cut off, tune, retune, muffle, smother, sour note, off key, harmony, rest |
| chapter | verse (Verse I, II, III) |
| Inkstones | Chimes |
| Ink Trials, the Red Pen | Tempo Trials, the Red Baton |
| Daily Tale | Daily Jam |
| tale (meaning a run) | journey (UI); the land (the world, in UI); the Great Song / the song (the world, lore only) |
| erase, eraser, smudge, blot | silence, damper, muffle, mumble, static |

Allowed with care: paper (paper lanterns, paper boats, paper cranes, paper puppets are folk craft, not books); fable, story, tale (oral tradition: a storyteller telling a tale aloud is on theme; just do not use them for the world or a run); read (reading an intent, a menu or a sign is fine; never reading the world); word (spoken words are fine).

#### 14.4 Words to use (musical and folklore palette)

Echo, wake, ring, chime, toll, hum, sing, chant, lullaby, refrain, chorus, verse, bar, beat, rest, note, chord, key, tune, tempo, rhythm,
melody, harmony, cadence, coda, crescendo, encore, reprise, rehearse, audition, cue, solo, duet, festival, drum, taiko, flute, shakuhachi,
shamisen, koto, temple bell, furin wind chime, kodama (folklore echo spirits), grey, still, quiet, muffled, felt, held breath, the Hush,
the Singer, the Great Song, the Conductor, the Damper, Keeper of the Last Note, the Thunderless Citadel, yamabiko, kuchi shoga, Ballads.

Rule: folklore nouns, musician verbs. Musical terms (tempo, coda, remix, jam, verse, chorus) are fine; named genres (jazz, blues, rock)
and real places are not, they break the yokai setting.

#### 14.5 Capitalisation sheet

Echo (currency) / echo (sound). Songs and each Song name. Temple Bell (tile) / temple bells (prose). Tempo Trial 1 to 10. Daily Jam. Chimes.
Hall of Echoes. Verse I, II, III / "the first verse". the Hush. the Singer. the Great Song / the song (lore only). the Conductor, the Damper. Ballads (the story collection). Fable.

---

## Appendix B. UI copy per presentation file, book visuals owned by presentation files, internal ids to keep

Source: the UI copy lens, with the planner's decisions applied (Verse, Hall of Echoes, Fable kept, Dead Silence, Keeper, joins the band, Ballads, INTRO/OUTRO, seal REST, no lowercase "song" in UI copy). Columns: line at a2bd24b, current text, new text, the test that asserts it (exact edits in Appendix C). Rows marked keep stay. A row whose new text equals the current text means keep. Section numbers inside are this appendix's own (3.x per file, 4 visuals V1 to V14, 5 internal ids).

### 3. The inventory, file by file

Legend: `TEST x:n` = asserted by `tests/rogue_book_x.test.mjs` line n (section 6 has the exact edit). Every row tagged `CH` in the source inventory is now REQUIRED (Chapter becomes Verse). `DATA` = the text comes from data, listed for context. Strings not listed are theme-neutral (Deck, Fit,
Zoom, Continue, Back, Energy, Block, gems, statuses...) and stay as they are.

#### 3.1 `rogue_book/index.html`

| Line | Current | Proposed | Test |
|---|---|---|---|
| 7 | favicon: inline SVG of an ink drop (`M16 4C16 4 7 14 7 20a9 9 0 0 0 18 0...`) | an inline SVG of a sound source and two arcs, same colours, must stay a `data:` URI (hygiene 188): `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%230d0b1e'/%3E%3Ccircle cx='9' cy='16' r='3.2' fill='%233a2589' stroke='%235ff5ff' stroke-width='1.6'/%3E%3Cpath d='M15 9.5a9 9 0 0 1 0 13' fill='none' stroke='%235ff5ff' stroke-width='2' stroke-linecap='round'/%3E%3Cpath d='M20 6a14 14 0 0 1 0 20' fill='none' stroke='%235ff5ff' stroke-opacity='.6' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E` | hygiene 188 (format only) |
| 8 | `<title>INKWOVEN -- a rogue storybook</title>` | `<title>ECHOWAKE: a rogue ballad</title>` | TEST lib:205 (exact) |
| 9 | meta description "Two heroes, one living book. Paint the fog away with ink, build a deck of gem-socketed cards, and rewrite the ending. An anime deckbuilding roguelike." | "Two heroes, one silent land. Wake the grey fog hex by hex with Echo, build a deck of gem-socketed cards, and break the Hush. An anime deckbuilding roguelike." | |
| 18-19 | boot splash `#boot i`: an ink drop with the `bootDrip` keyframes | a ring that pings outward (border 3px solid #5ff5ff, border-radius 50%, scale .4 to 1.6 and fade); rename keyframes to `bootPing` (internal) | |
| 42 | watchdog heading `'INKWOVEN'` | `'ECHOWAKE'` | |
| 43 | `'The book would not open. '` | `'The music would not start. '` | |
| 57 | `<div id="boot"><b>INKWOVEN</b>` | `<b>ECHOWAKE</b>` | |
| 69 | `<noscript>Inkwoven needs JavaScript.</noscript>` | `Echowake needs JavaScript.` | |

#### 3.2 `rogue_book/gallery.html` (developer art sheet viewer)

| Line | Current | Proposed |
|---|---|---|
| 6 | `<title>INKWOVEN gallery</title>` | `<title>ECHOWAKE gallery</title>` |
| 7 | favicon ink drop | same favicon as index.html |
| 229 | `'INKWOVEN gallery'` | `'ECHOWAKE gallery'` |
| 254 | background option value `paper` | keep (internal option, a dev tool) |

#### 3.3 `js/ui.js`

| Line | Current | Proposed | Test |
|---|---|---|---|
| 246, 247 | `Play anyway`, `Full screen and rotate` | keep | TEST ui:118 (Play anyway) |
| 259 | rotate panel art `.rot-book` with three page leaves `rp1..rp3` and a phone | keep the classes, restyle in `css/base.css` as a phone with three sound arcs (section 4) | |
| 261, 263 | `Turn your device sideways` | keep | TEST ui:118, browser:275 |
| 264 | `Inkwoven is a landscape tale. Rotate your phone and the page will open wide.` | `Echowake is a landscape journey. Rotate your phone and the land will open wide.` | |
| 480 | error modal title `Something tore the page` | `Something broke the rhythm` | TEST ui:210 |
| 482 | `The tale hit a snag in X. Everything up to your last save is safe.` | `The music skipped a beat in X. Everything up to your last save is safe.` | |
| 536, 820 | `This page of the book is still being written.` | `This part of the music is still being written.` | ui:246, ui:369 still match `/still being written/` (no edit) |
| 743 | transition tip header `- A HINT FROM THE MARGINS -` | `- A NOTE FROM THE ROAD -` | |
| 1617 | card back word `INKWOVEN` (plus `.back-drop` ink drop) | `ECHOWAKE` (and re-skin `.back-drop`, section 4) | |
| 1697 | `STAT_TIP.ink: ['Ink', null]` (tooltip text comes from `DATA.keywords.ink`) | `['Echo', null]` | |
| 1698 | `STAT_TIP.brush: ['Brushes', null]` (text from `DATA.keywords.brush`) | `['Songs', null]` | |
| 1698 | `STAT_TIP.inkstone: ['Inkstones', 'Earned every run. Spend them in the Library to unlock new content.']` | `['Chimes', 'Earned every run. Spend them in the Hall of Echoes to unlock new content.']` | |
| 1992 | basic relics overlay `No treasures yet. Elites, chests and shops hold them.` | keep (replaced by screen_map's overlay at runtime) | |
| 2007 | `Your deck (` | keep | |
| 692-718 `paintInk`, 720-736 `paintPage` | transition visuals: ink blobs (`INK_BLOBS`), a paper sheet with ruled lines | re-skin (section 4); keep the kind ids `'ink'` and `'page'` | ui:298, 318, 340; screen_combat:157 assert the ids |

`UI.stat(kind)` aria labels read `STAT_TIP[kind][0]`, so the HUD pills on node pages, the pause card and combat become "Echo 7/14",
"Songs 2" and "Chimes 200" with the three edits above.

#### 3.4 `js/main.js`

Real flow (always player-facing):

| Line | Current | Proposed | Test |
|---|---|---|---|
| 100 | `Progress cannot be saved in this browser` | keep | |
| 104 | `This tale already ended in another window. Nothing more will be kept.` | `This journey already ended in another window. Nothing more will be kept.` | |
| 135 | `'+' + n + ' Inkstones for the tale you set down'` | `'+' + n + ' Chimes for the journey you set down'` | |
| 153 | `The tale could not begin (RUN is not ready)` | `The journey could not begin (RUN is not ready)` | |
| 168 | `There is no saved tale to continue` | `There is no saved journey to continue` | TEST ui:1147 |
| 177 | well instant toast `'The well refills your Ink' + ' (+' + n + ')'` (when RUN gives no `node.toast`) | `'The temple bell rings' + ' (+' + n + ' Echo)'` | TEST ui:1042 (`/well/i` -> `/bell/i`) |
| 178 | `'You take a brush' + ': ' + name` | `'You learn a Song' + ': ' + name` | TEST ui:1044 (`/brush/i` -> `/song/i`) |
| 262 | abandon confirm `Abandon this tale?` / `The run ends here. You keep a share of the Inkstones for the pages you wrote.` / `Abandon` / `Keep playing` | `Abandon this journey?` / `The run ends here. You keep a share of the Chimes for the hexes you woke.` / keep / keep | TEST menu:1260 |
| 267 | toast `'+' + n + ' Inkstones'` | `'+' + n + ' Chimes'` | TEST ui:1132 |
| 846, 852 | `Achievement: `, `Unlocked: ` | keep | |

Placeholder screens (registered only when a real screen file failed to register; still player-facing in a broken load) and the
`?gallery` component sheet. Low priority, but keep them consistent so a grep for the old words comes back empty:

| Line | Current | Proposed |
|---|---|---|
| 556 | `Heroes: `, `Chapter `, `Score `, ` Inkstones` | `Verse `, ` Chimes` |
| 572 | `Placeholder X screen. The real one arrives in a later wave.` | keep |
| 590-593 | `Continue`, `New Tale`, `Daily Tale`, `Library`, `Settings`, `How to play` | `New Journey`, `Daily Jam`, `Hall` |
| 594 | logo `INKWOVEN`, sub `a rogue storybook` | `ECHOWAKE`, `a rogue ballad` |
| 604 | `Begin the tale` | `Begin the journey` |
| 610 | `Locked: finish an earlier chapter to write this hero into the book` | `Locked: finish an earlier verse to wake this hero` |
| 614 | `X and Y step onto the page.` | `X and Y step into the silence.` |
| 622 | `Ink Trial` | `Tempo Trial` |
| 634 | node buttons `Fight Elite Shop Camp Fable Chest Forge Gem cache Boss` | `Fable` -> `Fable` |
| 639 | `Chapter N: the map (placeholder)` | `Verse N: the map (placeholder)` |
| 664 | `' Ink'` | `' Echo'` |
| 671 | `A fable` | `A fable` |
| 673 | `The inkstone forge` | `The tuning forge` |
| 681 | `Chapter N complete`, `The page turns.` | `Verse N complete`, `The music swells.` |
| 686 | `The tale ends` | `The music rests` |
| 690 | `The last page is rewritten` | `The Hush lets go` |
| 699 | `A page`, `Once upon a time...`, `Turn the page` | `A verse`, `Once, the land could sing...`, `Play on` |
| 709 | how-to lines `Paint the fog away with Ink to reveal hexes, then walk onto them.` / `Reach the chapter boss and rewrite the ending.` | `Wake the grey fog with Echo to reveal hexes, then walk onto them.` / `Reach each verse's keeper and break the Hush.` |
| 729 | `Paint hexes with Ink, fight with two heroes...Reach the boss of each chapter.` | `Wake hexes with Echo, ... Reach the keeper of each verse.` |
| 772 | gallery label `Paper panel` | keep (component name) |
| 803 | gallery toasts `The well refills your Ink (+4)`, `Achievement: First Ink` | `The temple bell rings (+4 Echo)`, `Achievement: First Echo` (match the data lens achievement name) |
| 806 | `A page has torn` / `Something went wrong in the tale, but your progress is safe. Turn back to the title and try again.` | `Something broke the rhythm` / `Something went wrong on the journey, but your progress is safe. Head back to the title and try again.` |
| 807 | `Abandon this tale?` / `...share of the Inkstones.` | `Abandon this journey?` / `...share of the Chimes.` |
| 817 | `INKWOVEN components: ` | `ECHOWAKE components: ` |
| 1 | header comment `Inkwoven -- GAME: ...` | `Echowake: GAME: ...` (every js and css header starts with "Inkwoven --": optional global rename, comments only, the hygiene suite only checks a header exists) |

#### 3.5 `js/screen_map.js` (the map HUD, info chip, refusals, legend, relics overlay)

HUD and banner:

| Line | Current | Proposed | Test |
|---|---|---|---|
| 149 | `chapterTitle` fallback `'Chapter ' + n` | `'Verse ' + n` | CH |
| 931 | Ink meter label `.mp-ink-l` `Ink` | `Echo` | |
| 956 | meter aria `'Ink ' + n + ' of ' + max` | `'Echo ' + n + ' of ' + max` | |
| 959 | meter tip: `Ink` / `Resource` / `'Spend ' + cost + ' Ink to paint a hex next to the painted page. Wells, kills, camps and the Book itself refill it.'` | `Echo` / `Resource` / `'Spend ' + cost + ' Echo to wake a hex next to the awake land. Temple bells, kills, camps and the land itself refill it.'` | |
| 980 | chip tip kind `Brush`; extra `One use, then it is gone.` (`You hold N.` stays) | `Song`; `Sung once, then it fades.` | |
| 983 | empty tray `No brushes. Brush racks and champions hold them.` | `No Songs. Songbirds and champions teach them.` | TEST screen_map:377 |
| 1030 | banner `'Chapter ' + roman` (`.mp-ch`) | `'Verse ' + roman` | TEST screen_map:161 |
| 1034 | progress aria-label `Page painted` | `Land awake` | |
| 1043 | Legend tip `What every hex, brush and control means.` | `What every hex, Song and control means.` | |
| 1044 | Fit tip `See the whole page, or return to following the party.` | `See the whole land, or return to following the party.` | |
| 1052 | tray label `.mp-tray-l` `Brushes` | `Songs` | |
| 1064 | mode bar apply button `Paint` | `Sing` | TEST screen_map:398 |
| 1066 | mode bar aria `Brush mode` | `Song mode` | |
| 1088 | progress text `pct + '% painted'` | `pct + '% awake'` | TEST screen_map:162, 216 |
| 1090 | aria-valuetext `' hexes painted'` | `' hexes awake'` | |

Hex info chip (fixed size: name line, two text lines, two action lines; budgets in section 7):

| Line | Current | Proposed | Test |
|---|---|---|---|
| 1130 | brush rack content `'Holds the ' + name + '.'` | `'Teaches the ' + name + '.'` | |
| 1131 | well content `'Refills ' + n + ' Ink.'` | `'Rings back ' + n + ' Echo.'` | |
| 1155 | `No painted path leads there.` | `No awake path leads there.` | |
| 1156-1157 | the walk lines (`Walk toward it: ...`, `Walk: ...`, `Walk N steps, stops early.`, `Walk there: `, `Walk there and begin: `) | keep exactly | TEST screen_map:1199 pins them |
| 1161 | landmark name suffix `', seen'` (phone at Larger text) / `', glimpsed'` | `', heard'` in both branches | TEST screen_map:298, 302 |
| 1162 | fog name `Unwritten page`; text `Blank paper. Paint it to see what the tale holds.` | `Silent ground`; `Grey and still. Wake it to hear what it holds.` | TEST screen_map:298 |
| 1164 | `'Tap to paint: '` / `'Not enough Ink to paint: '` + cost + `' Ink.'` | `'Tap to wake: '` / `'Not enough Echo to wake: '` + cost + `' Echo.'` | TEST screen_map:298 (`/1 Ink/`) |
| 1168 | `'Tap twice to paint a chain of '`, `'Tap twice: a chain of '`, `'Too far for your Ink: a chain of '`, `'Too far: a chain of '`, `' costs '` | `'Tap twice to wake a chain of '`, keep, `'Too far for your Echo: a chain of '`, keep, keep | TEST screen_map:280 |
| 1190 | resting text `'Paint fog beside the page for ' + c + ' Ink, or tap painted ground to walk.'` / short `'Tap fog to paint it (' + c + ' Ink), tap painted ground to walk.'` | `'Wake fog beside the land for ' + c + ' Echo, or tap awake ground to walk.'` / `'Tap fog to wake it (' + c + ' Echo), tap awake ground to walk.'` | TEST screen_map:1185, 1186 |
| 1191 | `No Ink left to paint. Walk to a well, fight, or use a brush.` / `No Ink to paint. Walk to a well, or use a brush.` | `No Echo left to wake. Walk to a bell, fight, or sing a Song.` / `No Echo to wake. Walk to a bell, or sing a Song.` | |
| 1193 | phone action `Tap fog to paint, ground to walk.` / `No Ink: walk, or use a brush.`; desktop action `'Brushes: ' + n + ' ready.'` | `Tap fog to wake, ground to walk.` / `No Echo: walk, or sing a Song.` / `'Songs: ' + n + ' ready.'` | TEST screen_map:1186 (phone `/ground to walk\./` still matches) |
| 1194 | resting name `p.painted + ' of ' + p.total + ' hexes painted'` | `... + ' hexes awake'` | TEST screen_map:171, 1817, 1820 |

Feedback, refusals, the mercy rule:

| Line | Current | Proposed | Test |
|---|---|---|---|
| 1241, 1243, 2032 | mercy toast and announce `The Book lends a drop of Ink.` | `The land hums back one Echo.` | TEST screen_map:321 |
| 1328 | announce `'Revealed: ' + name + '.'` | keep | |
| 1340 | REASON_TEXT `done: 'This tale has ended.'` | `'This journey has ended.'` | |
| 1340 | `void: 'The Unwritten Void cannot be painted.'` | keep the DATA read from P1 and change only the words around it: `DATA.tiles.block.name + ' cannot be woken.'` (drop P1's `'The '`; reads "Dead Silence cannot be woken.") | TEST screen_map:292 (`/Void/` -> `/Dead Silence/`) |
| 1340 | `painted: 'That hex is already painted.'` | `'That hex is already awake.'` | |
| 1340 | `unreachable: 'No way to reach it through the Void.'` | `'No way to reach it through the silence.'` | |
| 1340 | `off: 'That is off the page.'`, `nomap: 'There is no page.'` | `'That is off the map.'`, `'There is no map.'` | |
| 1340 | `ink: 'Not enough Ink.'` | `'Not enough Echo.'` | TEST screen_map:270 (`/Ink/` -> `/Echo/`) |
| 1340 | `nobrush: 'You do not hold that brush.'`, `nothing: 'That would paint nothing new.'` | `'You do not know that Song.'`, `'That would wake nothing new.'` | |
| 1341 | `brush: 'That brush is unknown.'`, `dir: 'Aim the brush first.'`, `origin: 'That is not a place this brush can start.'`, `far: 'Too far from the painted page.'` | `'That Song is unknown.'`, `'Aim the Song first.'`, `'That is not a place this Song can start.'` (40 characters, phone budget 40), `'Too far from the awake land.'` | |
| 1353 | `'That needs ' + cost + ' Ink and you hold ' + ink + '.'` | `'That needs ' + cost + ' Echo and you hold ' + ink + '.'` | TEST screen_map:283 |
| 1369 | announce `'Painted ' + N + ' for ' + cost + ' Ink. ' + left + ' Ink left.'` | `'Woke ' + N + ' for ' + cost + ' Echo. ' + left + ' Echo left.'` | TEST screen_map:1766 |

Songs (brushes): mode bar, info chip, announcements:

| Line | Current | Proposed | Test |
|---|---|---|---|
| 1380 | ORIGIN_HINT `Start from a painted hex.` / `Start from a blank hex beside the painted page.` / `Start beside the painted page.` / `Start from a blank hex within 4 hexes of the party.` / `Start within 4 hexes of the party.` | `Start from an awake hex.` / `Start from a silent hex beside the awake land.` / `Start beside the awake land.` / `Start from a silent hex within 4 hexes of the party.` / keep | |
| 1398 | `You do not hold that brush.` | `You do not know that Song.` | |
| 1401 | `'The ' + name + ' has nowhere to paint right now.'` | `'The ' + name + ' has nowhere to wake right now.'` | TEST screen_map:461 |
| 1425 | `Brush put away.` | `Song set aside.` | |
| 1450 | `'Aim, then tap the arrow hex again to paint '`, `'Tap the arrow again to paint '`, `Nothing would paint that way. Aim elsewhere.`, `Nothing paints that way. Aim elsewhere.`, `'Tap the hex again or press Paint to fill '`, `'Tap again to fill '` | `...again to wake `, `...again to wake `, `Nothing would wake that way. Aim elsewhere.`, `Nothing wakes that way. Aim elsewhere.`, `'Tap the hex again or press Sing to wake '`, `'Tap again to wake '` | TEST screen_map:398 (`/Tap again|Paint/` -> `/Tap again|Sing/`) |
| 1454 | `...Hover for the shape, tap to paint.` / `Tap a glowing hex to paint.` | `...tap to sing.` / `Tap a glowing hex to sing.` | |
| 1457 | apply reason `Aim the brush at hexes it can paint` | `Aim the Song at hexes it can wake` | |
| 1458 | apply label `'Paint ' + n` / `'Paint'` | `'Sing ' + n` / `'Sing'` | TEST screen_map:427 |
| 1493 | `'Painting ' + ...`, `Nothing to paint that way.` (twice `'Painting '`) | `'Waking ' + ...`, `Nothing to wake that way.` | |
| 1495 | `'Tap to paint ' + ...` | `'Tap to wake ' + ...` | |
| 1511 | `'Brush anchored. Aim it, then tap to paint. Facing '` | `'Song anchored. Aim it, then tap to sing. Facing '` | |
| 1514 | `Aim the brush at hexes it can paint.` | `Aim the Song at hexes it can wake.` | |
| 1518, 1521, 1529 | `' would paint.'`, `'Nothing would paint.'`, `'Nothing would paint that way.'`, `' would paint. Tap again to apply.'` | `' would wake.'`, `'Nothing would wake.'`, `'Nothing would wake that way.'`, `' would wake. Tap again to apply.'` | |
| 1544 | `Pick a glowing hex for the brush to start from.` | `Pick a glowing hex for the Song to start from.` | |
| 1558 | announce `'The ' + name + ' paints ' + N + '.'` | `'The ' + name + ' wakes ' + N + '.'` | |

Walking, instants, the boss, keyboard:

| Line | Current | Proposed | Test |
|---|---|---|---|
| 1588 | `No painted path leads there.` | `No awake path leads there.` | |
| 1652 | float text `'+' + gained + ' Ink'` (well) | `'+' + gained + ' Echo'` | |
| 1672 | announce `'The well gives ' + n + ' Ink.'` / `'You take the ' + name + '.'` | `'The bell rings: ' + n + ' Echo.'` / `'You learn the ' + name + '.'` | |
| 1683 | announce `The chapter boss.` | `The keeper of this verse.` | |
| 1844 | `'A chain of ' + N + ' costs ' + c + ' Ink. '` + `'Tap it again to paint.'` | `... + ' Echo. '` + `'Tap it again to wake.'` | |
| 1870 | `You hold no brushes. Brush racks and champions carry them.` | `You know no Songs. Songbirds and champions teach them.` | TEST screen_map:457 |
| 1978 | empty page title `A blank page` | `Only silence` | TEST screen_map:185, 193 |
| 1979 | `There is no map to show. The page was never written, or the run is over.` | `There is no map to show. The land was never woken, or the run is over.` | |
| 1987 | intro `'Chapter ' + roman` | `'Verse ' + roman` | TEST screen_map:1695, 1708 |
| 2038 | announce `'Chapter ' + n + ', ' + title + '. ' + ink + ' Ink. ' + pct + ' percent painted.'` | `'Verse ' + n + ', ' + title + '. ' + ink + ' Echo. ' + pct + ' percent awake.'` | |

Relics overlay (`relicSource`):

| Line | Current | Proposed | Test |
|---|---|---|---|
| 2078 | matches RUN's log line `'Found ' + name + '.'` | keep (unless run.js changes that log text: then both together) | |
| 2080 | `Dropped by a chapter boss.` | `Dropped by a verse's keeper.` | TEST screen_map:1410 (`/chapter boss/i` -> `/keeper/i`) |
| 2083 | `'Found in Chapter ' + roman + ', '`; `Carried since the tale began.` | `'Found in Verse ' + roman + ', '`; `Carried since the journey began.` | TEST screen_map:1407, 1409 |

Legend overlay:

| Line | Current | Proposed | Test |
|---|---|---|---|
| 2184 | Mouse: `slide the page, with a little glide`, `Click fog beside the painted page`, `paint it for 1 Ink`, `preview the cheapest chain, click again to paint all of it`, `Click painted ground`, `back out of a brush or a preview` | `slide the land, with a little glide`, `Click fog beside the awake land`, `wake it for 1 Echo`, `preview the cheapest chain, click again to wake all of it`, `Click awake ground`, `back out of a Song or a preview` | |
| 2185 | Touch: `slide the page`, `Tap fog beside the page`, `paint it for 1 Ink`, `preview the chain, then paint it`, `Tap painted ground`, `Brush chip, glowing hex, aim, tap again`, `paint with a brush` | `slide the land`, `Tap fog beside the land`, `wake it for 1 Echo`, `preview the chain, then wake it`, `Tap awake ground`, `Song chip, glowing hex, aim, tap again`, `sing a Song` | |
| 2186 | Keyboard: `fit the whole page, again to follow the party`, `paint or walk to the cursor hex`, `pick a brush, Esc to put it away` | `fit the whole land, again to follow the party`, `wake or walk to the cursor hex`, `pick a Song, Esc to set it aside` | |
| 2192 | `Blank paper` / `'A hex nobody has painted. Paint it next to the painted page for ' + cost + ' Ink to see what it holds.'` | `Silent ground` / `'A hex nobody has woken. Wake it next to the awake land for ' + cost + ' Echo to hear what it holds.'` | TEST screen_map:1442 |
| 2193 | `Glimpsed from afar` / `Landmarks show as faint silhouettes in the fog: ` | `Heard from afar` / `Landmarks ring faintly through the fog, as silhouettes: ` | TEST screen_map:1442 |
| 2194 | `A tile that has been dealt with fades back into the page. Walk over it freely.` | `...fades back into the land. Walk over it freely.` | |
| 2195 | `The Unwritten Void` / `Holes in the story. Nothing can cross them and no brush paints them.` | keep the DATA read from P1, dropping its `'The '`: `DATA.tiles.block.name` (Dead Silence) / `Holes the Hush swallowed whole. Nothing can cross them and no Song wakes them.` | TEST screen_map:1442 |
| 2204 | landmark tag `seen from afar` | `heard from afar` | |
| 2214 | `Brushes are free and used once. The gold ring is where the brush starts, teal is what it paints. Lines and fans can face any of the six directions.` | `Songs are free and sung once. The gold ring is where the Song starts, teal is what it wakes. Lines and fans can face any of the six directions.` | |
| 2219 | `'You hold ' + n` | keep | TEST screen_map:1450 pins `/You hold 2/` |
| 2258 | tabs `The page`, `Brushes`, `Controls`, `Words` | `The land`, `Songs`, `Controls`, `Words` | TEST screen_map:1435 (deep equal) |

The melody hook (owner idea: every revealed hex plays a note): `stepReveals` in `screen_map.js` (about line 1313) calls `snd('paint')`
when each cell's bloom starts, in chain order (`rv.i`). That is the one place to add a pitched note per hex (pitch from `rv.i` along
a pentatonic scale, or from `(q, r)`), through a new AUDIO function owned by the audio lens. Keep the `snd('paint')` id (tests
screen_map:215 and 1572 look for it) or add the note call beside it; a new literal passed to `AUDIO.sfx` must be in
`DATA.LISTS.sfx` (hygiene "string ids handed to AUDIO").

#### 3.6 `js/screen_menu.js` (title, hero select, library, settings, how to play, pause)

Title:

| Line | Current | Proposed | Test |
|---|---|---|---|
| 247 | confirm `Start a new tale?` / `You have a tale in progress. Beginning a new one will replace it.` / `Begin anew` / `Keep my tale` | `Start a new journey?` / `You have a journey in progress. Beginning a new one will replace it.` / keep / `Keep my journey` | |
| 255 | `The tale cannot begin yet` | `The journey cannot begin yet` | |
| 434, 439 | fallback logo text `'INKWOVEN'` (measureText and inkText) | `'ECHOWAKE'`; the five ink drips under it (lines 441-449) become five short sound bars that pulse | |
| 489 | `Return to your saved tale` | `Return to your saved journey` | |
| 490 | hanko labels `'Ink Trial ' + n`, `Daily Tale` | `'Tempo Trial ' + n`, `Daily Jam` | |
| 493 | `New Tale` / `Choose two heroes and an Ink Trial` | `New Journey` / `Choose two heroes and a Tempo Trial` | |
| 496 | Daily sub `A new tale every day` | `A new jam every day` | TEST screen_menu:179 (`/not played|new tale/i` -> `/not played|new jam/i`) |
| 497 | `Daily Tale` | `Daily Jam` | |
| 514, 869 | toast `A new Daily Tale has begun` | `A new Daily Jam has begun` | TEST screen_menu:1455 |
| 518 | plaque `Library` | `Hall` | |
| 525 | credits `Painted in ink and code. No two tales alike.` | `Drawn in ink, sung in code. No two journeys alike.` | |
| 534 | tagline `a rogue storybook` | `a rogue ballad` | |
| 535 | gate `Tap to begin` (aria and text), sub `sound on` | optional: `Tap to break the silence` (literally starts the audio); keep `sound on` | TEST screen_menu:76 if changed |
| 538 | sr-only h1 `Inkwoven, a rogue storybook` | `Echowake, a rogue ballad` | |
| 273-410 | fallback title scene (`titleSprites`, `drawTitleFallback`): a colossal open book on a cliff (`BOOK` quads, leather covers, pages, an ink bloom), words lifting off the pages, the creeping `blank` paper edges | brief: a great temple bell (bonsho) hanging in a torii frame on the cliff, sound rings pulsing out of it, notes rising instead of words, the `blank` layer recoloured as grey Hush mist eating the edges. Only drawn when `ART.scene` title art is missing; the real title is `art_scenes.js` (art lens) | see section 8 (menu 1712-1729 couples to the art's book) |

Hero select:

| Line | Current | Proposed | Test |
|---|---|---|---|
| 621 | `BEGIN_TALE = 'Begin the Tale'`, `BEGIN_DAILY = 'Begin Daily Tale'` | `'Begin the Journey'` (17 characters: also set `.ts-big .mn-begin { letter-spacing: .02em }` in `css/menu.css` 239, section 7), `'Begin Daily Jam'` | TEST screen_menu:1774, 1776; browser:261; player:145 |
| 680 | `' Not yet written into the book'` | `' Not yet woken from the Hush'` | |
| 683 | `'Finish the chapter to unlock ' + name + ' for every future tale.'` | `'Finish the verse to unlock ' + name + ' for every future journey.'` | |
| 728 | stones pill aria `Inkstones` | `Chimes` | |
| 773, 774 | aria `Lower the Ink Trial`, `Raise the Ink Trial` | `Lower the Tempo Trial`, `Raise the Tempo Trial` | TEST player:142 |
| 778, 779 | `Ink Trial rules`, label `Ink Trial` | `Tempo Trial rules`, `Tempo Trial` | |
| 780, 788 | toggle `Daily Tale`; caption `Daily Tale` / `the same tale for everyone today` | `Daily Jam`; `Daily Jam` / `the same jam for everyone today` | |
| 702 | hero select bio heading `'Her story'` (`.replace('Her', ...)` gives `His story` for kuro and raiga) | `'Her voice'` (the same replace gives `His voice`) | none |
| 810 | toast `The Daily Tale chooses your heroes` | `The Daily Jam chooses your heroes` | TEST screen_menu:472 |
| 831 | toast `The Daily Tale sets the order too` | `The Daily Jam sets the order too` | |
| 848 | toast `Today’s Daily Tale is not available right now` | `Today’s Daily Jam is not available right now` | |
| 936 | `The Daily Tale is always Trial 0.` / `Win a tale to unlock Ink Trials.` / `The tale as the Author wrote it.` | `The Daily Jam is always Trial 0.` / `Win a journey to unlock Tempo Trials.` / `The tune as it was first sung.` | |
| 944 | `No trials yet. Reach the last page once to open the first.` | `No trials yet. Break the Hush once to open the first.` | |

Library (screen id stays `library`):

| Line | Current | Proposed | Test |
|---|---|---|---|
| 1104 | tab `Story` (icon `scroll`) | `Ballads` (icon `bell`, an existing motif id) | game:673 selects the tab by `dataset.id` since P1: no edit |
| 1106 | tab `History` icon `book` | keep label, icon `lantern` (existing motif id) | |
| 1150 | `Nothing on the shelves matches those filters.` | `Nothing in the Hall matches those filters.` | |
| 1151 | `The shelves are bare. Nothing is waiting to be unlocked yet.` | `The altar is bare. Nothing is waiting to be unlocked yet.` | |
| 1197, 1248 | `'You need ' + n + ' more Inkstones'` | `' more Chimes'` | TEST screen_menu:616 |
| 1199 | `'Costs ' + n + ' Inkstones. You can afford it.'` / `'Costs ' + n + ' Inkstones.'` | `Chimes` | TEST screen_menu:544 |
| 1271 | `' Inkstones earned'` | `' Chimes earned'` | TEST screen_menu:666 |
| 1280 | `'Reward ' + n + ' Inkstones'` | `'Reward ' + n + ' Chimes'` | |
| 1286 | `No achievements are written yet.` | `No achievements yet.` | |
| 1303 | STORY_GROUPS `The Chapters`, `The Endings`, `The Heroes` | `The Verses`, `The Endings`, `The Voices` | |
| 1311 | `Contents` / `seen + ' of ' + n + ' pages read. Pages you have not read yet stay blank.'` | `Setlist` / `... ' ballads heard. Ballads you have not heard yet stay silent.'` | TEST screen_menu:696 |
| 1319 | aria `'Page ' + no + ': ' + title + '. Read again.'` / `'Page ' + no + ': not read yet.'` | `'Ballad ' + ...` / `'. Hear again.'` / `': not heard yet.'` | |
| 1320 | `Read again` / `Unread` | `Hear again` / `Unheard` | |
| 1322 | toast `You have not read this page yet. Play on to find it.` | `You have not heard this ballad yet. Play on to find it.` | TEST screen_menu:700 |
| 1329 | `Loose Pages` | `Stray Ballads` | |
| 1330 | `The book has no pages yet.` | `No ballads yet.` | |
| 1376 | bestiary section heading `'Chapter ' + n + ': ' + title` and `' of '`, `' met'` | `'Verse ' + n + ': ' + title` | TEST screen_menu:723; game:676 `/1 of 17 met/` unchanged |
| 1389 | `The bestiary is blank. Meet a creature in a fight to record it here.` | `The bestiary is silent. Meet a creature in a fight to record it here.` | |
| 1402 | chip `'Chapter ' + n` | `'Verse ' + n` | TEST screen_menu:738 |
| 1405 | `A shape in the ink. Meet this creature in a fight and the book will write its page.` | `A shape in the silence. Meet this creature in a fight and its echo will be kept here.` | |
| 1442 | `No tales told yet` / `Finish a run, win or lose, and it will be written here: the heroes, the score, how far you got.` | `No journeys yet` / `Finish a run, win or lose, and it will be remembered here: the heroes, the score, how far you got.` | TEST screen_menu:775 |
| 1448, 1449 | `tales begun`, `told to the end` | `journeys begun`, `sung to the end` | |
| 1455 | history row `'Chapter ' + n` | `'Verse ' + n` | TEST screen_menu:764 |
| 1456 | aria `', Ink Trial ' + n`, `', Daily Tale'` | `', Tempo Trial ' + n`, `', Daily Jam'` | |
| 1461 | hanko labels `'Ink Trial ' + n`, `Daily Tale` | `Tempo Trial`, `Daily Jam` | |
| 1462 | `'+' + n + ' Inkstones'` | `'+' + n + ' Chimes'` | TEST screen_menu:765 |
| 1478 | banner `The Library`; stones aria `Inkstones` | `The Hall of Echoes`; `Chimes` | |

Settings form and the clear-data confirm:

| Line | Current | Proposed | Test |
|---|---|---|---|
| 1537 | `Erase all progress?` / `Unlocks, achievements, history, the bestiary and your saved tale will be erased. Your settings stay.` | keep / `...and your saved journey will be erased. Your settings stay.` | TEST screen_menu:926 (title unchanged) |
| 1538 | `Really erase the whole book?` / `This cannot be undone. Every Inkstone and every page you have written will be gone.` | `Really erase every echo?` / `This cannot be undone. Every Chime and every verse you have heard will be gone.` | screen_menu:932 still matches `/Really erase/` |
| 1544 | toast `The book is blank again` | `All is quiet again` | TEST screen_menu:940 |
| 1572 | text size sample `The fox wrote the grove, stroke by stroke.` | `The fox sang the grove awake, note by note.` | |
| 1584 | `Erases unlocks, history and your saved tale. Asks twice.` | `Erases unlocks, history and your saved journey. Asks twice.` | |

How to play (8 pages; ids `book map rows cards intents gems places after` are internal, TEST screen_menu:995 pins them: keep the ids):

| Line | Current | Proposed | Test |
|---|---|---|---|
| 1692 | diagram label `3 chapters, 3 bosses` | `3 verses, 3 bosses` | |
| 1661-1693 | page 1 diagram `paintBook`: an open book with pages and a road of ink, the Blank as mist | brief: a grey landscape strip with a glowing sound path from the heroes to the boss, shop, camp and elite stamps on it, the Hush as grey mist from the right | |
| 1729 | diagram label `paint, then walk` | `wake, then walk` | |
| 1696-1730 | page 2 diagram: `illusBg(g, 'paper')` and a `stat`/`brush` icon travelling hex to hex; meter `stat`/`ink` | the travelling icon becomes the flute or a sound ring (icon ids stay, the art lens re-skins `stat brush`, `stat ink`) | |
| 1918 | aria `'Ink Trials 0 to 10; you have opened up to ' + n` | `'Tempo Trials 0 to 10; ...'` | |
| 1921 | `Inkstones` / `Earned after every run. Spend them in the Library.` | `Chimes` / `Earned after every run. Spend them in the Hall of Echoes.` | |
| 1922 | `Ink Trials` / `Win a tale to unlock the next trial. Each one stacks a new rule.` | `Tempo Trials` / `Win a journey to unlock the next trial. Each one stacks a new rule.` | |
| 1923 | `Daily Tale` / `Same heroes and map for everyone, once a day.` | `Daily Jam` / keep | |
| 1926 | KEYS `['B', 'Brush tray']` | `['B', 'Song tray']` | |
| 1928 | page `book`: title `A Book That Writes Itself`; kicker `Two heroes, three chapters, one ending to rewrite.` | `A Land Without Sound`; `Two heroes, three verses, one silence to break.` | |
| 1929 | `You lead two heroes written into the Living Book. A creeping Blank is erasing its pages.` | `You lead two heroes across a grey, still land. A yokai called the Hush has eaten every sound.` | |
| 1930 | `Cross three chapters. Each ends with a boss, and the last one guards the ending.` | `Cross three verses. Each ends with a boss, and the last one guards the Hush itself.` | |
| 1931 | `Every run is a new tale: a different map, different cards, different treasures. Win or lose, you earn Inkstones to unlock more.` | `Every run is a new journey: a different map, different cards, different treasures. Win or lose, you earn Chimes to unlock more.` | |
| 1932 | page `map`: tip regex `/Painting a hex costs Ink/`; title `Paint the Map`; kicker `The page is blank. Ink makes it real.` | regex follows the data lens's new tip (proposal `/Waking a hex costs Echo/`); `Wake the Land`; `The land is silent. Your Echo wakes it.` | section 8 |
| 1933 | `Spend 1 Ink to paint a hex next to painted ground. It reveals what waits there: a fight, a shop, a camp, a fable.` | `Spend 1 Echo to wake a hex next to awake ground. It reveals what waits there: a fight, a shop, a camp, a fable.` | |
| 1934 | `Tap any painted hex to walk there. Stepping onto a fight or a fable starts it.` | `Tap any awake hex to walk there. Stepping onto a fight or a fable starts it.` | |
| 1935 | `Ink comes back from wells, wins and camps. One-use Brushes paint whole shapes for free.` | `Echo comes back from temple bells, wins and camps. One-use Songs wake whole shapes for free.` | |
| 1952 | page `places`: tip regex `/A fable is a choice/`; title `Camps, Shops and Fables` | regex follows the data tip (proposal `/A fable is a choice/`); `Camps, Shops and Fables` | section 8 |
| 1953 | `Camps let you rest, sharpen a card, cut gems or meditate for Ink. Peddlers sell cards, gems, treasures and card removal.` | `...cut gems or meditate for Echo. ...` | |
| 1954 | `Fables are choices with a safe way, a gamble and often a price. Treasures bend the rules for the whole run.` | `Fables are choices with a safe way, a gamble and often a price. ...` | |
| 1956 | page `after`: `After the Tale` | `After the Journey` | |
| 1957 | `You earn Inkstones after every run. Spend them in the Library on new cards, treasures and gems.` | `You earn Chimes after every run. Spend them in the Hall of Echoes on new cards, treasures and gems.` | |
| 1958 | `Win a tale to open Ink Trials, stackable challenges. The Daily Tale is the same seed for everyone.` | `Win a journey to open Tempo Trials, stackable challenges. The Daily Jam is the same seed for everyone.` | |
| 2000 | tip box label `Margin note` | `Liner note` (class `.mn-margin` stays) | TEST screen_menu:1072 (Appendix C) |
| 2003, 2005, 1970-1974 | `How to play, page N of 8: `, `This is the first page`, `Pages`, `Page `, `How to play pages` | keep (generic pagination) | TEST screen_menu:1015, 1031, 1037 rely on them |

Pause overlay:

| Line | Current | Proposed | Test |
|---|---|---|---|
| 2082 | `No tale is open right now.` | `No journey is underway.` | TEST screen_menu:1301 |
| 2087 | `Your tale` | `Your journey` | |
| 2088 | chips `'Chapter ' + n`, `'Ink Trial ' + roman`, `Daily Tale` | `'Verse ' + n`, `'Tempo Trial ' + roman`, `Daily Jam` | TEST screen_menu:1155 (exact), 1181 |
| 2091 | `UI.stat('ink')`, `UI.stat('brush')` pills | labels come from `STAT_TIP` (3.3) | |
| 2120 | tip label `A hint from the margins` | `A note from the road` | |
| 2137 | `Your tale is saved. See you on the next page.` | `Your journey is saved. See you at the next beat.` | |
| 2144 | `The tale cannot be abandoned right now` | `The journey cannot be abandoned right now` | |

#### 3.7 `js/screen_node.js` (reward, shop, event, camp, forge, chest, gem cache, deck and pick overlays)

| Line | Current | Proposed | Test |
|---|---|---|---|
| 285 | empty page `No tale is open` / `There is no run to show this page for.` | `No journey is underway` / `There is no run to show here.` | TEST screen_node:2078 |
| 308-310 | chrome pills `UI.stat('ink')` (data-tut `ink`), `UI.stat('brush')` | labels from `STAT_TIP` (3.3); keep the anchor | |
| 436 | `That choice can wait: the page turns without it.` | `That choice can wait: the journey goes on without it.` | |
| 460 | reason `This page has closed.` | `This moment has passed.` | |
| 852 | REWARD_TITLE.event `The Tale Moves On` | `The Journey Goes On` | |
| 854 | normal subs `The page settles, and something shiny is left in the margin.` / `The ink dries. The road is a little safer.` | `The air settles, and something shiny is left in the grass.` / `The echoes fade. The road is a little safer.` | |
| 855 | elite `Even the margins go quiet for a moment.` | `Even the crickets stop to listen for a moment.` | |
| 856 | boss `The chapter closes with a satisfying thud.` / `A page turns that will not turn back.` | `The verse ends on a satisfying final beat.` / `A silence breaks, and stays broken.` | |
| 857 | event `A fable ends the way fables do: with a bill.` / `The story goes on, a little richer.` | `A fable ends the way fables do: with a bill.` / `The journey goes on, a little richer.` | |
| 976 | ledger row label `Ink` | `Echo` | |
| 981 | ledger row `Brush` (fallback name and kind label) | `Song` | |
| 991 | `The foe left nothing but a story.` | `The foe left nothing but an echo.` | TEST screen_node:297 |
| 1222 | peddler hello `Ah, travellers from the margins! Wares for the weary.` | `Ah, travellers from the quiet roads! Wares for the weary.` | |
| 1223 | buy `Sold! I will wrap it in a story, free of charge.` / `Ha! The Book will thank you. I will thank your gold.` | `Sold! I will wrap it in a tune, free of charge.` / `Ha! The land will thank you. I will thank your gold.` | |
| 1224 | poor `I do not take IOUs. The Book keeps those.` | `I do not take IOUs. The Hush eats those.` | |
| 1226 | remove `Gone. As if the Author never wrote it.` | `Gone. As if it never made a sound.` | |
| 1229 | leave `Come again! I will be here. Probably. The Blank is closing in.` / `Safe roads, traveller. Mind the void.` | `...Probably. The Hush is closing in.` / `Safe roads, traveller. Mind the silence.` | |
| 1350 | shop plaque kind `Brush` / `One use` | `Song` / `One use` | |
| 1506 | outcome chip `sign(n) + ' Ink'` | `sign(n) + ' Echo'` | |
| 1519 | `paint` op chip fallback `The path opens` | `The land wakes` | |
| 1570 | event title fallback `A Blank Page` | `A Lost Fable` | |
| 1574 | plate seal `.ev-seal` text `Fable` | `Fable` | |
| 1599 | `The page is blank. The fable slipped away before it could be told.` | `Only silence. The fable slipped away before it could be heard.` | TEST screen_node:955 |
| 1601 | leave label `Turn the page` | `Play on` | |
| 1625 | `The tale has already moved on.` | `The journey has already moved on.` | |
| 1721 | camp Meditate verb `Ink and a brush` | `Echo and a Song` | |
| 1772 | `Gain Ink and a brush.` | `Gain Echo and a Song.` | |
| 1783 | `'+' + gain + ' Ink (' + a + ' to ' + b + ')'` / `Ink is already full.` / `+ one random brush` | `' Echo ('` / `Echo is already full.` / `+ one random Song` | TEST screen_node:1049 |
| 1850 | toast `'+' + n + ' Ink'` / `Ink is full` / `' and the ' + name` | `' Echo'` / `Echo is full` / keep | |
| 1182 | relic pick hint `'Choose one treasure. The others fade with the chapter.'` (`buildRelicPage`) | `'Choose one treasure. The others fade with the verse.'` | none |
| 1925 | forge banner `The Inkstone Forge` | keep the DATA read from P1 (`'The ' + DATA.tiles.forge.name`, renders The Tuning Forge); never a literal | |
| 2046 | announce `The Inkstone Forge. Sharpen one card, or cut gems.` | keep the DATA read from P1 (`'The ' + DATA.tiles.forge.name + '. Sharpen one card, or cut gems.'`, renders The Tuning Forge. ...) | |
| 1527-1545 | `paintDesk`: "the reading desk" behind the event book | re-skin as a dusk street stage (section 2, kamishibai) | |
| 2690-2700 | camp `campIcon('meditate')`: a lotus on still water and an ink drop falling into it | a small singing bowl or bell above the water; the existing ripple rings stay | |
| about 2705 | forge art comment "an anvil with an inkstone" | a tuning fork on the anvil (painter in this file) | |
| 1650, 1835, 1838 | `burst(..., { kind: 'ink' })`, `ripple(..., 'ink')` | visual only: the `k-ink` particle style in `css/node.css` becomes violet sound rings; keep the kind id | |

#### 3.8 `js/screen_combat.js`

| Line | Current | Proposed | Test |
|---|---|---|---|
| 2207 | boss reveal tag `CHAPTER BOSS` (elite: `CHAMPION`) | `KEEPER` | none (screen_combat:356 checks the SCENE banner `BOSS`) |
| 2134 | top bar `UI.stat('ink')` (Echo gained from kills) | label from `STAT_TIP` | screen_combat:780 reads `.st-ink .val` (class stays) |
| 1196 | End Turn button ink smear `.ce-ink`; 2210 boss reveal `.cr-brush` stroke | optional: the ink-line drawing style may stay; if wanted, `.ce-ink` becomes a waveform smear | |
| 2316 | screen `transition: 'ink'` | keep the id (TEST screen_combat:157 asserts `'ink'`); the visual changes in ui.js | |

Everything else in the combat screen (intents, piles, swap, energy, banners) is theme-neutral.

#### 3.9 `js/screen_end.js` (story, chapterClear, gameOver, victory)

| Line | Current | Proposed | Test |
|---|---|---|---|
| 88 | pageInfo intro: kicker `PROLOGUE`, seal `ONCE` | `INTRO`, `ONCE` | end:169-170 compare with pageInfo (no edit) |
| 89 | `'CHAPTER ' + word` | `'VERSE ' + word` | |
| 90 | `'CHAPTER ' + word + ' COMPLETE'` | `'VERSE ' + word + ' COMPLETE'` | |
| 91 | victory: `EPILOGUE`, seal `END` | `OUTRO`, `END` | |
| 92 | defeat: `INTERLUDE`, seal `BLANK` | `INTERLUDE` (already musical), seal `REST` | |
| 93 | hero pages `A HERO OF THE BOOK` | `A VOICE OF THE SONG` | |
| 94 | other `A PAGE` | `A BALLAD` | |
| 348 | noRunPage title `A blank page` | `Only silence` | |
| 349 | `There is no tale open for this page.` | `There is no journey to show here.` | |
| 442 | story fallback title `A Blank Page` | `A Silent Ballad` | TEST screen_end:216 |
| 443 | `Nothing is written on this page yet. Turn it, and the tale goes on.` | `Nothing has been sung here yet. Play on, and the journey goes on.` | |
| 462 | button `Turn the page` | `Play on` | TEST screen_end:204, 212, 219, 323 (`/Turn the page/` -> `/Play on/`) |
| 464, 1112 | hint `Tap the page to read on` | `Tap to listen on` | |
| 512 | score row `Chapters cleared` (icon `['motif', 'book']`) | `Verses cleared` (icon `['motif', 'bell']`) | |
| 531 | `The book's mercy` | `The land's mercy` | |
| 554 | share text mode `'Daily Tale ' + seed`, `'Ink Trial ' + n`, `'Ink Trial 0'` | `'Daily Jam ' + seed`, `'Tempo Trial ' + n`, `'Tempo Trial 0'` | TEST screen_end:445 |
| 555 | `'INKWOVEN: ' + (win ? 'the ending, rewritten' : 'the tale ended on page ' + n)` | `'ECHOWAKE: ' + (win ? 'the Hush let go' : 'a rest in Verse ' + n)` | |
| 557 | `' cleared'` after `U.plural(n, 'chapter')` | `U.plural(n, 'verse') + ' cleared'` | |
| 565 | unlock hero `' joins the book'` / `'. Choose ' + name + ' when you begin a new tale.'` | `' joins the band'` / `'... when you begin a new journey.'` | TEST screen_end:398 |
| 571 | `'Ink Trial ' + n + ' unlocked'` / `A harder telling of the same tale is waiting on the hero select.` | `'Tempo Trial ' + n + ' unlocked'` / `A faster tempo of the same journey is waiting on the hero select.` | TEST screen_end:398 |
| 703, 706 | chapterClear title fallback `'Chapter ' + roman + ' Complete'`, kicker `'CHAPTER ' + word + ' COMPLETE'` | `'Verse ...'`, `'VERSE ...'` | |
| 709 | boss line `', is undone'` | `', falls silent'` | screen_end:275 only checks the name prefix |
| 712, 714 | `' joins the book'` (aria and text), `'. Waiting on the hero select.'` | `' joins the band'`, keep | TEST screen_end:306 |
| 722 | lore fallback `The page turns. Whatever held this chapter together has let go.` | `The music swells. Whatever held this verse silent has let go.` | |
| 723 | scroll title `The Page Turns` | `The Land Sings` | |
| 733 | tile `Hexes` (icon `stat ink`) | keep the label (TEST screen_end:280 reads `tiles.Hexes`) | |
| 736 | `The Tale So Far` | `The Journey So Far` | |
| 767 | `What the Page Gives` | `What the Land Gives` | |
| 780 | announce `'Chapter ' + n + ' complete. '` | `'Verse ' + n + ' complete. '` | |
| 842 | `The deck was not kept with this page` | `The deck was not kept with this journey` | |
| 848 | `No treasures were found on this tale` | `No treasures were found on this journey` | |
| 851 | `The Tale Kept` | `What You Carried` | |
| 878 | kicker `THE TALE ENDS` | `THE SONG FADES` | |
| 879 | title fallback `The Page Goes White` | `The Hush Returns` | |
| 880 | `'Fell on page ' + roman + ...`, `'  |  Ink Trial '`, `'  |  Daily Tale'` | `'Fell in Verse ' + roman + ...`, `'  |  Tempo Trial '`, `'  |  Daily Jam'` | TEST screen_end:359 |
| 888 | `The ink thinned, and the page went white. Turn it, and try again.` | `The echoes thinned, and the land went still. Breathe, and try again.` | |
| 905, 1178 | `Inkstones earned` | `Chimes earned` | |
| 910 | `'Library total ' + n` | `'Chimes held ' + n` | screen_end:399 only checks `Achievement bonus` |
| 915 | `Nothing new this time. The next page might be the one.` | `Nothing new this time. The next journey might be the one.` | |
| 918, 1184 | `This run was not recorded, so no Inkstones were paid.` | `...so no Chimes were paid.` | |
| 920 | card title `The Book Remembers` | `The Land Remembers` | |
| 922 | announce `'The tale ends. Score ' + n` | `'The music rests. Score ' + n` | |
| 962 | CURTAIN kuro `Kuro pushed up his glasses, smudged ink across his nose, and began writing the margins of the next story. He called it research.` | `Kuro pushed up his glasses, tucked his flute under one arm, and began humming the harmony of the next tune. He called it research.` (130 characters, was 128) | |
| 963 | CURTAIN suzu `Suzu tied a new ribbon to the shrine bell and listened. For the first time in a very long while, nothing was fraying.` | `Suzu tied a new ribbon to the shrine bell and listened. For the first time in a very long while, nothing was out of tune.` (121, was 117) | |
| 1011 | share card heading `'INKWOVEN'` | `'ECHOWAKE'` | |
| 1014 | `'THE TALE ENDED ON PAGE ' + n` / `'THE ENDING, REWRITTEN'` | `'THE SONG FADED IN VERSE ' + n` / `'THE HUSH, BROKEN'` | |
| 1030 | facts `DAILY TALE` / `INK TRIAL` | `DAILY JAM` / `TEMPO TRIAL` | |
| 1098 | epilogue fallback title `The Ending, Rewritten` | `The Hush, Broken` | |
| 1099 | `The last line is written, and left open on purpose. The book turns itself to page one.` | `The last note rings out, and is left to echo on purpose. The land begins to sing on its own.` | |
| 1103 | kicker `EPILOGUE` | `OUTRO` | |
| 1127 | cast title `Everyone Who Was Ever Written In` (kicker `CURTAIN CALL` stays) | `Every Voice That Ever Sang` | |
| 1151 | show kicker `THE LAST PAGE` / title `The Ending, Rewritten` | `THE LAST NOTE` / `The Final Chorus` | |
| 1176 | `'library ' + n` | `'chimes ' + n` | |
| 1181 | `No new unlocks this time. Spend your Inkstones in the Library.` | `No new unlocks this time. Spend your Chimes in the Hall of Echoes.` | |
| 1186 | card title `New in the Book` | `Newly Unlocked` | |
| 1259 | download name `'inkwoven-' + seed + '.png'` (fallback `'tale'`) | `'echowake-' + seed + '.png'` (fallback `'journey'`) | |
| 899, 1049, 1115, 1189 | seals `FIN`, `END`, `WIN`, `SCORE` | keep | |

#### 3.10 `js/tutorial.js` (HINTS, `title` at most 30 characters, `text` 40 to 230, no dashes: TEST screen_end:704-706)

Hint ids (`paint ink walk tiles goal brush relics energy hand intent endturn block swap status pick boss reward camp shop event gems`)
and the profile flags `tut_<id>` are persisted in `rb_profile_v1`: keep every id.

| Line | Hint | Current title / text | Proposed title / text | Length | Test |
|---|---|---|---|---|---|
| 40-41 | paint | `Paint the page` / `The map is blank paper. Tap a hex beside the painted patch to spend 1 Ink and see what hides there.` | `Wake the land` / `The land is grey and still. Tap a hex beside the awake patch to spend 1 Echo and hear what hides there.` | 13 / 103 | TEST screen_end:741 (`/Ink/` -> `/Echo/`) |
| 42-43 | ink | `Ink is your budget` / `Each new hex costs 1 Ink. Wells, victories and a camp's Meditate refill the pot, so paint with purpose.` | `Echo is your budget` / `Each new hex costs 1 Echo. Temple bells, victories and a camp's Meditate refill it, so wake with purpose.` | 19 / 105 | |
| 44-45 | walk | `Now walk` / `Painted hexes can be walked on. ... You stop at anything with a story to tell: a fight, a shop, a camp, a fable.` | keep / `Awake hexes can be walked on. Tap one to head there. You stop at anything worth hearing: a fight, a shop, a camp, a fable.` | 124 | |
| 46-47 | tiles | `Read the stamps` / `...fights, elites, peddlers, camps, forges, chests, wells and fables each wear their own...` | keep / `...chests, bells and fables each wear their own...` | 171 | |
| 48-49 | goal | `The road to the boss` / `The chapter boss waits on the far right of the page. About sixteen hexes of paint will get you there, ... Fights along the way refill your Ink.` | keep / `The keeper of each verse waits on the far right of the land. About sixteen hexes will get you there, and every extra hex is a choice. Fights along the way refill your Echo.` | 177 | |
| 50-51 | brush | `A Brush paints for free` / `One-use Brushes paint whole shapes of fog away at no Ink cost. Save the long ones for the road to the boss.` | `A Song wakes for free` / `One-use Songs wake whole shapes of fog at no Echo cost. Save the long ones for the road to the boss.` | 21 / 100 | |
| 55-56 | energy | `...a card's cost is the number in its ink drop...` | `...a card's cost is the number in its corner orb...` (the `--drop` cost orb is re-skinned, section 4) | 132 | |
| 71-72 | boss | `Bosses change shape as they weaken, and the page tells you when...` | `...and the music tells you when...` | 148 | |
| 76-77 | camp | `...or Meditate for Ink and a Brush...` | `...or Meditate for Echo and a Song...` | 122 | |
| 78-79 | shop | `Cards, gems, treasures and a Brush are for sale...` | `Cards, gems, treasures and a Song are for sale...` | 112 | |
| 80-81 | event | `A fable` / `A fable is a choice, not a test...` | `A fable` / `A fable is a choice, not a test. There is usually a safe option, a gamble and a price. Pick your risk.` | 104 | |
| 210-219 | buttons | `Got it`, `Hide hints`, `Hints are off. You can turn them back on in Settings.`, `TIP` | keep | | |

#### 3.11 `js/scene.js` (combat canvas)

| Line | Current | Proposed |
|---|---|---|
| 140-146, 1085, 1148, 1348 | onomatopoeia `ZAN! BAN! KIN! PIKA! SHAA! BUKU! DON! GOGOGO` | keep: they are sound words, perfect for Echo |
| 2257 | `SCENE.demo` phase line `You dare tear the page?` | `You dare break my silence?` |
| 2268 | `SCENE.demo` shout `You will be erased!` | `You will be silenced!` |
| 144 | element `ink` hit style (`inkSplash` fx, word `SHAA!`), P_INK particles | the element id is data (Kuro's element); visuals belong to the art and fx lens |

#### 3.12 CSS `content:` strings (all nine are theme-neutral: no change)

`combat.css` 164 `"!"`, 185 `"KO"`, 204 `"RETAIN"`, 333 `"!!"`, 334 `"KO!"`; `end.css` 223 `" *"`; `map.css` 76 `"?"`; `node.css` 49 `" added"`,
219 `"Locked: "`, 587 `" \25BE"`.

---------------------------------------------------------------------------------------------------------------------------

### 4. Book and ink visuals owned by presentation files (re-skin briefs; keep every class name)

| # | File and selector or function | What it is now | Echo brief |
|---|---|---|---|
| V1 | `css/base.css` token `--drop` (used by `.c-cost` card cost orb, `combat.css .cm-orb` energy orb, `map.css .mp-drop` meter pips, `.mp-fly-in`, `node.css .dk-hint-mark`, `.back-drop`) | an ink drop SVG | split into two tokens (internal names): `--orb` a round glowing gong or bead for the cost and energy orbs, and `--echo` a small sound bar for the Echo meter and fly-ins. The tutorial energy hint says "corner orb" |
| V2 | `css/map.css .mp-drops/.mp-drop` with `gain` and `spend` animations ("a pour and a drip") | the Ink meter is a row of drops | an equalizer row: each pip is a bar that lights up rising (gain) and dims falling (spend) |
| V3 | `css/map.css .mp-intro-brush` and `.mp-title::after` | a vermilion brush stroke under the chapter title | a waveform stroke (the `--brush` mask can stay: it is the ink-line style, optional) |
| V4 | `css/base.css .rot-book .rp1..rp3` | an open book with three leaves behind a phone | a phone with three sound arcs |
| V5 | `css/base.css .back-drop`, `.back-word` (card back) | ink drop and INKWOVEN | concentric sound rings and ECHOWAKE |
| V6 | `css/base.css --torn-top/--torn-bot` (paper panels with `torn: true`) | torn page edges | optional: keep (washi reads as shoji paper), or swap the torn mask for a clean shoji frame |
| V7 | `css/menu.css .mn-book .mn-pg .mn-gutter` and `mnTurnNext/mnTurnPrev` | How to play as an open book with a gutter and page turns | a two-panel folding screen (byobu): a hinge strip instead of the gutter, panels slide in instead of turning |
| V8 | `css/menu.css .mn-margin` | a taped margin note | a liner-note card |
| V9 | `css/menu.css .mn-emptybook` | an empty book icon (empty history) | an empty bell or a resting drum |
| V10 | `css/node.css .ev-book .ev-page .ev-gutter .ev-ribbon .ev-seal` and `paintDesk` (`screen_node.js` 1527) | event as an open storybook on a reading desk | kamishibai stage (section 2) |
| V11 | `css/end.css .st-page .st-drop .st-seal` | story as a washi page with an illuminated first letter, caret "at the pen" | a lyric sheet: the first letter sits in a gong medallion (keep `.st-drop b`, TEST screen_end:171), the caret becomes a pulsing sound bar |
| V12 | `js/ui.js paintInk` (transition `'ink'`) and `paintPage` (transition `'page'`) | ink blobs bloom over the screen; a paper sheet slides like a turned page | `'ink'`: concentric indigo sound rings expand from several points until they cover the screen; `'page'`: a shoji door slides across (wood frame, washi panel). Keep both ids |
| V13 | `js/screen_menu.js` title fallback scene and how-to diagram 1 (`paintBook`) | open books | section 3.6 briefs |
| V14 | `index.html` boot splash drop and favicon | ink drop | section 3.1 |
| V15 | `css/menu.css .mn-storypage`, `.mn-st-dots`, `.mn-st-group` (about 359 to 371: the Hall's story tab) | a washi book contents page: grain, fibre and paper background, dotted leaders, `--brush-ul` under each group | decided: KEEP the layout and the dotted leaders (a setlist card with dotted leaders reads right, and washi panels are kept per X-13); swap the `--brush-ul` underline for a thin waveform stroke if V3 made one, else keep it; change the comment `story: a contents page` to `ballads: the setlist`. Owner: P8 agent 8B |

---------------------------------------------------------------------------------------------------------------------------

### 5. Internal identifiers in this lens that look themed: KEEP (with the reason)

| Identifier | Where | Why it must stay |
|---|---|---|
| CSS classes `mp-ink mp-ink-n mp-ink-l mp-drop(s) mp-fly-drop mp-fly-brush mp-chip mp-tray mp-mode lg-brush(es)` | map | asserted by screen_map tests (`.mp-ink-n` 10x, `.mp-drop` 7x, `.lg-brush` 5x, `.mp-fly-brush`...) |
| `mn-book mn-pg mn-gutter mn-margin mn-stones mn-stone-ico mn-st mn-st-* mn-storypage mn-emptybook mn-daily mn-trial mn-tr-*` | menu | asserted by screen_menu tests (`.mn-book` 7x, `.mn-stones` 5x, `.mn-st` 10x, `.mn-margin` 5x, `.mn-daily` 6x) |
| `ev-book ev-page ev-gutter ev-ribbon ev-seal ev-choice` | node | `.ev-*` asserted by node tests and the player |
| `st-page st-drop st-seal st-kicker st-title go-stone-n go-stone-sub go-stonescard vc-stone vc-page en-scroll-body` | end | asserted by screen_end tests |
| stat classes `st-ink st-brush st-inkstone`, bar kind `bk-ink`, burst kind `k-ink`, panel kind `p-paper`, `brush-div`, `brush-ul`, `back-drop`, `back-word`, `rot-book`, `ce-ink`, `cr-brush` | base, combat, node | generated from closed-list ids; screen_combat:780 reads `.st-ink` |
| CSS tokens `--ink --paper --paper2 --sumi --brush --brush-ul --torn-top --torn-bot --drop` | base.css | colour and mask tokens used by every sheet (rename only `--drop` if V1 is done, internal) |
| data-tut anchors `ink`, `brushes`, `hex` | screen_map, screen_node | `DATA.LISTS.tutAnchors`; hygiene checks literal anchors; tests resolve them (screen_map:169) |
| bus events `map:paint`, `map:brush`, `map:walk` | screen_map, tutorial | `DATA.LISTS.busEvents`; many tests |
| transition kinds `'page'`, `'ink'` | ui.js, main.js, screens | TEST ui:298, 318, 340; screen_combat:157 |
| screen ids `library story chapterClear`; library tab id `story`; how-to page ids `book map ...` | menu, end, main | closed lists `DATA.LISTS.screens`, `libraryTabs`; TEST screen_menu:995 |
| tutorial hint ids `paint ink brush` and flags `tut_paint tut_ink tut_brush` | tutorial | persisted in `rb_profile_v1` (renaming re-shows hints and leaves dead keys) |
| stat and icon kinds `UI.stat('ink'/'brush'/'inkstone')`, `UI.icon('stat', 'ink')`, `UI.icon('brush', id)`, motif ids `book scroll quill ink_splash brush_stroke`, relic icons `brush inkstone ink_drop` | everywhere | `DATA.LISTS.statIcons`, `iconKinds`, `motifs`, `relicIcons` (art lens re-skins the drawings; ids stay). Only swap the CHOICE of motif where copy points at a book: library tab icons and the `Chapters cleared` row (section 3.6, 3.9) |
| sfx ids `paint ink_splash brush_pick brush_use ink_gain well page_turn` | screens | `DATA.LISTS.sfx`; hygiene checks literals; tests count `paint`, `ink_gain`, `brush_use`, `page_turn` (screen_map:215, 322, 382; screen_menu:518, 1033). Audio lens re-synthesizes |
| ART.fx id `inkSplash` (map reveal, combat) | screen_map, scene | `DATA.LISTS.fx` closed list of 24 |
| scene id `'paper'`, sky `'paper'` in how-to | menu | `DATA.LISTS.scenes` |
| run fields `R.ink R.inkMax R.brushes`, `META.inkstones`, `DATA.ECONOMY.paintCost`, `MAP.canPaint`, `RUN.paint`, `RUN.useBrush` | all screens | logic API (logic lens decides; this lens only reads them) |
| key `B` (Song tray), key `L` (the Hall of Echoes) | map, title | keys need not match the word; no test pins `L` |
| `rb_*` storage keys, `rogue_book/` folder, URL | | owner rule |

---------------------------------------------------------------------------------------------------------------------------

---

## Appendix C. UI test edits and copy budgets

Source: the UI copy lens. Rows already converted in P1 to read DATA (brush, tile and lore names) need no further edit in P3. Line numbers are from a2bd24b.

### 6. Test assertions that change with this lens (exact edits)

All in `tests/`. Verse is final (D6). Lines are from a2bd24b.

| Test file:line | Asserts now | Change to |
|---|---|---|
| rogue_book_lib.test.mjs:205 | `d.title === 'INKWOVEN -- a rogue storybook'` | `'ECHOWAKE: a rogue ballad'` (a colon, no dash) |
| rogue_book_ui.test.mjs:210 | `/Something tore the page/` | `/Something broke the rhythm/` |
| rogue_book_ui.test.mjs:1042 | toast `/well/i` | `/bell/i` |
| rogue_book_ui.test.mjs:1044 | toast `/brush/i` | `/song/i` |
| rogue_book_ui.test.mjs:1132 | toast `/Inkstones/` | `/Chimes/` |
| rogue_book_ui.test.mjs:1147 | toast `/no saved tale/i` | `/no saved journey/i` |
| rogue_book_screen_map.test.mjs:161 | `/Chapter I/` on `.mp-ch` | `/Verse I/` |
| rogue_book_screen_map.test.mjs:162 | `/\d+% painted/` | `/\d+% awake/` |
| rogue_book_screen_map.test.mjs:164-165 | one chip, `/Long Stroke/` | the data lens's stroke name (proposal `/Drum Line/`) |
| rogue_book_screen_map.test.mjs:171 | `indexOf('hexes painted') > 0` | `'hexes awake'` |
| rogue_book_screen_map.test.mjs:185, 193 | `/blank page/i` | `/silence/i` |
| rogue_book_screen_map.test.mjs:216 | `/hexes painted/` or `/% painted/` | `/hexes awake/` or `/% awake/` |
| rogue_book_screen_map.test.mjs:270 | toast `/Ink/` | `/Echo/` |
| rogue_book_screen_map.test.mjs:280 | `/Too far for your Ink/` | `/Too far for your Echo/` |
| rogue_book_screen_map.test.mjs:283 | `'needs ' + cost + ' Ink'` | `'needs ' + cost + ' Echo'` |
| rogue_book_screen_map.test.mjs:292, 295 | `/Void/` (toast, chip name) | `new RegExp(DATA.tiles.block.name)` (P1 converts it; reads Dead Silence after P2) |
| rogue_book_screen_map.test.mjs:298 | `/Unwritten page|glimpsed/` and `/1 Ink/` | `/Silent ground|heard/` and `/1 Echo/` |
| rogue_book_screen_map.test.mjs:302 | `/Chapter Boss, glimpsed/` | `/<boss tile name>, heard/` (proposal `/Keeper, heard/`) |
| rogue_book_screen_map.test.mjs:321 | `/lends a drop of Ink/` | `/hums back one Echo/` |
| rogue_book_screen_map.test.mjs:377 | `/No brushes/` | `/No Songs/` |
| rogue_book_screen_map.test.mjs:398 | `/Tap again|Paint/` | `/Tap again|Sing/` |
| rogue_book_screen_map.test.mjs:427 | `/Paint \d/` | `/Sing \d/` |
| rogue_book_screen_map.test.mjs:457 | `/no brushes/i` | `/no songs/i` |
| rogue_book_screen_map.test.mjs:461 | `/nowhere to paint/i` | `/nowhere to wake/i` |
| rogue_book_screen_map.test.mjs:1185 | resting chip `/walk/` and `/paint/i` | `/walk/` and `/wake/i` |
| rogue_book_screen_map.test.mjs:1186 | `/tap painted ground to walk\./` (desktop) | `/tap awake ground to walk\./` (phone `/ground to walk\./` unchanged) |
| rogue_book_screen_map.test.mjs:1407, 1409 | `/Found in Chapter (I|II),/` | `/Found in Verse (I|II),/` |
| rogue_book_screen_map.test.mjs:1410 | `/chapter boss/i` | `/keeper/i` |
| rogue_book_screen_map.test.mjs:1435 | tabs `['The page', 'Brushes', 'Controls', 'Words']` | `['The land', 'Songs', 'Controls', 'Words']` |
| rogue_book_screen_map.test.mjs:1442 | `/Unwritten Void/`, `/Blank paper/`, `/Glimpsed from afar/` | `new RegExp(DATA.tiles.block.name)` (P1), `/Silent ground/`, `/Heard from afar/` |
| rogue_book_screen_map.test.mjs:1450 | `/Long Stroke/`, `/Fan Brush/` (with `/You hold N/`) | the data lens's names (proposal `/Drum Line/`, `/Shout/`) |
| rogue_book_screen_map.test.mjs:1695, 1708 | `/Chapter I/`, `/Chapter II/` on `.mp-intro` | `/Verse I/`, `/Verse II/` |
| rogue_book_screen_map.test.mjs:1766 | announce `/Painted 1 hex for 1 Ink/` | `/Woke 1 hex for 1 Echo/` |
| rogue_book_screen_map.test.mjs:1817, 1820 | `/hexes painted/` | `/hexes awake/` |
| rogue_book_screen_menu.test.mjs:76 | `/tap to begin/i` | only if the gate copy changes: `/tap to break the silence/i` |
| rogue_book_screen_menu.test.mjs:122 | `META.runInfo().text` `/Chapter 1/` | `/Verse 1/` (CH, logic lens edits `meta.js` 332) |
| rogue_book_screen_menu.test.mjs:179 | `/not played|new tale/i` | `/not played|new jam/i` |
| rogue_book_screen_menu.test.mjs:472 | `/Daily Tale chooses/` | `/Daily Jam chooses/` |
| rogue_book_screen_menu.test.mjs:544 | `/Costs \d+ Inkstones|Unlocked/` | `/Costs \d+ Chimes|Unlocked/` |
| rogue_book_screen_menu.test.mjs:616 | `/more Inkstones/` | `/more Chimes/` |
| rogue_book_screen_menu.test.mjs:666 | `/13 Inkstones/` | `/13 Chimes/` |
| rogue_book_screen_menu.test.mjs:693 | story row title `'Once, a Book'` (lore `intro` title, data) | the narrative lens's new intro title |
| rogue_book_screen_menu.test.mjs:696 | `/2 of \d+ pages read/` | `/2 of \d+ ballads heard/` |
| rogue_book_screen_menu.test.mjs:700 | `/not read this page/` | `/not heard this ballad/` |
| rogue_book_screen_menu.test.mjs:723 | `/Chapter 1: /` | `/Verse 1: /` |
| rogue_book_screen_menu.test.mjs:738 | `/Chapter 1/` on bestiary chips | `/Verse 1/` |
| rogue_book_screen_menu.test.mjs:764 | `'Chapter 3'` | `'Verse 3'` |
| rogue_book_screen_menu.test.mjs:765 | `/\+52 Inkstones/` | `/\+52 Chimes/` |
| rogue_book_screen_menu.test.mjs:775 | `/No tales told yet/` | `/No journeys yet/` |
| rogue_book_screen_menu.test.mjs:1072 | `/Margin note/` (both the regex and the fallback string `'Margin note'`), message `headed Margin note` | `/Liner note/`, fallback `'Liner note'`, message `headed Liner note` |
| rogue_book_screen_menu.test.mjs:940 | `/blank again/i` | `/quiet again/i` |
| rogue_book_screen_menu.test.mjs:1155 | `'Chapter 1Ink Trial II'` | `'Verse 1Tempo Trial II'` |
| rogue_book_screen_menu.test.mjs:1181 | `/Daily Tale/` present, `/Ink Trial/` absent | `/Daily Jam/`, `/Tempo Trial/` |
| rogue_book_screen_menu.test.mjs:1260 | `/Abandon this tale/` | `/Abandon this journey/` |
| rogue_book_screen_menu.test.mjs:1301 | `/No tale is open/` | `/No journey is underway/` |
| rogue_book_screen_menu.test.mjs:1455 | `/new Daily Tale/i` | `/new Daily Jam/i` |
| rogue_book_screen_menu.test.mjs:1774, 1776 | `'Begin the Tale'`, `/^Begin Daily Tale$/` | `'Begin the Journey'`, `/^Begin Daily Jam$/` (and the width model, section 7) |
| rogue_book_screen_menu.test.mjs:1712-1729 | regexes on `art_scenes.js` `const cover = [...]` and `layer('book', ...)` (the painted title book) | rewrite when the art lens replaces the book: keep the intent (the menu column at x 998 clears the right edge of the main title object plus its parallax) |
| rogue_book_screen_node.test.mjs:297 | `/nothing but a story/` | `/nothing but an echo/` |
| rogue_book_screen_node.test.mjs:955 | `/page is blank/` | `/Only silence/` |
| rogue_book_screen_node.test.mjs:1049 | `/\+4 Ink \(3 to 7\)/` | `/\+4 Echo \(3 to 7\)/` |
| rogue_book_screen_node.test.mjs:2078 | `/No tale is open/` | `/No journey is underway/` |
| rogue_book_screen_end.test.mjs:204, 212, 219, 323 | `btnByText(g, /Turn the page/)` | `/Play on/` |
| rogue_book_screen_end.test.mjs:306, 398 | `/Suzu joins the book/` | `/Suzu joins the band/` |
| rogue_book_screen_end.test.mjs:216 | `'A Blank Page'` (story fallback title) | `'A Silent Ballad'` |
| rogue_book_screen_end.test.mjs:359 | `/Fell on page I/` | `/Fell in Verse I/` |
| rogue_book_screen_end.test.mjs:398 | `/Ink Trial 2 unlocked/` | `/Tempo Trial 2 unlocked/` |
| rogue_book_screen_end.test.mjs:445 | `/Hanae and Kuro \| Score [\d,]+ \| Ink Trial 0/` | `/... \| Tempo Trial 0/` |
| rogue_book_screen_end.test.mjs:741 | first map hint `/Ink/` | `/Echo/` |
| rogue_book_game.test.mjs:214 | Continue plaque `/Chapter 1/` (runInfo) | `/Verse 1/` |
| rogue_book_game.test.mjs:673 | tab found by `/Story/` | done in P1 (`x.dataset.id === 'story'`): no P3 edit |
| rogue_book_game.test.mjs:674 | `/Once, a Book/` (lore title) | done in P1 (reads `DATA.lore.intro.title`): no edit |
| rogue_book_browser.test.mjs:261-263 | button `/begin the tale/i` | `/begin the journey/i` |
| rogue_book_player.mjs:142 | `/Raise the Ink Trial/` | `/Raise the Tempo Trial/` |
| rogue_book_player.mjs:145 | `/begin the tale/i` | `/begin the journey/i` |
| rogue_book_player.mjs:150, 410 | `/turn the page|continue/i`, `/^(continue|fight|leave|go on|turn the page|move on|walk on)/i` | add `play on`: `/play on|turn the page|continue/i` and `/^(continue|fight|leave|go on|play on|turn the page|move on|walk on)/i` |

Assertions that keep passing with the proposals (no edit, listed so nobody touches them): ui:118, 246, 369; browser:275; screen_map:295
(`/Nothing can cross/`), 1186 (phone branch), 1199 (walk lines), 1450 (`/You hold N/`); screen_menu:76 (if the gate stays), 285,
926, 932, 995, 1015, 1031, 1037; screen_end:169-172 (pageInfo-derived), 275, 280 (`tiles.Hexes`), 399; game:676; screen_combat:157, 356, 780.

Also update the assertion MESSAGES that mention the old words only if wanted: messages are free text and never fail a test.

---------------------------------------------------------------------------------------------------------------------------

### 7. Copy budgets the suites enforce

| Where | Budget | Source | Proposed copy checked |
|---|---|---|---|
| Map info chip action line (`.mp-info-act`) | 66 characters (normal), 52 (Larger text 1.3), 40 (phone, any size) | screen_map.test 1176-1203 | longest proposals: `Too far for your Echo: a chain of 12 hexes costs 12.` 52 (normal only), `Tap twice: a chain of 12 hexes costs 12.` 40, `Too far: a chain of 12 hexes costs 12.` 38, `That is not a place this Song can start.` 40, `Waking 12 hexes. Tap the arrow again.` 37, `Start from a silent hex within 4 hexes of the party.` 52 (tier 0 only; tiers 1 and 2 use `Start within 4 hexes of the party.` 34). All fit. The walk lines are pinned verbatim: do not touch |
| Map info chip text lines | two clamped lines (`-webkit-line-clamp: 2`) | css map.css, screen_map.test 1151 | resting `Wake fog beside the land for 1 Echo, or tap awake ground to walk.` 65 (was 68) and short 54 (was 57): both shorter than today |
| Song mode bar text | two clamped lines, width `calc(600px + (var(--ts) - 1) * 120px)` | screen_map.test 1151-1160 | all proposals are the same length or shorter than today |
| Tutorial hints | title at most 30, text 40 to 230, no dashes | screen_end.test 704-706 | section 3.10 lengths: titles 13 to 21, texts 100 to 177 |
| Hero select Begin button at Larger text | `len * (0.46 + letterSpacing) * 27.3 + 32 <= 259` px | screen_menu.test 1778-1785 (`.ts-big .mn-begin` letter-spacing, `.mn-launch` 296 px, padding 14) | `Begin Daily Jam` 15 chars: 237 px OK. `Begin the Journey` 17 chars: 264 px at the current .04em FAILS; set `.ts-big .mn-begin { letter-spacing: .02em }` in `css/menu.css` 239 (the test only requires <= .05) to get 255 px OK. Fallback label that needs no CSS: `Set Out` |
| Title slim plaques on a phone | 84 px each (three in a row) | screen_menu.test 1727 | `Hall` fits; `Hall of Echoes` would wrap, so the plaque says `Hall` and the banner `The Hall of Echoes` |
| Continue plaque sub | 3 clamped lines | menu.css 40 | `Verse 2, Echo 5, Hanae and Kuro` is the same length class as today |
| Curtain call lines | sit under heroes at 14 px | screen_end.js comment 958 | Kuro 130 (was 128), Suzu 121 (as Appendix B 3.9 gives it) |
| Share card | `spaced(ctx, title, ..., 5)` at 800 31px Georgia | screen_end.js 1011 | ECHOWAKE has the same 8 letters as INKWOVEN |
| Everything | no em or en dashes, no tabs | hygiene 112, 117; tutorial and share text tests also check dashes | all proposals use commas and colons |

---------------------------------------------------------------------------------------------------------------------------

---

## Appendix D. Art direction per file and function

PLANNER OVERRIDES (revision 2; they win over any row below): (a) plan 6.1 rule 7, the material swap (ash and frost flecks for "static", futon quilting for "foam", cloth gags and cords for "mute bars"); (b) small bells are Suzu's: Kuro wears a bronze flute charm (KU-05), the defeat shows no cracked bell (SC-07, SC-20); (c) the temple bell is never cracked: on defeat it is whole and re-wrapped in grey threads; (d) the title bell is drawn free after the player's first win (`opts.rung`, 3.3); (e) woken hexes near the party move (MAP-27); (f) the event stage changes its scene plate with its doors, never a sliding card; (g) phase 2 of the final boss carries a faint yamabiko silhouette (9.2).

Source: the art lens (reference renders were made with tools/rogue_book/shot.mjs). Row IDs (MAP-24, IC-09, KU-01, SC-02, X-03 ...) are referenced from sections 6 and 9. Player-facing names in the art rows are suggestions only: section 5 is authoritative (Muffled Knight, Grey Cantor, Silent Soldier, Muffle Wraith, Felt Golem, Off-Key Imp, Censor Golem, Hush Inquisitor, Hush Moth, Sour Note; Songbird tile; Chimes currency; Breath status).

### 1. Decisions and constraints that apply to every art task

1. KEEP every internal id and API name. Do not rename: `ART.map.paintBloom`, `ART.map.brushPreview`, `ART.map.paper`, `ART.map.frame`,
   `ART.fx.inkSplash`, `ART.fx.brushDrag`, `LISTS.motifs` ids (`ink_splash ink_wave brush_stroke calligraphy quill book scroll void`),
   `LISTS.relicIcons` ids (`brush inkstone ink_drop`), `LISTS.statIcons` ids (`ink brush inkstone`), tile ids (`well brush`), status id `sumi`,
   enemy ids (`void_scribe blank_soldier eraser_wraith paper_golem margin_imp censor_golem black_bar_inquisitor redaction_knight blank_page typo_sprite boss_editor paper_kodama`),
   scene ids (`paper defeat ...`), sheet names, `ART.tk.inkPath / inkBlot / inkText / paperGrain` (619 inkPath calls: it is the LINE style, which stays),
   palette keys `pal.paper pal.paper2 pal.sumi` (pinned by `tests/rogue_book_art_core.test.mjs` "the palette mirrors the ART_BIBLE tokens exactly").
   Only the pixels change. Optional comment refresh may say "Echo" where comments describe the look.
2. The ink LINE stays (Sumi-Shonen: calligraphic outline, cel shading, halftone, gold leaf). Keep the internal style name "Sumi-Shonen"; it is not shown to
   players. Recommended public wording in README/ART_BIBLE: "an inked anime line, cel shading, screen tone and gold leaf".
3. Hush versus awakened is the map's whole read: hushed = cool grey, still, faint baked static; awakened = full watercolour colour plus echo rings.
   Colour is never the only signal: the fog keeps its dashed outline and the painted hexes their stamps and rings.
4. New shared toolkit helpers (one small task in `js/art.js`, done FIRST, everything else may use them or draw locally):
   - `tk.note(ctx, x, y, size, o)` o {kind: 'eighth'|'quarter'|'beamed'|'rest', color, alpha, rot, line}: an inked music-note glyph (ellipse head tilted
     -0.35 rad, stem, flag or beam). Draw heads with `ellipse`, stems and flags with `inkPath`. Wrap with `sane(note, 1, 4)` like the others.
   - `tk.soundRings(ctx, x, y, r, o)` o {n: 3, gap: 0.32 (share of r), color, alpha, lw, broken: false, rot}: concentric rings; `broken: true` draws the
     outermost ring as two arcs (left and right) like a radiating speaker symbol. Use `ctx.arc` + stroke.
   - Palette additions (non-breaking, new keys only) in `pal` and mirrored as CSS tokens by the UI owner:
     `hush '#cfcdd8'` (hushed ground), `hush2 '#8e8aa3'` (hush shadow, static), `felt '#6e6a7e'` (Hush constructs), `bronze '#c9893a'`, `verdigris '#5fbfa8'`.
   - Add both helpers to the `toolkit` gallery sheet (`A.sheet('toolkit', ...)`, art.js ~line 1661) as one more cell "note, soundRings".
5. Performance: fog hexes are 200+ per frame and are cached sprites; `tests/rogue_book_art_map.test.mjs` asserts "fog is still" and "an enemy hex is still"
   (call log identical across t). So hush static is BAKED into the fog sprite variants; animation lives only in `liveEdge`, `liveTile`, `paintBloom`,
   `frame`, the token and route.
6. Echo music link (audio lens owns the sound): `ART.map.paintBloom` may take an optional `opts.note` (integer 0..6, the scale degree AUDIO plays for that
   hex); it tints the rising note glyph along a 7-step hue ramp `['#ff7eb6','#ff9a2e','#f5c96a','#3fd6b0','#5fb4ff','#7a6bff','#c49bff']` so a revealed
   path shows the melody. Undefined = gold. screen_map passes it when AUDIO exposes the degree (coordinate with the audio and map-screen lenses).

---------------------------------------------------------------------------------------------------------------------------------------------------

### 2. Echo visual vocabulary (use these everywhere so the game reads as one world)

| Motif | Shape | Colours | Used by |
| --- | --- | --- | --- |
| Echo ping | solid centre dot, one full ring, outer ring broken into left and right arcs | body `#5a4ae0` to `#7a6bff`, rim `#5ff5ff`, glow `#7a6bff` | stat `ink` icon, route pill, map Ink meter (CSS), logo O, token ring accent |
| Sound rings | 2 to 3 concentric thin circles, alpha falling outward | tile light colour or `#e8fbff` | painted hexes, bloom wavefront, bell tile, victory sky, Kuro fx |
| Note glyphs | eighth, beamed pair, quarter; a "rest" squiggle for silence | gold `#f5c96a`, white, or the hue ramp | title drift, bloom, route dabs, Kuro, card motifs, released sounds |
| Temple bell (bonsho) | tall bronze bell, rounded crown, flared lip, two bands, a grid of boss knobs, wooden striker log (shumoku) on ropes | bronze `#c9893a`, shade `#7a4a1c`, verdigris streaks `#5fbfa8` | title (bound in Hush threads until the first win, then free), victory (ringing), well tile, defeat (whole, re-wrapped in grey threads, striker still; never cracked) |
| Hush materials | grey felt (quilted, stitched seams), cotton wadding (puffy), layered futon quilting (the old foam zigzags, read as quilted ridges), wrapped grey cloth gags and cord bindings (the old black bars), grey ash and frost flecks (the old static dashes), grey fog | felt `#6e6a7e`, feltD `#46425a`, wadding `#f2f0f6`, quilt shadow `#2e2b3a`, ash `#8e8aa3`, frost `#f2f0f6` | chapter 3 roster, final boss, Dead Silence tile, title corners, defeat |
| Instruments | shakuhachi, taiko and bachi sticks, hyoshigi clappers, biwa lute, furin wind chime, rin singing bowl, tuning fork | lacquer, bronze, wood `#a8743c` | Kuro, icons, card motifs, tiles |

---------------------------------------------------------------------------------------------------------------------------------------------------

### 3. Title and logo

#### 3.1 Title (decided: ECHOWAKE; the alternates are the same as plan D1 and section 11: YAMABIKO and HUSHBREAKER)

| # | Title | Why | Logo letters needed (existing: I N K W O V E) |
| --- | --- | --- | --- |
| 1 (default) | **ECHOWAKE** | "echo" + "wake": the heroes wake the land, and a wake is the trail left behind, like the melody a revealed path writes | E O W K exist; new C H A |
| 2 | **YAMABIKO** | the yokai of the mountain echo, folklore exact (and the Hush's own shape, 4.1); opaque outside Japan | new Y, A, M, B (K, O exist; I exists) |
| 3 | **HUSHBREAKER** | names the enemy and the goal, shonen energy; long (11 letters, logo is wider and shorter) | E K exist; new H U S B R A |

Rejected: KODAMA (Japanese for "echo" and a tree spirit) because `kodama` is already a chapter 1 enemy (id and name "Kodama").

#### 3.2 Logo (`js/art_scenes.js`, THE LOGO block lines ~2706 to 2938), size M

| Function / data | Today | Echo |
| --- | --- | --- |
| `LOGO_LETTERS` (~2711) | I N K W O V E N skeletons in a 100-unit box | ECHOWAKE: reuse E (adv 80), O (102), W (146), K (90); add C, H, A below |
| `logoLayout` anchors (~2795 to 2800) | drip anchors on K, W and the last N (`li === 7`); `anchors.moon` on O | pulse anchors on O (centre, period 5.2 s, ph 0), K (7.3 s, ph 0.34), last E (`li === 7`, 6.1 s, ph 0.61); keep `anchors.moon` on O |
| `paintLogo` step 7 (~2856) "the moon inside the O" | gold disc with ink ring and craters | gold echo ping: gold dot (r*0.55) + one gold ring (r*1.0, lw 0.18r) + broken outer ring arcs (r*1.45); no craters |
| `paintLogo` "outer ink splatter flecks" | 22 ink dots | keep (it is the line look) or swap half of them for tiny gold note specks via `tk.note` (optional) |
| `drawDrip` (~2877) | ink bead swells, falls, splashes | `drawPulse(ctx, ax, ay, a, t, H)`: u = cycle phase; 0..0.6 a ring grows from a.r to a.r*6 (lineWidth a.r*0.5 to 0.5, alpha 1 to 0, colour `#ffe9a8` then `#5ff5ff`); 0.2..0.8 a small note glyph (`tk.note`, size a.r*3) rises a.len*0.6 and fades; 0.8..1 rest. Keep the function signature and call site in `logoDraw` |
| `logoDraw` (~2920) | glow violet + gold, sparkles, drips | same glows and sparkles, `L.anchors.forEach(drawPulse ...)` |
| `ART.scene.logo` header comment (line 23) | "brush-lettered INKWOVEN logo ... living ink drip" | update wording |
| `js/art.js` placeholder `logo()` (line 1626) | draws 'INKWOVEN' with inkText | draw the new title string |

New letter skeletons (same conventions as the existing ones: x right, y down, w in units, pr pressure, ts/te taper fractions):

```
{ ch: 'C', adv: 88, s: [
  { p: [[72, 16], [48, 4], [20, 18], [10, 50], [22, 84], [48, 97], [74, 86]], w: 21, pr: 'mid', ts: 0.1, te: 0.18 },
  { p: [[64, 8], [74, 12], [78, 22]], w: 7, pr: 'mid', ts: 0.3, te: 0.3 }] },
{ ch: 'H', adv: 94, s: [
  { p: [[12, 5], [14, 50], [10, 97]], w: 19, pr: 'head', te: 0.3 },
  { p: [[80, 4], [79, 50], [82, 96]], w: 19, pr: 'head', te: 0.3 },
  { p: [[14, 52], [46, 47], [79, 51]], w: 10, pr: 'head', te: 0.35 },
  { p: [[2, 9], [12, 4], [26, 10]], w: 6.5, pr: 'mid', ts: 0.3, te: 0.3 }] },
{ ch: 'A', adv: 96, s: [
  { p: [[48, 4], [28, 50], [8, 96]], w: 12, pr: 'mid', ts: 0.15, te: 0.25 },
  { p: [[46, 6], [66, 50], [88, 96]], w: 22, pr: 'head', te: 0.3 },
  { p: [[24, 64], [50, 60], [76, 65]], w: 8, pr: 'head', te: 0.4 }] },
```
Order: E C H O W A K E (total advance 776 units against 746 today; `logoLayout` scales to `w`, so nothing else moves).

Tests (`tests/rogue_book_art_scenes.test.mjs` "the logo draws at every width and t, is cached per width, and its drip moves"): >= 7 distinct call logs over
t = 0.2 .. 5.1, deterministic, NaN and negative width absorbed, `opts.logo` on the title adds > 100 calls. The pulse design satisfies all of these.
Only the test title strings mention "drip" and "INKWOVEN" (comments): optional relabel.

#### 3.3 Title scene (`js/art_scenes.js` lines 963 to 1285), size L

Layout constraint: `css/menu.css` line 25 says the painted book spans x 292..988 and the menu column starts at x 998. The new centrepiece must stay inside
x 292..988 (and below the logo, which occupies about y 115..235 at `logoDraw(ctx, 640, 172, 740)`), or the comment and column math must be revisited by
the menu owner. Keep the layer rectangle close to the book's `{ x: 280, y: 290, w: 720, h: 300 }`, enlarged upward to `{ x: 300, y: 236, w: 680, h: 330 }`.

| Item | Today | Echo direction |
| --- | --- | --- |
| `TM` moon, `titleSky` (990) | huge cream moon with a dry-brush enso and craters | keep the moon (anime night); the enso around it becomes 3 faint concentric "sound rings" (`tk.soundRings`, alpha 0.25 to 0.1) |
| `BK`, `pagePt`, `pageOutline`, `erasedAt` (967 to 989) | book geometry | delete with the book (or keep only if the turning-page anim is reused; it is not) |
| `titleBook(g, healed)` (1072 to 1147) | leather cover, page blocks, brush text, sumi-e picture, drop cap, Blank bite, bookmark | replace with `titleBell(g, rung)`: a wooden belfry (shoro): two dark lacquer posts (x 420 and 860, from y 486 up to 262), a tiled hip roof with upturned eaves (y 236..290, x 380..900, cel shaded indigo tiles with gold ridge caps), a crossbeam; the bronze bonsho hanging from it (centre x 640, crown y 300, lip y 478, width 150 at the lip): two bands, a 4x4 grid of boss knobs on the upper body (small cel circles), verdigris streaks, gold rim light from the moon side, ink outline 3. The striker log (shumoku) hangs on two ropes to the right at y 360. When `rung === false` (the title for a player with no win yet): 5 grey "hush threads" (tk.inkPath, `#8e8aa3`, alpha 0.7, w 2) wrap the bell and tie it to the posts, with ash flecks along them; when `rung === true` (victory, and the title once the player has won: `ART.scene.draw(ctx, 'title', ..., { rung })`, default false, part of the title layer cache key): no threads, the striker pulled back |
| `titleBeam` (1149) | light column from the book gutter | soft light spilling down from under the bell lip onto the cliff (additive cone from y 478 down to 520) plus a faint column behind the bell |
| page-turn anim (1245 to 1261) | a page lifts and turns every 10.5 s | "muffled ring": every 10.5 s (skip when `T.mot < 1`) the bell swings +-0.03 rad over 0.8 s and one ring expands from the lip to r 260, but breaks into grey ash flecks at r > 160 (the Hush swallows it); with `rung` the ring stays whole and clear to r 260. Rings via `ctx.arc` |
| `glyphSpr(k)` (1207) + drift anim (1263) | glowing calligraphy glyphs rise from the book | `noteSpr(k)`: 5 variants via `tk.note` (eighth, quarter, beamed, eighth rot 0.3, rest), cream `#fff4d0` with a gold glow; same drift settings, area centred on the bell |
| `titleBlank`, `tornBlob` (1184 to 1206) + layers `blankA`, `blankB` | torn white paper creeping in from the corners, inked torn edge, paper grain | `titleHush(g, k, sd)`: the same `tornBlob` outlines (keep the function) filled with a cool grey radial (`#b9b6c6` to `#8e8aa3` at 0.9 alpha), NO ink outline, a soft 18 px feather (draw the blob 3 times shrinking with rising alpha), and 30 static dashes per blob (white and `#5a566e`, 3 to 7 px long, 1 px high). Read: colour drained, not paper |
| `titleCliff` stone lantern, `titleFg` bamboo, `titleSakura`, fireflies, petals | Japanese night | keep |
| `SCENES.title.mood` | 'moonlit book' | 'moonlit bell' |
| `grain(0.3)` (washi grain baked) | grain | keep (texture, not book) |

Story screen note: `js/screen_end.js` story pages draw the `title` scene behind the page, so the new title also re-skins the prologue backdrop.

---------------------------------------------------------------------------------------------------------------------------------------------------

### 4. `js/art_map.js` (1274 lines): the hushed map, size M to L

Header comment lines 1 to 39 describe "a storybook page being coloured in", "the open book", "ink stamp", "parchment": rewrite to the Echo look.
Public API, names and signatures unchanged. Tests: `tests/rogue_book_art_map.test.mjs` (523 lines) pins geometry, caching, the frame window, bloom
behaviour, token, route, brush edges, paper determinism; listed per row.

| ID | Function (line) | Today | Echo direction | Size | Test constraints |
| --- | --- | --- | --- | --- | --- |
| MAP-01 | `WASH` (83 to 98) | per-tile pigment + decor id: well `#4aa4ee` 'ripples', brush `#2fbdb5` 'swash', block `#241a3a` 'void' | keep colours (well blue reads as "sound blue", brush teal is the Song colour); decor ids: well 'ripples' -> 'rings', brush 'swash' -> 'notes' | S | `M.info().tiles` lists WASH keys: keep the keys |
| MAP-02 | `stitches` (145), `sketch` (162), `fogSprite` (170 to 188) | blank paper `A('#fbf3dc', 0.34)`, brown/white fibres, running stitch `#8a6f55`, pencil sketches `#6b5238`, lit edge gold gradient | hushed: fill `A('#eceaf2', 0.30)`; fibres -> static: 22 short HORIZONTAL dashes (len 2..5 k, lineWidth 0.6..1 k) in `#5a566e` (alpha 0.10..0.20) and white (0.18..0.32); specks stay; `stitches` colour `#77738c`, light edge `#f4f3f8`, and make each stitch shorter (u1 = (i + 0.5) / n) so the outline reads as a dotted "rest"; `sketch` colour `#5a566e`; `lit` (edge) gradient keeps gold `#ffe9a8` (the next note to wake) | S | "fog is still": no t in fogSprite |
| MAP-03 | `GLYPH` fallback stamps (194 to 207): start, well, brush | bookmark, drop + well rim, fude brush | start: two crossed hyoshigi blocks + cord; well: bell silhouette (crown arc, flared lip, lip line in `#f5c96a`) under a two-post roof; brush: two beamed eighth notes. Only used when art_icons is absent, but keep coherent | S | none |
| MAP-04 | `DECOR` (234 to 254): `ripples`, `swash` | flat ellipses; a fat teal brush swash | `rings` (rename key): 3 concentric CIRCLES centred (cx, cy + s*0.02), radii s*(0.56, 0.70, 0.84), lineWidth 1.2k, `#e8f6ff` alpha 0.5/0.36/0.22; `notes`: 3 small `tk.note` glyphs (`#8ff0e8`, alpha 0.7, sizes 7k..10k) placed by the seeded `r()` | S | painted hex is still (baked) |
| MAP-05 | `paintedSprite` (256 to 293) | wash mixed toward `#f3e6c8` (paper), ink outline, hanko | mix toward `#f7f6fb` instead (cool white, so colour pops on the grey ground); add "echo rings" for every non-empty tile BEFORE step 7: two circles at s*0.62 and s*0.78, colour `light`, alpha 0.35 and 0.2, lineWidth 1.2k, clipped to the ring (already inside the clip). Empty tiles get one faint ring (alpha 0.14). Keep everything else | S | "an enemy hex is still"; size class test (sprite box unchanged) |
| MAP-06 | `voidSprite` (298 to 310) | "Unwritten Void": torn hole, violet ink streaks, violet halftone, cream specks | "dead silence": keep the fill and gradient (`#150f2a`, `#1a1236` to `#0a0716`), replace the 5 violet ink streaks with 40 static dashes (`#8e8aa3` alpha 0.25..0.5 and `#ffffff` alpha 0.2..0.4, 2..6 k long, 0.8 k high), halftone colour `#6f6b86`, the 9 cream specks become white 1 px dots; outline colour `#3b2a7a` -> `#4a465e` | S | "a painted block tile draws the void" |
| MAP-07 | `pathSprite`, `hoverSprite`, `targetSprite` (315 to 334) | gold path wash, gold hover, sakura target with vermilion ticks | keep (they are affordances, theme-neutral) | 0 | |
| MAP-08 | `silSprite` (340 to 354) | ghost of the stamp, `#8a7660` wash, boss `#2a1a4a` | wash colour `#7d7992` (cool) instead of warm brown | S | |
| MAP-09 | `liveEdge` (407) | marching gold dashes + glow | keep the dashes (affordance) and add a "listening" ring: every 2.6 s a thin circle grows from size*0.2 to size*0.8 (`#fff2b8`, alpha 0.5 * (1 - a), lineWidth 1.2k), times `mo` | S | "the edge glow animates with t" |
| MAP-10 | `liveTile` (426 to 434) well branch | expanding flat ellipse ripple | temple bell: a CIRCLE ring expanding from size*0.3 to size*0.85 every 2.2 s (`#e8f6ff`), plus a gold glint on the bell lip at the start of each ring | S | "a camp flickers with t" (unchanged) |
| MAP-11 | `PAPER_BASE`, `DOODLE_INK` (442) | `#f0e0b8`, `#5c4530` | `#cfcdd8` (pal.hush), `#4a465e` | S | "paper does not animate", deterministic |
| MAP-12 | `paperTile` (452) | 200 curved fibres brown/white, 150 specks | hush grain: 160 short horizontal static dashes (`#5a566e` alpha 0.06..0.16, white 0.12..0.3), 120 specks `#4a465e` / white | S | |
| MAP-13 | `stainSprite` (466) variants 0..5 | tea rings, foxing, sun patch, fold line, tea wash | 0,1: frozen ripple: 3 thin concentric circles `#6f6b86` alpha 0.10..0.06 (no fill); 2: static cluster (34 tiny dashes); 3: pale mist patch (keep, colour `#f4f3f8`); 4: the "silence line": one long flat horizontal line `#4a465e` alpha 0.08 with a white twin 2 px below (a flatline instead of a fold); 5: soft grey wash `#8e8aa3` | S | |
| MAP-14 | `chunkSprite` (486) | brown/cream mottling | mottling colours `#8e8aa3` (dark) and `#f4f3f8` (light) | S | |
| MAP-15 | `DOODLES` (505 to 574), `PLACED` (583), `DOODLE_MARGIN` (575) | compass with "N" text, kraken, serpent, boat, waves, koi, stars, tuft (a sea chart) | replace the sea-chart ones, keep the nature ones. compass -> `rings` (236x236: 4 concentric circles + 8 short radial ticks, no text); kraken -> `bell` (300x230: a silent bonsho outline tied with a cloth band); serpent -> `cranes` (360x150: three sleeping cranes in a row, heads tucked); boat -> `drum` (150x140: a taiko on a stand with two crossed bachi); keep waves, koi, stars, tuft. Update `PLACED` ids and `DOODLE_MARGIN` to `['waves', 'koi', 'stars', 'tuft', 'waves', 'drum']` | M | "doodles add blits over the page" and "margin doodles appear outside the page": keep the system, only the drawings change |
| MAP-16 | `frameMetrics` (641) | margins mx = 0.0344 w, my = 0.05 h | KEEP EXACTLY (screen_map `DEF_WIN = { x: 44, y: 36, w: 1192, h: 648 }`, test: window >= 1180 x 640, centred) | 0 | frame window tests |
| MAP-17 | `cornerCap` (646) | gilt corner guard with a vermilion stud | keep (gold fittings suit a lacquer frame) | 0 | |
| MAP-18 | `frameSprite` (655 to 731) | 1 leather; 2 page-block edges; 3 window clear; 4 paper curl shadows; 5 gutter with binding thread; 6 ink-blot vignette; 7 page curls; 8 gilt corners and gutter clasps | 1 lacquered wood: gradient `#2a1f48` -> `#1b1430` -> `#100b1e`, fine vertical grain strokes (90 thin lines alpha 0.06) instead of leather speckle, two gold inlay lines (keep step 1's tooled lines); 2 between cb and mx/my: a kumiko band: draw an asanoha (hemp-leaf) lattice of thin lines (`#3a2f5c`, 1 px) clipped to the margin ring, with a gold hairline on the inner edge (alpha 0.5); 3 keep `g.clearRect(mx, my, w - 2 * mx, h - 2 * my)` EXACTLY; 4 inner bevel shadows (keep, colour `#100b1e` alpha 0.3); 5 DELETE the gutter and binding thread; 6 vignette: radial `#2a2640` alpha 0.3 plus 30 soft grey mist blobs (`#5a566e`, alpha 0.06..0.14, no ink edge) creeping from the window edges ("the Hush at the edges"); 7 DELETE page curls; 8 keep gilt corners, delete the two gutter clasps (or keep them as top and bottom centre gold mon fittings) | M | clearRect exact inner window; baked once per size |
| MAP-19 | `frame` live part (732 to 747) | bookmark ribbon sway + corner twinkle | delete the ribbon; keep the corner twinkle; add a slow gold inner-edge shimmer: `ctx.strokeRect(fm.mx + 1, fm.my + 1, w - 2 * fm.mx - 2, h - 2 * fm.my - 2)` in `pal.gold2`, alpha 0.12 + 0.1 * sin(t * 1.3) * mo | S | "frame log differs between t 0.3 and 1.9" (twinkle already does); test label "the ribbon sways" is cosmetic |
| MAP-20 | `featherSprite` (754 to 781), `fogEdge` (782) | fog side: 9 layered strokes `#5a4570` + ink line `#2a1f3a` + ink tendrils; void side: cream torn paper rim + white fibres | fog: the 9 layered strokes in `#8e8aa3` (hush, alpha 0.03..0.06), then the WAVEFRONT: a 3k cyan underline `A('#5ff5ff', 0.22)` and a 1.2k white line `A('#ffffff', 0.55)` along `line`; replace the tendrils with 1 or 2 tiny ripple arcs (`arc` radius 0.08..0.14 s, `#e8fbff` alpha 0.4) on the fog side. void: replace the cream rim polygon with a dark band `#1d1a2e` alpha 0.9 and 20 static dashes (white alpha 0.5, `#8e8aa3`) along the line | S | one strip per masked side (drawImage count) |
| MAP-21 | `inkDrop` (819), `pill` (860) | ink-drop icon in the cost pill | `echoPing(g, x, y, r, fill, line)`: centre dot r*0.38 + ring r*0.8 (lineWidth r*0.25) + two outer arcs r*1.2 (+-0.9 rad each side); pill fill unchanged | S | pill text test unaffected |
| MAP-22 | `dabSprite` (854), `route` (875) | 3 ink-dab variants marching | note heads: v0 head only, v1 head + stem, v2 head + stem + flag (`tk.note`), fill `#2a2245`, highlight dot white 0.5; sprite size and marching math unchanged | S | ">= 8 drawImage dabs", "longer path more dabs", deterministic |
| MAP-23 | `brushPreview` (935) | teal wet shape, white sheen, sparkles | keep fill colours; the sheen becomes a sine band: draw the gradient stripe along a sine path (`sx` drift unchanged, add `sin` offset per y); sparkles -> tiny ring pulses (`arc`, `#eaffff`) | S | union edges (brushEdges) untouched; "the outline marches with t" |
| MAP-24 | `blobClip` (982), `paintBloom` (992 to 1045) | watercolour blot from the touch point, wet edge, backrun, droplets, gleam, sparkle | `waveClip(ctx, tx, ty, rr, sd, p)`: a CIRCLE polygon of 28 `lineTo` points with a gentle 6-lobe ripple (radius * (1 + 0.035 * sin(6a + sd + 9p))); inside: `hex(ctx, 'painted', ...)` as today; the wet edge -> wavefront: stroke the clip path twice (lineWidth size*0.06, light colour alpha 0.6*fade; then size*0.02 white alpha 0.8*fade) and a second ring at rr*0.72 (alpha 0.3); droplets -> 3 escaping rings drawn with `ctx.arc` after the restore (centre (tx, ty), radius rr + size*(0.15 + 0.35 i) * q', alpha (1 - q') * 0.6, colour light or `#9fe8ff` when neutral), NOT clipped; sparkle -> a rising `tk.note` (size*0.34, colour from `opts.note` hue ramp or gold) from (x + size*0.3, y - size*0.3) up by size*0.5, alpha sin(PI q) | M | p 0 draws nothing; p 1 equals the painted hex; clip every p; clip polygon (> 10 lineTo) area grows 0.08 < 0.2 < 0.4; neutral mid-bloom has >= 3 `arc` calls; with tile draws a sprite, neutral draws none; balanced |
| MAP-25 | `token` (824) | gold dashed "ink ring" under the party | keep; comment wording only | 0 | token tests |
| MAP-26 | gallery sheets (1201 to 1273) | titles mention paint bloom, paper doodles | update titles ("ART.map.paintBloom film strip (wavefront from the touch point)", "ART.map.paper doodles") | S | sheets must render |
| MAP-27 | `liveTile` (already animated per frame; fog stays baked and still) | woken hexes are static | motion is the awake signal: for woken hexes within 3 of the party only, a slow seeded sway by kind (bamboo stamps bend +-2 px over 3 to 5 s, water tiles get one ripple ring, lantern and bell stamps flicker alpha +-0.1), plus one faint `tk.soundRings` ring every 4 to 6 s per hex (phase seeded by `U.hash(q, r)`); skipped entirely under reduceMotion and quality low; at most 19 hexes, about 2 draw calls each | M | fog still; liveTile deterministic for a given t; reduceMotion and low quality add no calls |

Map look, in one paragraph for the executor: the ground is cool pale grey with static grain; fog hexes are a slightly lighter grey with a dotted outline
and faint ghost sketches; woken hexes are the bright watercolours with two soft echo rings around the stamp AND, near the party, they move (MAP-27), because the Hush made the land grey and STILL; the boundary between them is
a thin bright wavefront; the Void is a dark static-fringed hole; a reveal is a circular wave of colour with rings escaping and a note rising.

---------------------------------------------------------------------------------------------------------------------------------------------------

### 5. `js/art_scenes.js` (3318 lines) besides the title and logo

| ID | Item (line) | Today | Echo direction | Tier | Size |
| --- | --- | --- | --- | --- | --- |
| SC-01 | header comment (1 to 47) | "INKWOVEN logo", "ink drip", "washi grain" | update wording (title, pulses) | 1 | S |
| SC-02 | victory `vcFront` (2973 to 2987) | boulder + `titleBook(g, true)` "the mended book" | the boulder stays; on it `titleBell(g, true)` scaled 0.72 (same transform) or a small belfry; add an anim item: every 2.4 s a gold ring (`ctx.arc`, `#fff0c0`, lineWidth 6 to 1) expands from the bell lip to r 900 across the sky (skip when `T.mot < 1`), plus a few rising notes | 1 | M |
| SC-03 | `SCENES.victory.mood` (3023) | 'dawn over the finished book' | 'dawn, the bell rings again' | 1 | S |
| SC-04 | defeat: `dfInk` (3053) | ghost of the grove in ink wash on paper | the grove drained grey: same shapes in `#8e8aa3` / `#6f6b86` on a `pal.hush` ground | 1 | M |
| SC-05 | `dfBlank` (3076) | torn blank paper patches eating in | grey static fog patches (reuse the title's `titleHush` painter) | 1 | S |
| SC-06 | `dfPool` (3087) | ink pool | a still grey puddle with 3 frozen ripple rings (no motion) | 1 | S |
| SC-07 | `dfBrush` (3099) | a dropped brush and a red hanko | a hero's bachi drumsticks and a dropped flute lying still on the ground; no bell, no hanko | 1 | S |
| SC-08 | `dfDripSpecs` + its anim (3114 to 3140) | ink drips run down from the top | colour draining: the same drips in grey `#b9b6c6` with white highlights (reads as colour running out of the world), or replace with slow falling grey "ash of sound" motes | 1 | S |
| SC-09 | `SCENES.defeat` (3117) | layers 'paper', 'ink', 'blank', 'pool', 'brush'; mood 'ink fading to blank paper' | layer 'paper' -> hush ground (call a new `hushPaint(g, w, h, seed)` or `paperPaint` with grey colours); mood 'the world falls silent' | 1 | S |
| SC-10 | `paperPaint` (3150) + `SCENES.paper` (3196) | warm washi parchment: fibres, foxing, coffee rings, creases, aged edge. Used as the Library and How-to-play backdrop (`screen_menu.js` 1616, 1699, 2042) | "silk": pale cool cream `#f1eff5` to `#e2dfea` with a fine woven crosshatch (two sets of 1 px lines alpha 0.05), soft folds kept, NO coffee rings or foxing, the aged edge becomes a soft lavender vignette. Keep id 'paper', `opts.seed` and `opts.edge` behaviour | 2 | M |
| SC-11 | ch3: `voidTear` (1600) + `C3_TEARS` layer + glow anim | white paper rips in the sky with halftone | "hush rifts": keep the jagged outline and ink edge, fill with grey `#c9c6d4` to `#8e8aa3` radial, 30 baked static dashes inside; add a cheap live flicker in the existing glow anim (2 random-looking dashes per rift chosen by `Math.floor(T.tt * 12)` hashed with the seed through `U.hash`) | 1 | M |
| SC-12 | `c3PageSpr` (1756) + the 'pages' drift (1846) | torn manuscript pages with a censor bar drifting | drifting grey felt scraps and cotton tufts (`c3TuftSpr(k)`: 3 puffs cel-filled `#f2f0f6` / `#cfcdd8`), keep one variant with a black mute bar | 1 | S |
| SC-13 | `dropSpr` (1769) 'tears' drift | white teardrops | keep (rain) | 0 | |
| SC-14 | `c3BossExtras` (1901 to 1931) 'ghostpage' | a ghost manuscript page with text rows struck out by censor bars | a ghost five-line staff (5 long faint lines) with note heads, several struck through by black bars ("the music being censored"); keep the 'rip' (as a hush rift) and the drifting black bars (they read as mute bars) | 1 | S |
| SC-15 | `SCENES.boss3.mood` (1933) | 'the sky being edited' | 'the sky falling silent' | 1 | S |
| SC-16 | ch3 header comment (1591) | "torn pages drifting, white tears of the Void" | "the soundless storm: lightning without thunder, hush rifts" | 1 | S |
| SC-17 | `inkFrame` (591) boss dry-brush edge frame | ink look | keep (line style) | 0 | |
| SC-18 | shop `scrollItem` (2151) wares | scrolls for sale | optional: swap 2 of the scrolls for a small taiko and a coiled shamisen string bundle | 3 | S |
| SC-19 | camp, treasure, event, ch1, ch2, boss1, boss2 | Japanese scenes, no book theme | keep | 0 | |
| SC-20 | defeat, new layer `bell` (after SC-09's layers) | none | the temple bell from `titleBell` drawn small (x 0.45) in the drained grey grove: WHOLE, re-wrapped in grey Hush threads, its striker hanging still; never cracked (a rest is not the end of the music) | 1 | S |

Tests: `tests/rogue_book_art_scenes.test.mjs` (301 lines) pins: every scene draws, combat scenes keep ground 520, `paper` is still and seeds differ and is
cached per size and seed, `ART.scene.lastError` stays null, title and camp clip and composite >= 4 cached layers, animated scenes differ over t.

---------------------------------------------------------------------------------------------------------------------------------------------------

### 6. `js/art_icons.js` (1968 lines)

| ID | Function (line) | Today | Echo direction | Size | Test constraints |
| --- | --- | --- | --- | --- | --- |
| IC-01 | header (1 to 36) | "calligraphic ink line ... washi grain" | line style wording can stay; describe the new stat and tile icons | S | |
| IC-02 | `STAT_LOOK` (443) | ink `#7a6bff`, brush `#3fd6b0`, inkstone `#8a86a8` | keep ink and brush colours; inkstone -> `#6a5be8` (violet stone) | S | |
| IC-03 | `STATF.ink` (458) | ink drop, lit or dashed empty | Echo ping. on: glow `#7a6bff` 0.4; centre disc r 13 cel `#5a4ae0` (shadow `#1e1670`, rim cyan); ring r 24 stroked 6 (`#7a6bff`) over an ink stroke 9; outer arcs r 36 from -0.75..0.75 rad and PI-0.75..PI+0.75 (stroke 5, `#5ff5ff`, round caps); spark at (22, -22). off: the same three shapes as a dashed outline `#8a86a8` with a faint `#3a2f5a` fill on the disc | S | on and off differ; empty is its own sprite |
| IC-04 | `STATF.brush` (498) | fat fude with an ink dab | Song: two beamed eighth notes (heads at (-16, 22) and (16, 14), stems up to y -26 / -34, a thick beam), teal `#3fd6b0` heads with ink outline, a small sound swash arc under them | S | draws with on false |
| IC-05 | `STATF.inkstone` (511) | inkstone slab with ink pool and sumi stick | Chimes (the meta currency): three hanging tubular chimes of different lengths (bronze `#c9893a` cel, gold caps `N.gold`) on short cords from a lacquer bar (`#5a4ae0`), a small round striker disc between them, 2 sound arcs to the right; reads as a wind chime at 24 px | S | draws with on false |
| IC-06 | `STATF.hp` (472) | heart over a brush swash | optional: the swash becomes a heartbeat pulse line (a zigzag under the heart) | S | on/off differ |
| IC-07 | `GLYPH.sumi` (369), `STATUS_LOOK.sumi` (256) | ink drop on a violet disc | Kuro's resource (player name Breath): a white breath curl (three stacked wind spiral strokes, the kaze motif) rising from a short flute mouthpiece, two cyan dots; keep the violet disc and gold rim | S | status sheet renders |
| IC-08 | `TYPEF.status` (582) | torn page with text lines and an ink stain | a card shape with 3 horizontal static bands (white and `#8a86a8` dashes), a jagged crack, no text lines, no ink blot | S | takes a colour |
| IC-09 | brush section (633 to 695): `brushSpec` paper tag (657 to 670) | cream paper tag + paper grain, dashed brown unpainted neighbours, cream origin hex | lacquer plaque `#241a3a` (rim gold `N.gold` 1.6, shadow `#100a24`), unpainted neighbours dashed `#5a5678` alpha 0.6, origin hex pale `#e8e6f0` with a dot `#5a5678`; new cells unchanged (teal); then a badge glyph in the top-left corner (centre (-30, -30), size 18) drawn with STROKES and `arc` only, NO `closePath` (see constraint): stroke 'Drum Line' two crossed sticks with round ends; wave 'Ripple' three nested arcs; fan 'Shout' three rays fanning from a point; splash 'Beat Drop' a down arrow onto a line with 4 burst ticks; halo 'Chorus' 6 dots (arc fills) round a centre dot; blot 'Hum' a single note head (ellipse fill, no closePath) with a tilde | S | each brush draws >= 4 `closePath` hexagons; each picture differs; hex counts splash > blot, wave > blot, wave > stroke: badge glyphs must not add `closePath` |
| IC-10 | `stampBase` (1023), `STAMP` (1013) | vermilion hanko seal, paper pinholes | Tier 3 option: a taiko drum head (cream `#f3ead6` skin, thick vermilion lacquer rim, a ring of 16 black tacks) with the black glyph on the skin. Default: keep the hanko (it is a look, the glyphs carry the theme) | M (opt) | tile sheet, done fade |
| IC-11 | `TILEF.start` (1055) | bookmark ribbon | hyoshigi: two wooden blocks (black fills, rounded rects 12 x 52) crossed at the top, joined by a cord loop, 2 impact sparks (PAPER) at the meeting point | S | |
| IC-12 | `TILEF.well` (1126) | wishing well, stone drum, drop | temple bell: KEEP the roof and posts (lines 1128 to 1129), replace drum, rim and drop (1130 to 1134) with a bell (black fill: crown arc, body widening to a flared lip, y -12..26, width 22..34), two PAPER band bars across it, a PAPER striker log at right hanging on two strokes, 2 PAPER sound arcs left of the lip | S | |
| IC-13 | `TILEF.brush` (1137) | fude brush + ink swash | Songbird (tile name): a small round uguisu silhouette (black fill, body ellipse 26 x 18, tail wedge, open beak) perched on a short branch stroke, two PAPER sound arcs and one PAPER eighth note in front of the beak | S | |
| IC-14 | `voidSpec` (1163) | tear in the page: cream rim, black-violet hole, lost stars | dead silence: no cream rim fill; hole `#0d0b1e` cel with rim `#4a465e`; 26 static dashes (white alpha 0.5, `#8e8aa3`) inside; no stars | S | |
| IC-15 | `RELICF.brush` (1372) | fude + ink blot (Sable Brush) | a pair of taiko bachi drumsticks crossed (wood `p.base`, gold end caps), 2 sound arcs, no ink blot | S | |
| IC-16 | `RELICF.inkstone` (1384) | inkstone slab + sumi stick (Heavy Inkstone, Nightlong Inkwell) | a rin singing bowl (bronze `#c9893a` bowl on a small cushion `p.base`) with a striker resting on the rim and 2 rising sound arcs `p.glow` | S | |
| IC-17 | `RELICF.ink_drop` (1743) | vial of spare ink with a drop on the label | keep the vial and stopper; the liquid becomes a glowing echo (deep violet fill + a cyan echo ping inside the glass), the label drop becomes a small note | S | |
| IC-18 | `RELICF.scroll`, `seal` | scroll, chop | keep | 0 | |
| IC-19 | `MOTIF_PAL` (1810) | duplicate of the card palette table | keep ids | 0 | |
| IC-20 | sheets `icons_ui` (1923) title | "brushes (mini hex grids)" | "songs (mini hex grids)" | S | |

---------------------------------------------------------------------------------------------------------------------------------------------------

### 7. `js/art_heroes.js` (2122 lines): Kuro the Songweaver (KURO block lines 797 to 1075, bust 1899 to 1932), size M

Keep Kuro's face, hair, glasses, palette (`c` at 801: indigo coat `#2b2678`, cyan trim `#5ff5ff`, violet eyes), rig and all anchor NAMES
(`brush`, `tip`, `weapon`, `bladeMid`, `hand`). Keep the weapon's tip anchor at `W[1] - 206` by making the flute long (an oversized weapon is in style).

| ID | Part (line) | Today | Echo direction |
| --- | --- | --- | --- |
| KU-01 | `weapon` (962 to 980) | lacquer shaft to y -150 with 4 gold bands and cyan rune ticks, gold ferrule, a 58 px brush head with a cyan gradient tip | an oversized lacquered shakuhachi: shaft from y 36 (root end) to y -198, width 3.6 at the root tapering to 3.2; bamboo node bulges as 5 gold bindings at y [-176, -128, -82, -36, 10] (height 4); 4 finger holes on the front at y [-60, -86, -112, -138] (ellipses 1.8 x 2.6, fill `#0a0620`, cyan rim 0.8) replacing the rune ticks; the blowing end (utaguchi): an angled cut polygon [[-3.4, -198], [3.4, -198], [4.2, -206], [-3.0, -212]] with a white horn inlay wedge [[-0.6, -205], [3.8, -206], [3.2, -210]] in `#f4f0ff`; the root end: a flared knob ellipse (6.5 x 8) at y 38 in `c.shaftD` with a gold ring; a short indigo tassel cord tied below the second binding. Delete the brush head and its gradient |
| KU-02 | `handGlow` (1040 to 1058) | glow at the brush head; rising sparkles from the tip; attack flings ink blots | glow stays at the `brush` anchor (now the flute mouth); idle and power: 2 thin rings expanding from the tip (`ctx.arc`, `#5ff5ff`, period 1.6 s) plus 1 or 2 small `tk.note` glyphs drifting up and fading (replace the sparkles); attack: replace `tk.inkBlot` with 5 small notes and 2 rings flung along the swing (same seeded math) |
| KU-03 | `glyphStrokes` + `glyphFx` (1016 to 1038) | a calligraphy character written stroke by stroke inside a cyan circle (cast) | a note sigil written stroke by stroke with the same progressive mechanism: strokes [[-14, 22], [-14, -26]], [[-14, -26], [16, -34]], [[16, -34], [16, 14]], [[-26, 22], [-8, 26]] (head as a thick short stroke), [[4, 14], [22, 18]] (head), then an arc pair outside ((sound waves) at radius 30 and 38, start -0.6 to 0.6 rad) |
| KU-04 | `orb` + `orbFx` (992 to 1014) | 3 violet ink orbs orbiting | "sound pearls": keep the orbs but add a thin cyan ring around each (r * 1.5, alpha 0.5) and a tiny white note in the highlight position at detail >= 1 |
| KU-05 | `scroll` part (930 to 941) | a paper scroll strip hanging from the belt (chain sway) with text ticks and a rolled scroll | a flute bag cord: the same chain spine and box, drawn as an indigo brocade cord (`c.coatL`, wMax 6) ending in a gold tassel and a small bronze flute charm (a miniature shakuhachi: a 12 px bronze `#c9893a` rod with two dark holes; never a bell, small bells are Suzu's); the rolled scroll at the belt becomes the flute's brocade bag tie (a short indigo cylinder with gold bands) |
| KU-06 | `coatFront` (912 to 920), `coatTail` (922 to 928) | ink-splash hem (tk.inkBlot cyan and white) | waveform hem: a sine line along the hem (S.line through 12 points, amplitude 2.5, `c.trim`) and 3 small ring motifs (circles r 3 stroked cyan) instead of blots |
| KU-07 | `armLower` (892 to 910) | glowing calligraphy on the back of the hand | a small glowing ring + dot (echo ping) |
| KU-08 | `torso` (942 to 960) | "drips of cyan ink down the chest" | a short cyan sine line (sound line) |
| KU-09 | `BUST.kuro` (1899 to 1919) | glowing calligraphy strokes on the shoulders, ink blots on the hem, the fude staff climbing out of frame | shoulders: waveform lines (sine paths) in `c.trim`; hem: ring motifs; the staff: same taperPoly with gold bindings plus 3 finger holes |
| KU-10 | `BUSTFX.kuro` (1921 to 1932) | glowing brush head above the frame | the flute mouthpiece above the frame (angled cut + horn inlay) with the cyan glow and 2 expanding rings; orbs kept |
| KU-11 | header (1 to 40) and the "KURO, the Inkweaver" banner (797) | text | "KURO, the Songweaver" |
| KU-12 | shared contact shadow "dry-brush ink smear" (271 to 300), portrait sumi backdrop (1727) | line-style elements | keep |

Tests: `tests/rogue_book_art_core.test.mjs` hero section pins finite anchors, the tip moving > 20 px in an attack, portrait and medallion safety. The token
and card hero silhouettes reuse `ART.hero.draw`, so Kuro's flute appears on the map and on hero cards for free.

---------------------------------------------------------------------------------------------------------------------------------------------------

### 8. `js/art_cards.js` (2441 lines): motifs and card grounds

Motif ids are internal and stay. 10 of Kuro's 37 cards use an ink/paper motif, plus shared junk cards. Usage (from DATA):

| Motif id | Cards | Echo drawing (redraw the `M.<id>` function, keep the 100 x 100 design box, detail levels, `S.anim` behaviour) | Size |
| --- | --- | --- | --- |
| `ink_splash` (M at 1116) | kuro Ink Bolt, curse Smudge, status Blot | Beat Burst: a dark core disc (r 20, INK) with a jagged waveform rim (22 points alternating r 21 and 30), 3 concentric rings outside (r 34, 42, 50, `f.base` alpha 0.7/0.45/0.25, `S.wave` pulses them when animated), 6 short tapered "sound spikes" radiating; satellite dots kept as small note heads | M |
| `ink_wave` (1136) | kuro Ink Flood | Sound Wave: keep the Hokusai crest silhouette and swell, replace the ink crest fill streaks with 5 parallel sine striations along the crest (`f.hot`, lineWidth 1.2), the spray becomes small note heads and dots | S |
| `brush_stroke` (1096) | kuro First Stroke | Melody Ribbon: keep the bez3 path and the fat stroke (it is a ribbon of sound now: colour `f.base` with an INK edge instead of solid INK), 5 note heads riding the ribbon, and at its end the flute mouthpiece (angled cut + horn inlay) instead of the fude | S |
| `calligraphy` (1075) | kuro Grind Ink, Grand Flourish | Crescendo: a big hairpin "<" made of two confident tapered strokes from the left point, with 3 beamed notes bursting out of the open end; keep the paper-tinted disc behind and the vermilion seal replaced by a small gold mitsudomoe (taiko crest: 3 commas in a circle) | M |
| `quill` (1054) | kuro Ink Flick, Redraft | Tuning Fork: a silver fork (two tines, a stem) angled 0.86 rad like the quill, struck: 3 vibration arcs either side of the tines, the flourish line under it kept as a wavy sound line | S |
| `book` (1032) | kuro Flip the Page, Second Edition | Biwa: a pear-shaped lute body (cel `f.dark`, sound holes as crescents), a bent neck with 4 pegs, 4 strings, a bachi plectrum; rising note glyphs replace the rising runes | M |
| `scroll` (1007) | hanae Sakura Sort, kuro Skim the Scroll, suzu Paper Seal; relic icon 'scroll' (Bounty Scroll, Formation Scroll) | keep the scroll; the lettering rows become notation: dots and short dashes (shakuhachi-style notation) instead of letters | S |
| `void` (756) | curse Burden, status Redacted | Hush Hole: keep the torn hole and spiral; fill rim with grey static dashes, and the "torn paper scraps being pulled in" (770 to 776) become small broken note glyphs being pulled in | S |
| `sigil` (780) | hanae Petal Mark, kuro Inkblot Verdict, suzu Banishing Seal, curse Hex | keep (magic circle); optional: rune ticks -> note dots | 3 S |
| `talisman` (988) | kuro Shelter Script, suzu Ofuda, Ofuda Barrage | keep (shrine ofuda are not book theme) | 0 |

Card grounds and junk (all in the composer, ids internal):

| ID | Item (line) | Today | Echo | Tier | Size |
| --- | --- | --- | --- | --- | --- |
| CA-01 | `inkSwash` (1975) "the game's signature underpainting" | dry-brush sumi swash | keep (line look) | 0 | |
| CA-02 | `BG.wash` (2016) | paper ground + enso brush circle + ink splatter | keep the enso (reads as a ring); ground stays a pale tint | 3 | S |
| CA-03 | `paintFG` 'drips' kind (~2202) and `FG_BY_PAL` (2183) | ink drips in a corner | 'drips' draws 3 to 5 falling note glyphs (`tk.note`, `f.light`) instead of drips; keep the key | 2 | S |
| CA-04 | `SEC` (2091) secondary stamps 'violet' and 'ink' families | ink_splash, brush_stroke | fine once the motifs are redrawn | 0 | |
| CA-05 | `paintJunk` (2281) curses torn black-violet, status "damaged pages" (burnt corners, punched hole) | paper damage | curses: keep torn edges, add a grey desaturation pass (`globalCompositeOperation 'saturation'` with `#808080` at 0.6 is fine in Chromium; or a grey multiply) so curses read "hushed"; status: keep damage marks but add 2 static bands | 3 | S |
| CA-06 | `JUNK_EXTRA` (2321) `status_blot` | 6 ink blots | 6 grey static blobs (soft discs `#8e8aa3` with white dashes) | 3 | S |
| CA-07 | header comment (1 to 40) "blank inked page", "damaged pages" | wording | update | 1 | S |

Tests: `tests/rogue_book_art_cards.test.mjs` (374 lines) pins: every motif draws as a distinct standalone icon, deterministic, never throws, cached per id
+ up + size. `tests/rogue_book_art_icons.test.mjs` "motifs: every LISTS.motifs id is a round standalone icon, different from the next".

---------------------------------------------------------------------------------------------------------------------------------------------------

### 9. Enemies

#### 9.1 Chapter 3 (`js/art_enemies_3.js`, 3829 lines), size L. The Hush's citadel

Design language: the Hush builds its servants from sound-absorbing stuff: grey felt with stitched seams, cotton wadding, anechoic foam wedges, black
mute bars (the existing censor bars stay: a black bar already reads as "silenced"). The storm creatures (storm_drone, komainu_guardian, sky_serpent,
thunder_crow, storm_whelp, spark_mote) are "the storm with no thunder" and need no change. Chapter palette `C` (line ~43): add `felt '#6e6a7e'`,
`feltD '#46425a'`, `wad '#f2f0f6'`, `foam '#2e2b3a'`, `static '#8e8aa3'`. The death dissolve `fragment()` (497) kinds 'paper scraps', 'letters',
'eraser crumbs' become 'felt scraps', 'notes' (`tk.note`), 'cotton puffs'. Suggested player names are for the naming lens; ids never change.

| Id (line) | Today | Echo re-skin | Name (ignore: section 5 of the plan is authoritative) | Size |
| --- | --- | --- | --- | --- |
| redaction_knight (973) | ivory paper plate armour struck through with black censor bars, face a black bar with red slit eyes, red seal | grey felt plate armour with quilted stitch lines instead of paper texture; keep the black bars and red slits; the red seal becomes a red "mute" mon (a circle with a horizontal bar) | Mute Knight | S |
| void_scribe (1171) | hooded clerk of the Blank, blank paper mask, a brush loaded with ink (`scribeBrush` 1177), a scroll | hooded acolyte with a cotton-white mask whose mouth is stitched shut; `scribeBrush` becomes a cloth-wrapped damper mallet (a padded head, no bristles); the scroll becomes a folded grey cloth | Hush Acolyte | M |
| blank_soldier (1344) | origami soldier folded from one sheet, accordion arms (`pleats` 1349) | grey felt soldier: same folded geometry, felt colours, stitched seams along the folds (dashed lines), pleats stay (quilting) | Felt Soldier | S |
| eraser_wraith (1658) | pencil ghost half rubbed out, graphite hatch, holding an eraser, music `note()` helper already exists (1663) | a static ghost: body in TV-static hatch (grey and white short dashes) instead of graphite; the eraser block becomes a wad of cotton it presses on mouths | Static Wraith | S |
| paper_golem (1902) | faceted cream paper giant printed with text rows (`textRows` 1908), knots | quilted felt and foam golem: facets coloured felt/feltD, `textRows` replaced by anechoic foam zigzags (a row of small triangles) on the big facets, knots kept as stitched buttons | Wadding Golem | M |
| margin_imp (2065) | margin doodle in a shaky hatched pen line (`penHatch` 2070), cream paper skin | keep the jittery line (now "crackling static"), skin becomes pale grey `#dcdae4` with static flecks; magenta horns kept | Static Imp | S |
| censor_golem (2211) | iron filing cabinet, black censor bar, a door-sized rubber stamp 'DENIED' (2309), an ink pad, papers spilling | iron soundproof vault: quilted padded door panels, the stamp text becomes 'SHH' (or no text, a big mute mon), the ink pad becomes a felt pad, spilling papers become cotton tufts; red scanner light kept | Silence Vault | M |
| black_bar_inquisitor (2548) | black robe, ivory mantle of black bars, gold gavel | keep bars and robe; the gavel head is wrapped in grey cloth (a silent gavel), mantle colour from ivory to cotton white | Hush Inquisitor | S |
| blank_page (2785) minion | a sheet of paper with a torn edge, dog-ear, ruled lines (`bpSheet` 2792) | a small square felt patch with a zipper mouth (a row of tiny teeth across the middle), stitched border, dog-ear kept | Muffle | S |
| typo_sprite (2940) minion | a typewriter key with a glitching magenta face | a round speaker-grille face (concentric holes) crackling static, glitch kept | Hiss Sprite | S |
| boss_editor (3044) | see 9.2 | see 9.2 | | L |

#### 9.2 The final boss trio (`boss_editor`, BE_P / BE_C / BE_RIG, 3044 to 3700), size L

| Phase | Today | Echo | Name (section 5 is authoritative) | Main changes |
| --- | --- | --- | --- | --- |
| 0 | THE EDITOR: pale gaunt scholar, ink-black gown, paper cravat, half-moon spectacles, silver tail, manuscript stack under one arm, a red pen as long as a spear; a fan of manuscript pages (`bePage`, 3062) with red edits and black bars sways behind; proofreader's marks orbit (`beMark`, 3207: pilcrow, caret, delete loop, stet dots, strike) | THE CONDUCTOR OF SILENCE: same figure and gown; the red pen becomes a long white conductor's baton with a red tip and a silver ferrule; the manuscript stack becomes a stack of folded black fans tied with the red ribbon; the page fan becomes a fan of folded paper sensu leaves each painted with a black mute bar or a rest; `beMark` kinds become musical silence marks: 0 quarter rest (zigzag), 1 fermata (arc + dot), 2 breath mark (comma), 3 whole rest (bar under a line), 4 strike line (kept) | the Conductor | M |
| 1 | THE ERASER: hulking pink rubber giant, ERASE sleeve band (text at 3346), brass ferrules, crumbs and graphite smears (`eraserDecor` 3317, `eraserSleeve`, `eraserLeg`, `eraserPad`, `eraserArm` 3323 to 3460) | THE DAMPER: the same hulk recoloured to charcoal felt (BE.pink `#f4a3b8` -> `#6e6a7e`, pinkL -> `#9d99b2`, pinkD -> `#46425a`), quilted stitch lines instead of graphite smears, the band text 'ERASE' -> 'SHH' (or a mute mon), the knuckle blocks are piano-damper felt hammers, crumbs become cotton fluff | the Damper | M |
| 2 | THE BLANK PAGE: a colossal face-shaped tear in the page (`tearPts` 3461), ragged paper lips curling back from a violet-black void, slit eyes and mouth of blank white light, broken spectacles, paper hands clawing in, letters sucked into the mouth (`beMouth` 3552) | THE HUSH (true form): keep the face-shaped rift and the violet void; the paper lips become a fringe of grey static and frayed felt; the eyes and mouth stay as slits of white light; the hands become grey felt gloves; the letters being sucked in become note glyphs (`tk.note`) and small sound rings shrinking into the mouth; inside the grey, at alpha 0.18, the silhouette of a yamabiko (a shaggy mountain imp with long arms) so the Hush has its folklore shape, and the face reads as pouring out of the Conductor's figure | the Hush | M |

Tests: `tests/rogue_book_art_enemies_3.test.mjs` (252 lines) pins ids, bounds per size class (boss >= 320 tall), every pose and phase draws, idle animates,
phases differ, phase 3 keeps the last form, death ends with almost no part sprites, reduce motion clean, cost bounded. All behavioural: re-skins pass if
geometry and rigs are kept. The sheet `boss3` label strings (`names` array at line 3795: phase 0: the Editor, phase 1: the Eraser, phase 2: the Blank Page) need new names.

#### 9.3 Chapter 1 (`js/art_enemies_1.js`)

| Id / helper (line) | Today | Echo | Size |
| --- | --- | --- | --- |
| `FX.page` (329) | "a page torn from the book: curled corner, ruled lines of brush script, a violet glyph" | `FX.note`-style captured sound: a small translucent bubble (circle, `#e8e0ff` alpha 0.5) with a glowing violet note inside; keep the function signature so callers do not change (or rename to FX.note and update the 3 call sites 2254, 2417) | S |
| boss_kuzunoha (2156 to 2420): tail plume "dipped in ink like a calligraphy brush" (2168), "brushed enso ring" behind the wheel in phase 1 (2261), pages turning about her (`foxPages` 2410), page burst in the attack (2254) | ink-tipped tails, enso, orbiting pages | tails tipped with violet hush smoke (keep the ragged dark tip silhouette, colour `#5a3a8a` fading to grey, no drips); the enso becomes 3 concentric sound rings turning; the orbiting pages become captured-sound bubbles (FX.page re-skin), more of them in phase 1; on hurt a few bubbles pop into free notes | M |
| paper_kodama (2080 to 2150) minion | doll folded from a torn page by the fox's brush, leaks violet ink (drips from the eye holes) | keep the paper doll; the ink drips become slow grey mist puffs (silence leaking) | S |
| karakasa, mushroom_folk, others | folk yokai | keep | 0 |

#### 9.4 Chapter 2 (`js/art_enemies_2.js`)

Nothing book-themed. Optional Tier 3: dissolve fragment kind 'ink' (`fragment`, ~410) recoloured to grey static so deaths "release sound" consistently
(the SCENE death burst is the better place, see 11.6).

---------------------------------------------------------------------------------------------------------------------------------------------------

### 10. `js/art_fx.js` (1652 lines)

| ID | Effect (line) | Today | Echo | Size | Test constraints |
| --- | --- | --- | --- | --- | --- |
| FX-01 | `FX.inkSplash` (468 to 519) with `blobPath`, `SPLAT`, `poolPath`, `splatPath` (433 to 466). Used by SCENE for the 'ink' damage element (Kuro), every summon, every death, AND by screen_map on every hex reveal | wet ink splat: pool pops, droplets fly, it dries and drips | Sound Burst: 0..0.17 a dark core pops (keep `eoBack`), its rim is a waveform (17 points alternating radius as today, but straight `lineTo` between them so it reads as a sound wave, not a blob); the 9 spikes become tapered "sound spikes" (keep the seeded angles, drop the end beads); the 3 drips become 3 concentric rings expanding from r to r*2.6 over 0.2..0.9 (inked annulus like `oneRing`, colour P.c1 / P.c2); the 13 satellite droplets become small note heads (ellipse + stem) flung on the same arcs; the hard shadow + halftone kept; gloss replaced by a white flash ring at 0.1..0.3. `nominal.inkSplash` 130 -> 150 | M | seeds differ; dir mirrors (keep seeded asymmetry); ang rotates; colour changes the picture, bad colour = default; reduceMotion and low quality never ADD calls (use `cnt()` for the note count) |
| FX-02 | `FX.brushDrag` (1435) | dry-brush stroke dragged from (x, y) to (x2, y2) | Sound Sweep: a ribbon whose two edges are sine waves (amplitude falls toward the tail), 3 inner sine lines, notes thrown off the head instead of splatter | S | follows end points; default end point |
| FX-03 | `FX.debuff` (1103, via `aura` 1053) "dark ink mist and dripping drops" | ink mist | optional: grey static flecks instead of drops | 3 S | buff up, debuff down |
| FX-04 | header list (16 to 47) | inkSplash and brushDrag descriptions | update wording | S | |
| FX-05 | `fx_combat` sheet mode 'ink' (1610) | sfxText 'SHAA!' | 'WAAN!' (echo onomatopoeia) | S | sheet renders |

---------------------------------------------------------------------------------------------------------------------------------------------------

### 11. Art living outside `js/art*.js` (owned by other lenses; listed so nothing is missed)

| ID | File (line) | Today | Echo art direction | Size |
| --- | --- | --- | --- | --- |
| X-01 | `css/base.css` 37 `--drop` (ink-drop SVG, 60 x 68 viewBox) used by `.c-cost` (248, card cost), `.back-drop` (301, card back), `css/combat.css` 213 `.cm-orb` (energy orb), `css/map.css` 34 `.mp-drop` (Ink meter pips), 158 `.mp-fly-in`, `css/node.css` 395 `.dk-hint-mark` | ink drop for BOTH energy and Ink | split into two tokens, same 60 x 68 viewBox so no size changes: `--orb` (energy, used by .c-cost, .cm-orb, .back-drop, .dk-hint-mark): `<circle cx='30' cy='36' r='26'>` radial `#7af7ff` -> `#2a9fc0` -> `#140f2e`, stroke `#5ff5ff` 2.6, a white tomoe comma path and a highlight ellipse; `--echo` (Echo, used by .mp-drop, .mp-fly-in): dot r 7 + ring r 14 (stroke 4) + two arcs r 22 (stroke 3.4, round caps) in `#7a66ff` / `#5ff5ff` on transparent | S |
| X-02 | `css/base.css` 302 to 303 card back `.back-ring` / `.back-word` (ui.js 1617 text 'INKWOVEN') | gold ring + ink drop + title word | keep the ring, put `--echo` art in the middle, new title word | S |
| X-03 | `css/node.css` 188 to 237 event screen `.ev-book`, `::before` (leather cover), `::after` (page stack), `.ev-page.left/right` (two pages with gutter shadows), `.ev-gutter`, `.ev-ribbon` (bookmark), `.ev-plate`, `.ev-seal` 'Fable' hanko; built in `js/screen_node.js` 1570 to 1578 | an open storybook | KAMISHIBAI STAGE (keep every class name and the 1136 x 592 geometry, so no text reflows): `.ev-book::before` = the wooden butai box (repeating-linear-gradient wood grain `#6b3a1e` / `#4a2412`, a gold hinge strip, inner black stage edge); `.ev-book::after` = the butai's base drawer (a darker wooden sill with two small brass knobs) instead of page edges; `.ev-page.left` = the stage opening: dark `#140f2e` interior round the plate, plus two open door leaves as `.ev-page.left::before/::after` (wood panels with a kumiko lattice gradient, `transform: perspective(600px) rotateY(+-55deg)` hinged on the outer edges); `.ev-page.right` = the narrator's board: keep the washi paper but drop the inset gutter shadow (`inset 70px 0 70px -40px`) and round all four corners; `.ev-gutter` = a vertical lacquer post 12 px wide between them (same position, no layout change); `.ev-ribbon` = a pair of hyoshigi clappers hanging on a cord over the post (two wood rectangles via a background gradient, same box). The plate scene canvas stays the picture card. Sound cue (audio lens): a hyoshigi clack when the stage opens | M |
| X-04 | `css/end.css` 54 to 94 story page `.st-page` (`::before` spine 46 px, `::after` page curl 58 px), `.st-drop` illuminated initial, `.st-seal` hanko (ONCE / roman / END / BLANK / ? from `screen_end.js` 88 to 94) | a book page | a lacquer-framed hanging plaque: `::before` becomes a lacquer side rail (same 46 px, `#1b1430` with a gold hairline), `::after` becomes a gold corner fitting (no curl). KEEP the paddings and `--pg-x` (pinned by `tests/rogue_book_screen_end.test.mjs` 530 to 547). Seal text 'BLANK' and kicker 'A HERO OF THE BOOK' are for the naming lens | S |
| X-05 | `js/ui.js` 652 to 760 transitions: `paintPage` (a paper sheet slides in and lifts away like a turned page), `paintInk` (ink blobs bloom over the screen) | book and ink transitions | keep kind names 'page' and 'ink'; `paintPage` -> a shoji door sliding across (lacquer frame `#1b1430`, rice-paper panes `#f1eff5` divided by a 4 x 3 kumiko grid, the same bowed leading edge is unnecessary: straight edge); `paintInk` -> a sound-ring wipe: the same `INK_BLOBS` centres, but each blob is a circle with a bright `#5ff5ff` ring edge (lineWidth 3) and a night fill | M |
| X-06 | `css/base.css` 492 to 495 `.rot-book` (rotate-device panel animates a book) + ui.js 264 text | a rotating book | a rotating phone outline with 3 sound arcs beside it (`.rot-phone` already exists; restyle `.rot-book .rp` as arcs) | S |
| X-07 | `rogue_book/index.html` 7 favicon (ink-drop SVG), 16 to 17 `#boot i` ink drip animation `bootDrip`, 42 and 57 'INKWOVEN', 8 `<title>`, 9 meta description | ink drop and drip | favicon: dark rounded square + echo ping (dot r 3.2, ring r 7, two arcs r 11) in `#7a66ff` / `#5ff5ff`; boot: `#boot i` becomes a ring (`width:20px;height:20px;border-radius:50%;border:3px solid #5ff5ff`) with `@keyframes bootPulse { 0% { transform: scale(.4); opacity: 0 } 30% { opacity: 1 } 100% { transform: scale(1.6); opacity: 0 } }`; reduce-motion rule kept | S |
| X-08 | `rogue_book/gallery.html` 6, 7, 229 | ink-drop favicon, 'INKWOVEN gallery' | same favicon as X-07, new title word | S |
| X-09 | `js/screen_menu.js` 7, 294 to 425 (`BOOK` const, the fallback title painting: an open book, pages, words lifting off, an ink bloom, the 'blank' layer), 428 to 445 `drawLogoFallback` ('INKWOVEN' twice), 186 to 200 library backdrop "bookshelf silhouettes" | book art drawn by the screen when ART is missing, and a bookshelf | fallback title: a simple bell silhouette (circle-topped trapezoid) on the cliff instead of the book, rising notes instead of words, grey hush instead of 'blank'; fallback logo string = new title; library backdrop: rows of hanging bells / instrument silhouettes instead of book spines | M |
| X-10 | `js/scene.js` 144 `EL.ink` (`fx: 'inkSplash', word: 'SHAA!'`), 188 `P_INK` particles (dark ink blobs) used at 1113 (ink hits), 1325 (summon), 1364 (death) | ink blobs on hits, summons and deaths | word 'WAAN!'; `P_INK` stays as a particle kind but its colour `#140f2e` becomes `#8e8aa3` for summons (hush gathering) and on DEATH add `P_STAR`/note-like motes in bright hue-ramp colours: "the creature releases the sounds it ate" (the strongest single Echo moment in combat); scene.js fallback `inkSplash` (531) and `brushDrag` (660) stand-ins mirror FX-01/02 cheaply | S |
| X-11 | `js/screen_end.js` 1011 share card `spaced(ctx, 'INKWOVEN', ...)`, 555 share text, 1259 download name 'inkwoven-' | title text on the share card | new title (naming lens) | S |
| X-12 | `tools/rogue_book/cover.mjs` (86 lines) | records `rogue_book/cover.webp` and `cover.webm` from the title then a fight; comments "the book open and glowing" | rerun AFTER the art lands to regenerate both binaries; update the comment. Needs `sharp` and `playwright-core` in node_modules | S |
| X-13 | `css/node.css` 202, 209 `--brush` mask underlines (event title and choices), `css/base.css` "brush-underlined keywords", torn panel edges, washi `--paper-bg` panels | brush and paper UI chrome | Tier 3: keep (washi panels and an inked underline are a look); optional `--wave` sine underline mask in place of `--brush` | S |

---------------------------------------------------------------------------------------------------------------------------------------------------

### 12. Literal text painted by art code (player-visible pixels)

| File (line) | Text | Change |
| --- | --- | --- |
| js/art_scenes.js LOGO_LETTERS (2711) | INKWOVEN (as stroke skeletons) | new title letters (section 3.2) |
| js/art.js 1626 | 'INKWOVEN' (placeholder logo) | new title |
| js/art_enemies_3.js 3346 | 'ERASE' on the Eraser's sleeve | 'SHH' (or a mute mon, no text) |
| js/art_enemies_3.js 2309 | 'DENIED' on the censor golem's stamp | 'SHH' (or no text) |
| js/art_map.js 518 | 'N' on the compass doodle | removed with the compass |
| js/art_fx.js 1546, 1576, 1596, 1607, 1610 and js/art.js 1742 | 'ZAN!', 'KIN!', 'SHAA!' gallery and demo onomatopoeia | 'SHAA!' -> 'WAAN!'; the others are fine |
| sheet labels (gallery only): art_enemies_1 2583, art_enemies_3 3795 boss3 `names` | 'phase 0: the Editor' etc. | new form names |

---------------------------------------------------------------------------------------------------------------------------------------------------

### 13. Documentation that describes the art (rewrite briefs; docs lens may own)

- `ART_BIBLE.md` 1 "Style in one line": replace "Ink-wash storybook ... A living book: paper grain" with "Ink-line anime in a world that lost its sound:
  cel-shaded shonen figures, screen tone and gold leaf against a grey, hushed land that blooms back into colour wherever sound returns". Rule 8 Texture:
  "washi grain" stays, "ink-bleed edges" -> "static grain on hushed things". Section 2 Kuro paragraph: flute staff, sound pearls, flute bag with a bronze flute charm (no suzu: small bells are Suzu's)
  bell, waveform hem, cyan note marks. Section 3 chapter 3 and the boss trio (9.2). Section 5 icons: stat ink -> Echo ping, brush -> Song, inkstone ->
  note token; tile stamps; songs. Section 6 title, victory, defeat, paper, map art (hushed versus awakened, wavefront reveal, lacquer frame). Section 7
  inkSplash and brushDrag looks. Section 8 UI: drop the "page-turn" wording.
- `DESIGN.md` 5.6: the comments on `ART.map.frame` ("the open book"), `paintBloom` ("ink spreading from the brush touch point"), `fx` list descriptions.
- `README.md` "Art and sound" paragraph (style line).

---------------------------------------------------------------------------------------------------------------------------------------------------

---

## Appendix E. Audio engine: the melodic reveal, the Hush, temple bells (code and tests)

PHASE NOTE: all of this appendix is plan phase P6. Its section numbers (7.1 to 8.4) are the audio lens's own, not plan sections. Its
sub-steps are named E1 (the core: 7.1 to 7.7, all required), E2 and E3 (the optional extras of 7.8); "P1", "P2", "P3" never mean plan
phases here. Revision 2 made these REQUIRED in E1: the `vox` voice (7.1.10), `CHORD_ROOTS` (7.1.3), the per-verse `single` voice, the
thinned walk notes (7.1.2), the calibrated wake curve, louder hush floor and first-wake lift (7.2.1, 7.2.4), and the rising note marks
(7.5). Where older text below disagrees with these, these win.

Source: the audio lens, adapted to decision D8 (every sfx id is kept; the seven map recipes are re-voiced under their existing keys, see the last section of this appendix). Line numbers are from a2bd24b; match on the quoted code. `audio.js` references only `U` and `DATA`; every new screen call is guarded with `isFn`; nothing may throw.

#### 7.1 The melodic reveal: every woken hex sings

##### 7.1.1 The land's hidden tune (pitch from position)

Every map hex owns one note, fixed for the life of the map, in the key and scale of that chapter's map track an octave up, so reveal notes
always agree with the music under them (map1 G yo, map2 A in-sen, map3 D miyako-bushi).

- Column (odd-r offset: `col = q + floor(r / 2)`, DESIGN 4.8) carries the tune: a seeded, mostly stepwise contour over the 21 columns,
  built with its own step table `W_STEP = [[-2, 0.1], [-1, 0.36], [0, 0.08], [1, 0.36], [2, 0.1]]` from `U.rng(U.hash('rb-echo', seed, chapter))`,
  pulled toward degree 2, clamped to degrees -2..6. Simulated over 6000 maps (2000 seeds x 3 chapters, with the real `U.rng`): the largest
  leap between neighbouring columns is 2 degrees, the mean share of steps of at most 1 degree is 0.80, every contour uses at least 3
  degrees, and neighbouring seeds differ in at least 10 of 21 columns. (`W_GENTLE` was tried first: its 3-degree leaps made 14 percent of
  maps jumpy.)
  The boss lies east, so the main road plays the contour like a melody.
- Row bends it: `lift = round(((rows - 1) / 2 - r) / 3)` (row 0 +2, middle 0, row 12 -2): up the page is up the scale.
- `deg = clamp(contour[col] + lift, -4, 9)`; `midi = tonic(map track) + 12 + 12 * floor(deg / 5) + scale[deg mod 5]`.
  Ranges: map1 57..88, map2 58..93, map3 51..84 (before folding into the voice range).
- Same map (same seed and chapter) = same tune: the Daily Jam (shared seed) sounds the same for everybody, a nice talking point.
- Pitch is DECORATIVE ONLY: it never tells the player what a hex holds (no "treasure rings higher"), so nothing is lost without sound.

##### 7.1.2 Order and rhythm (path order writes the phrase)

The notes sound in the order the screen already reveals cells, at the moment each bloom starts (`stepReveals`, `rv.started`), so audio and
picture are always in sync and reduced motion needs no special case:

- a single tap: 1 note (held: it is the cadence);
- a chain: the path's cells in order, 0.13 s apart (`REVEAL_GAP`), the last one held (a cadence);
- a Song: the cells sorted by distance from the anchor, 0.07 s apart (the existing `applyBrushNow` order), voiced by the Song (7.1.4);
- a walk hums the path back, thinned so the wake notes stay the bright event: on each arrived hex (STEP_S 0.23 s, or 0.14 s with reduced
  motion, divided by the animation speed) the screen counts the step `k` (1 based, reset when a walk starts) and plays a soft note only
  when `k <= 6 || (k - 6) % 2 === 0`, and only when that hex has not sounded (by any wake call) in the last 4 s of screen time (`s.heard`,
  a Map from hex key to `s.t`, pruned when it passes 64 entries). So a 10 step walk on fresh hexes hums 8 times. The soft voice is a
  breathy vox "mm" at vel 0.18 (`SONGS.step`), arp in lite mode, and nothing under `calm`.

No quantisation to the music grid (it would delay a note against its bloom by up to 0.2 s); consonance comes from sharing key and scale.

##### 7.1.3 Voices and articulation (table `SONGS`, keyed by `DATA.brushes` ids, which are save data and never change)

| key | Song (player name, pitch) | voice | dur s | vel | degrees | extras on the live path |
|---|---|---|---|---|---|---|
| `single` | one woken hex / a chain | per verse: koto (I), shamisen (II, the festival town), rin (III, glassy, shorter echo) | 0.3 (x2 on the last) | 0.5 (x1.15 last) | each cell its own `hexNote` | echo send 1, 1, 0.5 by verse |
| `step` | a walked hex (thinned, 7.1.2) | vox "mm" (breathy) | 0.14 | 0.18 | its own `hexNote` | no echo; skipped when `calm` |
| `stroke` | Drum Line | shamisen | 0.16 | 0.62 | each cell its own note (a line plays the contour) | a taiko per note (`don` on the first, `ka` after) AND a spoken kuchi shoga syllable from the vox per note: `don`, then `ka`, `tsu` alternating |
| `wave` | Ripple | koto | 0.22 | 0.5 | a rising run: `root + i` (root = anchor's degree) | a soft vox "oo" doubling each note (vel 0.22) |
| `fan` | Shout | shamisen | 0.34 | 0.6 | strummed triad `snapRoot(root) + [0, 2, 4]` | on the first cell a short vox "hey!" on the root (replaces the old breath burst) |
| `splash` | Beat Drop | koto | 0.3 | 0.52 | `snapRoot(root) + [-5, 0, 2, 4, 5, 7, 9]`: the centre drops an octave, the ring rises | on the first cell a beatbox kick and sub drop (vox `boom`), then 0.12 s later a big taiko `don` and a biwa an octave below |
| `halo` | Chorus | rin | 0.7 | 0.34 | `snapRoot(root) + [0, 2, 4, 5, 7, 9]`: six bells stack into one chord | each cell adds a vox "ah" (vel 0.2, 1.2 s, detune +-8 cents from the note's random), so 3 to 6 voices stack; on the first cell a soft pad (1.6 s) on the root |
| `blot` | Hum | vox "mm" (closed mouth) | 1.0 | 0.56 | its own `hexNote` (one long hummed note) | |

Consonance (revision 2, verified by script over every root): stacking every other degree is consonant from every root only in yo. In
in-sen and miyako-bushi the stacks on pentatonic indices 1 and 4 hold a tritone or a semitone (for example F B D, D F B in E in-sen). So
every Song with `deg: 'chord'` first snaps its root with `snapRoot` to the nearest index of `CHORD_ROOTS` (yo `[0, 1, 2, 3, 4]`, in-sen
`[0, 2, 3]`, miyako-bushi `[0, 2, 3]`; ties go down). With that snap, the fan, splash and halo stacks, including halo's `+5` (which is
the root an octave up, not a semitone neighbour), hold no interval of 1, 6 or 11 semitones in any verse (test A12). Runs (`wave`) and
per-hex notes are melodic and never snap. Lite mode (7.6) plays every note on `arp` and skips every extra, including every vox layer.

##### 7.1.4 Rate limiting and polyphony

- Token bucket: `NOTE_CAP = { rate: 14, burst: 8, ring: 12 }` (lite `{ rate: 8, burst: 5, ring: 6 }`). A note needs one token and fewer than
  `ring` notes still ringing; otherwise it is dropped (returns false). Exception: `o.last` (the cadence of a phrase) always plays.
  Worst cases fit: a chain of 14 at 0.13 s is 7.7 notes/s; the biggest Song (Beat Drop, 7 cells at 0.07 s) is 7 notes in 0.42 s.
- Ringing bookkeeping: `S.notes` holds the end time of each note (`t + max(0.4, dur * 2.2)`), pruned on every call.
- Density compensation: `vel /= sqrt(1 + 0.15 * ringing)` so a chord does not build up loudness.
- Global cap: dropped when `live.n > MAX_LIVE * 0.8` (176 sources), the same threshold as a priority 1 sfx.

##### 7.1.5 Volume, mute, suspend, reduced motion

- Wake notes run on the sfx bus: the Effects slider governs them. `S.vol.sfx <= 0.001` returns false BEFORE any node is built (true mute,
  zero cost). Suspended (explicit, tab hidden, portrait panel) and before init: false, like `sfx`.
- `options({ calm: true })` (reduced motion): no echo send, no hummed steps. Notes still follow the blooms one to one.
- `options({ lite: true })` (quality low): arp voice only, no extras, no echo, smaller caps.

##### 7.1.6 The echo

One shared feedback delay, built once in `buildGraph`, optional like the hall:
`echoIn -> DelayNode (max 1.5 s) -> lowpass 2200 Hz -> feedback gain 0.32 -> back into the delay`, and `lowpass -> return gain 0.55 -> sfxBus`.
Wake notes send `0.3 * SONGS[x].echo` into `echoIn`. Delay time = half a beat of the map track, set when a map deck starts
(`clamp(0.5 * 60 / tempo, 0.2, 0.6)`: map1 0.417 s, map2 0.455 s, map3 0.429 s), default 0.42 s.
A missing or throwing `createDelay` leaves `echoIn = null` and wake notes play dry.

##### 7.1.7 Code for `audio.js` (E1)

Constants, after `const TAPER = 1.5;` (line 71):

```js
  // Echo (the melodic reveal and the Hush): see the ECHO section below and DESIGN 5.7
  const WAKE_FROM = 0.06, WAKE_SPAN = 0.44;                // PLACEHOLDER: WAKE_SPAN comes from the 7.2.4 calibration (the measured median awake share at the keeper, minus WAKE_FROM)
  const HUSH_HI = 16000;                                    // a fully awake map deck's low-pass (transparent)
  const DEG_LO = -4, DEG_HI = 9;                            // wake notes, in scale degrees above the chapter tonic + 12
  const NOTE_CAP = { rate: 14, burst: 8, ring: 12 };        // wake notes: per second, bucket size, notes still ringing
  const NOTE_CAP_LITE = { rate: 8, burst: 5, ring: 6 };
  const WAKE_GAIN = 0.8;                                    // bus gain of one wake note (unmeasured: tune by ear between card_hover and card_pick)
  const ECHO = { send: 0.3, feedback: 0.32, lp: 2200, ret: 0.55, beats: 0.5 };
```

After `const TH_FINAL = [0, 0.05, 0.2, 0.4];` (line 551):

```js
  // the map tracks wake with the land: layer k is fully in at wakeLevel th[k] + 0.1 (AUDIO.awake, not AUDIO.intensity)
  const TH_WAKE = [0, 0.15, 0.4, 0.65];
```

In `compose` (the `const desc = {` literal, line 871), add two fields:

```js
      drive: T.drive || (layers > 1 ? 'intensity' : null), hush: T.hush ? { lo: T.hush.lo, floor: T.hush.floor } : null,
```

The pure ECHO section, placed right after `compose` (before the `SOUND EFFECT RECIPES` banner at line 882):

```js
  // ==================================================================================================================
  // ECHO: every hex of a map owns one note of the land's hidden song, so a chain, a Song or a walk plays a phrase.
  // Pure and deterministic (seeded by the map seed and chapter), in the key and scale of that chapter's map track an octave up.
  // ==================================================================================================================
  // How each Song sounds. Keys are DATA.brushes ids (save data: never renamed) plus 'single' (one hex or a chain) and 'step' (a walk).
  // deg: 'hex' every cell its own note, 'run' a rising run from the anchor's note, 'chord' offsets (scale degrees) above the anchor's note.
  const SONGS = {
    single: { v: 'koto', byVerse: ['koto', 'shamisen', 'rin'], echoByVerse: [1, 1, 0.5], dur: 0.3, vel: 0.5, deg: 'hex', echo: 1 },
    step: { v: 'vox', vowel: 'm', dur: 0.14, vel: 0.18, deg: 'hex', echo: 0 },
    stroke: { v: 'shamisen', dur: 0.16, vel: 0.62, deg: 'hex', perc: true, syl: ['don', 'ka', 'tsu'], echo: 1 },
    wave: { v: 'koto', dur: 0.22, vel: 0.5, deg: 'run', dbl: 'u', echo: 1 },
    fan: { v: 'shamisen', dur: 0.34, vel: 0.6, deg: 'chord', offs: [0, 2, 4], shout: true, echo: 1 },
    splash: { v: 'koto', dur: 0.3, vel: 0.52, deg: 'chord', offs: [-5, 0, 2, 4, 5, 7, 9], drop: true, echo: 1 },
    halo: { v: 'rin', dur: 0.7, vel: 0.34, deg: 'chord', offs: [0, 2, 4, 5, 7, 9], choir: true, pad: true, echo: 0.6 },
    blot: { v: 'vox', vowel: 'm', dur: 1.0, vel: 0.56, deg: 'hex', echo: 1 },
  };
  // pentatonic indices whose stacked chords hold no 1, 6 or 11 semitone interval, keyed by the scale's intervals (checked by test A12)
  const CHORD_ROOTS = { '0,2,5,7,9': [0, 1, 2, 3, 4], '0,1,5,7,10': [0, 2, 3], '0,1,5,7,8': [0, 2, 3] };
  function snapRoot(root, sc) {
    const n = sc.length, ok = CHORD_ROOTS[sc.join(',')] || [0, 1, 2, 3, 4], i = mod(root, n);
    if (ok.indexOf(i) >= 0) return root;
    for (let d = 1; d < n; d++) {
      if (ok.indexOf(mod(i - d, n)) >= 0) return root - d;
      if (ok.indexOf(mod(i + d, n)) >= 0) return root + d;
    }
    return root;
  }
  const W_STEP = [[-2, 0.1], [-1, 0.36], [0, 0.08], [1, 0.36], [2, 0.1]];      // the hidden tune moves by step, now and then by a skip, never further
  const CONTOURS = new Map();
  function contour(seed, chapter, cols) {
    const key = seed + '|' + chapter + '|' + cols;
    let c = CONTOURS.get(key);
    if (c) return c;
    const rng = U.rng(U.hash('rb-echo', seed, chapter));
    c = [];
    let d = 2;
    for (let i = 0; i < cols; i++) {
      if (i > 0) {
        const pull = clamp((2 - d) * 0.15, -0.6, 0.6);
        d = clamp(d + rng.weighted(W_STEP.map((e) => [e[0], Math.max(0.02, e[1] * Math.exp(pull * Math.sign(e[0]) * 1.5))])), -2, 6);
      }
      c.push(d);
    }
    if (CONTOURS.size > 24) CONTOURS.clear();
    CONTOURS.set(key, c);
    return c;
  }
  function echoKey(chapter) {
    const d = compose('map' + clamp((chapter | 0) || 1, 1, 3));
    return { tonic: d.tonic + 12, sc: d.scaleIntervals };
  }
  const degToMidi = (k, d) => k.tonic + 12 * Math.floor(d / k.sc.length) + k.sc[mod(d, k.sc.length)];
  // info = {chapter, seed, cols, rows}: the map's own fields (M.chapter, M.seed, M.cols, M.rows)
  function hexNote(q, r, info) {
    const o = info || {}, rows = o.rows > 0 ? o.rows : 13, cols = o.cols > 0 ? o.cols : 21, ch = clamp((o.chapter | 0) || 1, 1, 3);
    const col = clamp(Math.round(q) + Math.floor(Math.round(r) / 2), 0, cols - 1);
    const lift = Math.round(((rows - 1) / 2 - r) / 3);
    const deg = clamp(contour((o.seed >>> 0) || 0, ch, cols)[col] + lift, DEG_LO, DEG_HI);
    return { deg, midi: degToMidi(echoKey(ch), deg) };
  }
  // the degrees a Song's cells sing in reveal order (nearest the anchor first); null when every cell sings its own hexNote
  // chapter (optional): chord Songs snap their root to a consonant degree of that verse's scale (without it, no snap: test A4)
  function songDegrees(song, n, root, chapter) {
    const st = Object.prototype.hasOwnProperty.call(SONGS, song) ? SONGS[song] : null;
    if (!st || st.deg === 'hex') return null;
    const r0 = st.deg === 'chord' && chapter ? snapRoot(root, echoKey(chapter).sc) : root;
    const out = [];
    for (let i = 0; i < n; i++) out.push(clamp(st.deg === 'run' ? r0 + i : r0 + st.offs[Math.min(i, st.offs.length - 1)], DEG_LO - 5, DEG_HI + 5));
    return out;
  }
  // the degree AUDIO.wake will sing for this cell (the screens draw the same contour with it)
  function wakeDegree(q, r, o) {
    o = o || {};
    const own = hexNote(q, r, o).deg;
    if (!isNum(+o.aq) || !isNum(+o.ar)) return own;
    const i = Math.max(0, o.i | 0), list = songDegrees(o.song, i + 1, hexNote(+o.aq, +o.ar, o).deg, clamp((o.chapter | 0) || 1, 1, 3));
    return list ? list[i] : own;
  }
```

Engine state: add to the `const S = {` literal (line 1428):

```js
    awake: 1, opt: { calm: false, lite: false }, notes: [], tokens: NOTE_CAP.burst, tokT: 0, liftKey: null,
```

Engine functions, right after `function intensity(n) { ... }` (line 1613 to 1619):

```js
  // ---- Echo, live. The Hush: how awake the land is (the painted share of the map) drives the map tracks.
  const wakeLevel = (frac) => clamp((frac - WAKE_FROM) / WAKE_SPAN, 0, 1);
  function awake(frac) {
    if (frac === undefined) return S.awake;
    const x = isNum(+frac) ? clamp(+frac, 0, 1) : 1;
    S.awake = x;
    if (S.ready) for (const d of S.decks) if (!d.dying && d.desc.drive === 'awake') applyLayers(d, false);
    return x;
  }
  function options(o) {
    if (o && typeof o === 'object') {
      if (Object.prototype.hasOwnProperty.call(o, 'calm')) S.opt.calm = !!o.calm;
      if (Object.prototype.hasOwnProperty.call(o, 'lite')) S.opt.lite = !!o.lite;
    }
    return Object.assign({}, S.opt);
  }
  // one woken hex sings. o = {chapter, seed, cols, rows, song?, i?, n?, aq?, ar?, last?, soft?, pan?}. false when dropped.
  function wake(q, r, o) {
    o = o || {};
    if (!S.ready || S.susp.user || S.susp.hidden || S.vol.sfx <= 0.001 || !isNum(+q) || !isNum(+r)) return false;
    if (o.soft && S.opt.calm) return false;
    firstLift(o);                                              // the first woken hex of a verse opens the hushed map deck for 2 s (music side)
    const ctx = S.ctx, now = ctx.currentTime, lite = S.opt.lite, cap = lite ? NOTE_CAP_LITE : NOTE_CAP;
    kick();
    if (live.n > MAX_LIVE * 0.8) return false;
    S.notes = S.notes.filter((e) => e > now);
    S.tokens = Math.min(cap.burst, S.tokens + Math.max(0, now - S.tokT) * cap.rate);
    S.tokT = now;
    if (!o.last && (S.tokens < 1 || S.notes.length >= cap.ring)) return false;
    S.tokens = Math.max(0, S.tokens - 1);
    const st = Object.prototype.hasOwnProperty.call(SONGS, o.song) ? SONGS[o.song] : (o.soft ? SONGS.step : SONGS.single);
    const ch = clamp((o.chapter | 0) || 1, 1, 3), k = echoKey(ch), deg = wakeDegree(+q, +r, o);
    const v = lite ? 'arp' : (st.byVerse ? st.byVerse[ch - 1] : st.v), rg = RANGES[v];
    const echoAmt = st.echoByVerse ? st.echoByVerse[ch - 1] : st.echo;
    const midi = foldInto(degToMidi(k, deg), rg[0], rg[1]);
    const cad = o.last && st.deg !== 'chord';
    const dur = st.dur * (cad ? 2 : 1);
    const vel = clamp(st.vel * (o.last ? 1.15 : 1) / Math.sqrt(1 + 0.15 * S.notes.length), 0.05, 1);
    const t = now + 0.004, rr = S.rng();
    const bus = gainOf(ctx, WAKE_GAIN);
    let head = bus;
    if (isNum(o.pan) && o.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(o.pan, -1, 1); bus.connect(p); head = p; }
    head.connect(S.g.sfxBus);
    if (echoAmt && S.g.echoIn && !S.opt.calm && !lite) { const send = gainOf(ctx, ECHO.send * echoAmt); head.connect(send); send.connect(S.g.echoIn); }
    VOICES[v](ctx, bus, t, { midi, dur, vel, r: rr, vowel: st.vowel });
    if (!lite) wakeExtras(ctx, bus, t, st, Math.max(0, o.i | 0), k, deg, rr);
    S.notes.push(t + Math.max(0.4, dur * 2.2));
    return true;
  }
  function wakeExtras(ctx, bus, t, st, i, k, deg, rr) {
    const low = foldInto(k.tonic - 24, 33, 57), sung = foldInto(degToMidi(k, deg), RANGES.vox[0], RANGES.vox[1]);
    if (st.perc) VOICES.taiko(ctx, bus, t, { midi: low, dur: 0.1, vel: i === 0 ? 0.75 : 0.5, hit: i === 0 ? 'don' : 'ka', r: rr });
    if (st.syl) VOICES.vox(ctx, bus, t, { midi: foldInto(low + 12, RANGES.vox[0], RANGES.vox[1]), dur: 0.12, vel: 0.5, syl: st.syl[i === 0 ? 0 : 1 + ((i - 1) % 2)], r: rr });
    if (st.dbl) VOICES.vox(ctx, bus, t, { midi: sung, dur: st.dur, vel: 0.22, vowel: st.dbl, r: rr });
    if (st.shout && i === 0) VOICES.vox(ctx, bus, t, { midi: sung, dur: 0.22, vel: 0.7, syl: 'hey', r: rr });
    if (st.choir) VOICES.vox(ctx, bus, t, { midi: sung, dur: 1.2, vel: 0.2, vowel: 'a', detune: (rr - 0.5) * 16, r: rr });
    if (st.drop && i === 0) {
      VOICES.vox(ctx, bus, t, { midi: 36, dur: 0.3, vel: 0.9, syl: 'boom', r: rr });
      VOICES.taiko(ctx, bus, t + 0.12, { midi: foldInto(low, 33, 45), dur: 0.25, vel: 0.9, hit: 'don', big: 1, r: rr });
      VOICES.biwa(ctx, bus, t + 0.12, { midi: foldInto(degToMidi(k, deg) - 12, 31, 64), dur: 0.8, vel: 0.7, r: rr });
    }
    if (st.pad && i === 0) VOICES.pad(ctx, bus, t, { midi: foldInto(degToMidi(k, deg), 45, 72), dur: 1.6, vel: 0.32, r: rr });
  }
  // the first woken hex of each map (chapter and seed) opens every hushed map deck to 1.5 times its cut-off for 2 s, then back
  function firstLift(o) {
    const key = ((o.chapter | 0) || 1) + '|' + ((o.seed >>> 0) || 0);
    if (S.liftKey === key) return;
    S.liftKey = key;
    const now = S.ctx.currentTime;
    for (const d of S.decks) {
      if (d.dying || !d.lp) continue;
      const hi = Math.min(HUSH_HI, S.ctx.sampleRate * 0.45), f = d.lp.frequency.value;
      d.lp.frequency.setTargetAtTime(Math.min(hi, f * 1.5), now, 0.15);
      d.lp.frequency.setTargetAtTime(f, now + 2, 0.8);
    }
  }
```

(`kick`, `live`, `foldInto`, `gainOf`, `layerNoise`, `finishLayer`, `N`, `RANGES`, `VOICES` all exist in the same IIFE; they are reached at call
time, so declaration order does not matter.)

Return object (line 1715): add `wake, awake, options, hexNote, songDegrees, wakeDegree,`, `SONGS: JSON.parse(JSON.stringify(SONGS)),`,
`CHORD_ROOTS: JSON.parse(JSON.stringify(CHORD_ROOTS)),` and `HUSH: { from: WAKE_FROM, span: WAKE_SPAN, th: TH_WAKE.slice() },`.

`debug()` (line 1705): add `awake: S.awake, wake: wakeLevel(S.awake), opt: Object.assign({}, S.opt), notes: S.notes.length, liftKey: S.liftKey,` and in the
`decks` map add `drive: d.desc.drive, lp: d.lp || null, hg: d.hg || null,`.

##### 7.1.10 The `vox` voice (required, E1): voice and rhythm

The owners are a beatbox and singing duo; the Songs must sound sung and spoken, not only played. Add one voice `vox` next to the others
(`function vVox(ctx, out, t, n)` after `vPad`, and an entry in `VOICES`, `RANGES` `vox: [45, 84]`, `TRIM` `vox: 0.8` (an estimate, the
score never uses it), `HUMAN` `vox: 0.015`, `VOICE_TAIL` `vox: 0.3`, `SUSTAINED` `vox: true`). It is a wake-note and sfx voice only: NO
score role uses it, so `MIX` stays valid (test A14).

```js
  // vox: a small sung or spoken voice. A sawtooth (plus a quiet square an octave down for body) through two or three formant
  // band-passes, a gentle vibrato, and breath noise. n.vowel 'a' | 'o' | 'u' | 'e' | 'm' (closed-mouth hum: a low-passed 'u' with the
  // upper formants removed). n.syl, for spoken rhythm, overrides the vowel: 'don' | 'ka' | 'tsu' (kuchi shoga, the spoken taiko
  // syllables), 'hey' (a shout), 'boom' (a beatbox kick: a sine falling 150 -> 45 Hz over 0.25 s with a 4 ms click). n.detune in cents.
  const FORMANTS = { a: [800, 1150, 2900], o: [450, 800, 2830], u: [325, 700, 2530], e: [400, 1700, 2600], m: [250, 0, 0] };
```

Behaviour (write it in the style of `vShakuhachi` and `vPad`; every gain envelope via `holdEnv` or `decayEnv`, so it starts at 0 and
passes the suite's click test):

- vowels: source `sawtooth` at `mtof(n.midi)` (+ `n.detune` cents), vibrato 5.5 Hz depth rising from 0 to 0.6 percent over 0.3 s,
  through parallel band-passes at the vowel's formants (Q 6, 8, 10; gains 1, 0.5, 0.25; a zero formant is skipped), plus pink breath noise
  band-passed at 1800 Hz at 0.08 of the level; `m` is the same source through a low-pass at 400 Hz and one band-pass at 250 Hz, no
  breath. Attack 0.04 s (0.08 for `m`), release 0.12 s.
- `don`: the `o` vowel for 0.14 s with its pitch falling from 1.5x to 1x over 0.05 s, plus a 6 ms noise click.
- `ka`: a 15 ms white noise burst band-passed at 1800 Hz, then the `a` vowel for 0.05 s.
- `tsu`: white noise high-passed at 5000 Hz for 0.08 s (a hiss), no pitch.
- `hey`: 0.03 s of breath noise high-passed at 2000 Hz ("h"), then the `e` vowel for `max(0.15, dur)` with the pitch gliding from
  1.06x down to 1x.
- `boom`: a sine falling exponentially from 150 Hz to 45 Hz over 0.25 s, gain decaying over 0.35 s, plus a 4 ms white click.
- Unknown `vowel` or `syl` values fall back to `a`. Never throws, returns like the other voices.

##### 7.1.8 The echo bus in `buildGraph` (after the hall block that ends `} catch (e) { g.verb = null; }`, line 1413)

```js
    // the echo of a wake note: half a beat of the map track, darker on every repeat, returned into the sfx bus (optional, like the hall)
    g.echoIn = null; g.echoDelay = null;
    try {
      const dl = ctx.createDelay(1.5), fb = gainOf(ctx, ECHO.feedback), lp = filt(ctx, 'lowpass', ECHO.lp, 0.7), ret = gainOf(ctx, ECHO.ret);
      dl.delayTime.value = 0.42;
      g.echoIn = gainOf(ctx, 1);
      g.echoIn.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(ret); ret.connect(g.sfxBus);
      g.echoDelay = dl;
    } catch (e) { g.echoIn = null; g.echoDelay = null; }
```

(The feedback cycle contains a DelayNode, which WebAudio requires; the loader stub accepts it; the suite's `reaches()` BFS handles cycles.)

##### 7.1.9 `screen_map.js` wiring (E1)

1. Helper, right after `const snd = (id) => { ... };` (line 87):

```js
  // Echo: one woken hex sings its note (AUDIO.wake), panned with its place on the stage
  const echoInfo = (s) => ({ chapter: s.M.chapter, seed: s.M.seed, cols: s.M.cols, rows: s.M.rows });
  function wakeNote(s, q, r, o) {
    safe(() => {
      if (typeof AUDIO === 'undefined' || !AUDIO || !isFn(AUDIO.wake)) return;
      const p = screenOf(s, q, r);
      AUDIO.wake(q, r, Object.assign(echoInfo(s), { pan: clamp((p.x - 640) / 900, -0.5, 0.5) }, o || {}));
    });
  }
```

2. `startReveals(s, tiles, from, gap)` (line 1297) gets two optional parameters `song, anchor` and stores them on every record:

```js
  function startReveals(s, tiles, from, gap, song, anchor) {
    ...
      s.reveals.set(keyOf(T.q, T.r), { t0: s.t + 0.04 + i * g, fx: f.x, fy: f.y, started: false, T, i, n: tiles.length, song: song || null, aq: anchor ? anchor.q : null, ar: anchor ? anchor.r : null });
```

3. `stepReveals` (line 1317): replace `snd('paint');` with
   `wakeNote(s, rv.T.q, rv.T.r, { song: rv.song, i: rv.i, n: rv.n, aq: rv.aq, ar: rv.ar, last: rv.i === rv.n - 1 });`
   (the `'ink_splash'` id at line 1327 STAYS: sfx ids are kept, only the recipe is re-voiced).
4. `paintAction` (line 1362): `snd('paint');` STAYS (the `paint` recipe is re-voiced as the sung "hah", see E.4).
5. `applyBrushNow` (lines 1553 to 1555): `snd('brush_use'); snd('paint'); startReveals(s, tiles, origin, 0.07);` ->
   `snd('brush_use'); startReveals(s, tiles, origin, 0.07, id, a);` (the second `paint` is dropped: the Song's own notes follow; `id` is the Song id and `a` the anchor hex already in scope there, check the local names when editing)
6. `arrive` (line 1628): keep `snd('step');`; right after the guard line `if (s.M.pos.q !== q || s.M.pos.r !== r) { endWalk(s); return; }`
   add the thinned soft note of 7.1.2: `s.walkK = (s.walkK | 0) + 1; if (s.walkK <= 6 || (s.walkK - 6) % 2 === 0) { if (!heardRecently(s, q, r)) wakeNote(s, q, r, { soft: true }); }`
   with `s.walkK = 0` wherever a walk starts (the function that sets up the walk path; grep `endWalk` for its partner), and
   `heardRecently(s, q, r)` true when `s.heard` has the key with `s.t - t < 4`. `wakeNote` itself records `s.heard.set(keyOf(q, r), s.t)`
   for every call (soft or not), and creates the note mark of 7.5.
7. `paintProgress` (line 1083): after `H.prog.setAttribute('aria-valuetext', ...)` add
   `safe(() => { if (typeof AUDIO !== 'undefined' && AUDIO && isFn(AUDIO.awake)) AUDIO.awake(p.frac); });`
   (`MAP.progress` returns `frac`; `buildHud` calls `paintProgress` at enter, `syncHud` whenever `p.painted` changes.)
8. Header comment line 69: add "AUDIO.wake (one note per woken hex), AUDIO.awake (the Hush)". No sfx id is renamed (plan decision D8).

Headless note: `startReveals` returns early under `window.__HEADLESS`, so per-cell wake notes only happen in realtime suites; walks run
synchronously headless, so the soft step notes are testable headless.

#### 7.2 The Hush ambience (the map music sleeps until the land wakes)

##### 7.2.1 Behaviour

- `AUDIO.awake(frac)` takes the painted share of the map (`MAP.progress(M).frac`, 0..1). Default 1 (nothing hushed until a map says so).
- `wakeLevel(frac) = clamp((frac - WAKE_FROM) / WAKE_SPAN, 0, 1)`. REVISION 2: the old fixed span (fully awake at 50 percent) was never
  checked against real play; a player who reaches the keeper with 20 to 30 percent woken would hear a muffled bed with no melody for the
  whole run. So `WAKE_SPAN` and `TH_WAKE` are CALIBRATED in 7.2.4: full music at the median awake share at the keeper, the melody by
  about 0.6 of it. Exploring is still rewarded (a fresh verse is hushed), but a typical player hears the whole track.
- Layers (map tracks gain `drive: 'awake'`, `thresholds: TH_WAKE`): layer 0 always (a still bed), then layers 1, 2 and 3 (the melody)
  each fade in over 0.2 of wake level around their threshold. `TH_WAKE` comes from 7.2.4.
- Low-pass per deck: `f = lo * (HUSH_HI / lo) ^ wake` (HUSH_HI capped at `0.45 * sampleRate`), gain `floor + (1 - floor) * wake`, both glide
  with `setTargetAtTime(..., 0.8)` so the land audibly opens over about 2 s while the bloom plays. Layers glide with tc 0.6 for awake decks.
- The low-pass lives on the map DECK, not on the music bus, so a fight (or any other track) is never muffled and a crossfade from a hushed
  map to a fight goes from muffled to clear by itself.
- Per chapter (`hush` field, revision 2: higher, so it reads as a mood and never as broken audio): ch1 `{ lo: 900, floor: 0.85 }` (a
  grey field), ch2 `{ lo: 750, floor: 0.8 }` (night water), ch3 `{ lo: 600, floor: 0.75 }` (the Hush's own country, deepest and quietest,
  its layer 0 is the taiko heartbeat).
- First-wake lift: the first wake call of each map (`firstLift`, 7.1.7) opens every hushed deck to 1.5 times its current cut-off for
  2 s, so the land audibly answers the first note.

##### 7.2.2 Layer assignment (only `layer:` fields are added; roles, order and gains are unchanged, so `MIX` stays valid)

| Track | layer 0 (hushed) | layer 1 | layer 2 | layer 3 |
|---|---|---|---|---|
| map1 (roles in order: melody, arp, pad, bass, clack, bell) | pad (24 notes), bell (3) | bass (32), clack (8) | arp (102) | melody (67) |
| map2 (arp, melody, pad, bell, bass) | pad (16), bell (8) | bass (8) | arp (118) | melody (28) |
| map3 (drone, pad, melody, bass, perc, bell) | drone (8), perc heartbeat (16) | bass (16), bell (3) | pad (14) | melody (36) |

Every layer has a track with more than 4 notes (the suite's layered check). Hushed, map1 schedules 27 of 236 notes per loop, map2 24 of 178,
map3 24 of 93.

Edits in `TRACKS` (audio.js 591 to 622), map1 shown, map2 and map3 alike:

```js
    map1: {
      key: 55, scale: 'yo', tempo: 72, bpb: 4, mood: 'calm, golden dusk, pastoral', xfade: 2.5, drive: 'awake', thresholds: TH_WAKE, hush: { lo: 900, floor: 0.85 },
      sections: [{ id: 'loop', bars: 16, loop: true, prog: [...unchanged...], roles: [
        { role: 'melody', ...unchanged..., layer: 3 },
        { role: 'arp', ...unchanged..., layer: 2 },
        { role: 'pad', ...unchanged..., layer: 0 },
        { role: 'bass', ...unchanged..., layer: 1 },
        { role: 'clack', ...unchanged..., layer: 1 },
        { role: 'bell', ...unchanged..., layer: 0 },
      ] }],
    },
```

map2: `hush: { lo: 750, floor: 0.8 }`, layers arp 2, melody 3, pad 0, bell 0, bass 1.
map3: `hush: { lo: 600, floor: 0.75 }`, layers drone 0, pad 2, melody 3, bass 1, perc 0, bell 1.

##### 7.2.3 Engine edits

`buildDeck` (line 1462): after `deck.out.connect(dest);` create the deck low-pass for awake decks and connect the layer gains into it:

```js
    let into = deck.out;
    if (desc.drive === 'awake' && desc.hush) {
      deck.lp = filt(ctx, 'lowpass', Math.min(HUSH_HI, ctx.sampleRate * 0.45), 0.5);
      deck.hg = gainOf(ctx, 1);
      deck.lp.connect(deck.hg); deck.hg.connect(deck.out); into = deck.lp;
    }
```
and in the layer loop `lg.connect(into);` instead of `lg.connect(deck.out);`.

`applyLayers` (line 1481) becomes drive-aware and applies the hush:

```js
  const driveOf = (desc) => (desc.drive === 'awake' ? wakeLevel(S.awake) : S.intensity);
  function applyLayers(deck, instant) {
    const now = S.ctx.currentTime, x = driveOf(deck.desc), tc = deck.desc.drive === 'awake' ? 0.6 : 0.3;
    for (let k = 1; k < deck.desc.layers; k++) {
      const v = layerTarget(deck.desc, k, x);
      deck.target[k] = v;
      if (instant) deck.layerG[k].gain.value = v; else deck.layerG[k].gain.setTargetAtTime(v, now, tc);
    }
    applyHush(deck, instant, deck.desc.drive === 'awake' ? x : 1);
  }
  function applyHush(deck, instant, w) {
    if (!deck.lp) return;
    const h = deck.desc.hush, ctx = deck.lp.context, hi = Math.min(HUSH_HI, ctx.sampleRate * 0.45);
    const f = h.lo * Math.pow(hi / h.lo, w), gv = h.floor + (1 - h.floor) * w;
    if (instant) { deck.lp.frequency.value = f; deck.hg.gain.value = gv; }
    else { const now = ctx.currentTime; deck.lp.frequency.setTargetAtTime(f, now, 0.8); deck.hg.gain.setTargetAtTime(gv, now, 0.8); }
  }
```

`intensity(n)` (1613): only intensity-driven decks follow it: `for (const d of S.decks) if (!d.dying && d.desc.drive === 'intensity') applyLayers(d, false);`

`startMusic` (1532): `if (desc.layers <= 1) S.intensity = 0;` -> `if (desc.drive !== 'intensity') S.intensity = 0;` (a map track no longer keeps
a fight's intensity; the existing test "leaving a layered track for a plain one resets it" keeps passing with `map1`), and after the deck is
built: `if (desc.drive === 'awake' && S.g.echoDelay) S.g.echoDelay.delayTime.setTargetAtTime(clamp(ECHO.beats * 60 / desc.tempo, 0.2, 0.6), now, 0.05);`

`render` (1670): the drive value defaults to fully awake for map tracks: `const x = o.intensity == null ? (desc.drive === 'awake' ? 1 : 0) : o.intensity;`
and after the layer loop `applyHush(deck, true, desc.drive === 'awake' ? x : 1);` (document: for awake tracks `o.intensity` is the wake level).

##### 7.2.4 Calibration of the wake curve (E1, do it first)

1. Tooling (6A owns it): add an opt-in flag `--awake-report` to `tools/rogue_book/bot.mjs` (its option parser) and pass it to
   `tools/rogue_book/bot/driver.mjs`. In the driver, at the moment it enters a boss node (grep the driver for where it starts a fight on
   the `'boss'` tile or node), when the flag is on, push `MAP.progress(R.map).frac` (with `R.chapter`) into a module-level list; at the
   end `bot.mjs` prints one line per chapter and overall: `awake at keeper: ch1 median 0.xx (n), ch2 ..., ch3 ..., all 0.xx`. When the
   flag is off nothing is recorded or printed, and `--runs-out` records never contain it (the determinism gate proves it). If `--jobs`
   runs separate workers, run the report with `--jobs 1`.
2. Measure: `node tools/rogue_book/bot.mjs --all-pairs --runs 8 --trial 0,5 --seed 11 --combat greedy --effort fast --jobs 1 --quiet --brief --awake-report`.
   Let `m` be the overall median.
3. Set the numbers (round to 2 decimals):
   - `WAKE_SPAN = clamp(m - WAKE_FROM, 0.12, 0.44)` (full music at the median keeper visit);
   - `w60 = clamp((0.6 * m - WAKE_FROM) / WAKE_SPAN, 0, 1)`, `T3 = clamp(w60 - 0.1, 0.15, 0.65)` (the melody is fully in by 0.6 m);
   - `TH_WAKE = [0, round2(0.23 * T3), round2(0.62 * T3), T3]` (the old ratios 0.15 : 0.4 : 0.65).
   Example: m = 0.29 gives `WAKE_SPAN 0.23`, `TH_WAKE [0, 0.09, 0.25, 0.4]`.
4. Pin them in test A13 with a comment that names `m`, the command and the date, and write them in the PR body.

#### 7.3 Temple bells (wells)

The `well` recipe (id kept) is re-voiced as a temple bell: a wooden beam strikes a big bell: low hum tone with a beating twin (the slow wobble of a bonsho), inharmonic FM
strike partials, a shimmer, and the Echo welling up into the meter. It ducks the music for 600 ms. New recipe option `tune: 55` (written in
G): at play time `sfx` transposes it into the key of the current deck by the nearest interval (map1 G: 0, map2 A: +2 semitones, map3 D: -5),
so the bell rings in the key of the land. Recipe in the section "Re-voiced sfx recipes (ids kept)" at the end of this appendix.

`rawRecipe` (line 1008): add `tune: o.tune || 0,` to the cached object.

#### 7.5 Accessibility: every sound has a visual twin

| Sound | Visual twin | State |
|---|---|---|
| `paint` and the per-cell wake notes | ink drip out of the meter, bloom (`ART.map` paintBloom / `inkSplash` fx), pop ring, announce "Painted N hexes ..." | exists (art lens re-skins); the REQUIRED rising note marks below make the melody visible |
| `ink_splash`, `reveal_landmark` | sparkle, pop with the tile icon, announce "Revealed: X." | exists |
| `brush_use` and the Song phrase | chips `used` class, cascade of blooms, announce "The X paints N hexes." | exists |
| `brush_pick` | toast "You take a brush: X", flying brush to its chip, float text | exists (copy lens re-words) |
| `ink_gain` | float text `+N Ink`, drops fly into the meter, meter count, mercy toast and announce | exists |
| `well` | ring fx `#5fb4ff` (kept under reduced motion: `addFx` allows `ring`), sparkle, pop, toast, announce "The well gives N Ink." | exists |
| soft step notes, `step` | the token walking | exists |
| the Hush (low-pass, layers) | the progress meter `N% painted` -> `N% awake` with `aria-valuetext`, pulsing on change; the art lens's grey fog | exists; copy lens renames the text |
| `page_turn` (now two hyoshigi claps), `hush` (chapter intro) | intro flourish + announce "Verse N, title. N Echo. N percent awake."; on the event screen the kamishibai doors open | exists |
| `ui_error` | toast + shake | exists |
| `boss_intro` (map) | red ring fx, pop, announce "The chapter boss." | exists |

Rules for the plan: (1) no gameplay information may live only in sound (pitch, echo and hush are decorative); (2) every new sound call goes
next to an existing visual or announce, never alone; (3) nothing flashes with the beat.

Rising note marks (REQUIRED, E1, owned by 6B in `js/screen_map.js`): the melody made visible, also for deaf players and with sound off.
In `wakeNote` (7.1.9) compute `const deg = safe(() => AUDIO.wakeDegree(q, r, Object.assign(echoInfo(s), o)), 0);` (0 when AUDIO is
missing) and, BEFORE calling `AUDIO.wake` and whatever it returns, when not headless push `{ wx, wy, t0: s.t, deg, soft: !!(o && o.soft) }`
onto `s.noteMarks` (created in `begin`, capped at 24: drop the oldest). A new `drawNoteMarks(s, ctx, size)`, called right after
`drawPops` in `drawWorld`, draws each mark with `ART.tk.note` when it exists (else a filled oval head, a stem and a flag) rising from the
hex centre to `size * (0.55 + 0.06 * (deg + 4))` above it over 0.6 s and fading by 1.2 s; soft marks at half alpha; reduced motion: no
rise, a static mark that only fades; colours `#fff6dc` fill and `#140f2e` outline (the tokens of the pops and handles).

#### 7.6 Performance limits (low end phones)

| Item | Cost | Limit |
|---|---|---|
| one wake note | koto: 2 oscillators + 1 noise source, about 0.7 s (1.3 s for a cadence); arp: 1 oscillator, about 0.4 s | `NOTE_CAP` (lite smaller); dropped above 176 live sources |
| biggest Song (Beat Drop) | 7 koto notes + taiko + biwa, about 28 sources within 0.5 s | lite: 7 arp sources |
| Chorus | 6 rin (4 oscillators each, about 2.1 s) + 6 vox "ah" (2 oscillators and 1 noise each, 1.3 s) + 1 pad (3 oscillators, 3.1 s): about 45 sources | lite: 6 arp sources, no vox, no pad |
| echo | one DelayNode, 2 gains, 1 filter, built once; zero sources | off in calm and lite |
| the Hush | one BiquadFilter + one gain per map deck; automation only when the painted count changes, never per frame | a hushed map schedules about 10 to 25 percent of its notes, so early chapters are CHEAPER than today |
| main thread | `hexNote` is O(1) after the contour is cached (one per seed, chapter and width, cache cleared above 24) | `AUDIO.awake` is called only from `paintProgress` (on change) |
| muted effects | `wake` returns before building any node when the Effects slider is 0 | |
| headroom | the existing glue compressor, limiter and soft clip stay in the path | |

`MAX_LIVE` (220) is unchanged; the soak test (7.7 A8) proves the bound with wake notes in the mix.

#### 7.7 Tests (follow the audio suite pattern: `fresh()`, `live()`, the stub's `_audio` counters, `_advance`, spies via `g._run`)

Audio suite `tests/rogue_book_audio.test.mjs`:

| id | Change or new test | Key assertions |
|---|---|---|
| A0 | line 14 `LAYERED` -> `const INTENSE = ['combat1', 'combat2', 'combat3', 'elite', 'boss1', 'boss2', 'boss3', 'final']; const WOKEN = ['map1', 'map2', 'map3']; const LAYERED = INTENSE.concat(WOKEN);` | |
| A1 | test `the intensity tracks are layered, every other track is a single bed` | add `t.eq(d.drive, WOKEN.indexOf(id) >= 0 ? 'awake' : 'intensity')` for layered ids and `t.eq(d.drive, null)` for the rest; the boss checks stay on `['boss1', 'boss2', 'boss3', 'final']` |
| A2 | lines 418, 423 (the old sound-design pins) | 418: `t.ok(r('page_turn').layers.filter((ly) => ly.v === 'hyoshigi').length >= 2, 'a page_turn is two hyoshigi claps: the kamishibai opens');` 423: `t.ok(r('paint').layers.some((ly) => ly.k === 'noise' && ly.f2 > ly.f) && r('ink_splash').layers.some((ly) => ly.v === 'hyoshigi'), 'a wake breathes open, a find knocks twice');` |
| A3 | new `echo: every hex of a map owns a note in its chapter key, and the tune belongs to the map` | for ch 1..3 and seed 1234: every hex (r 0..12, col 0..20, `q = col - floor(r/2)`) gives an integer midi inside `descs['map'+ch].scaleIntervals` relative to its tonic; deg in -4..9; deterministic across `fresh()`; along the middle row (r 6, lift 0) neighbouring columns never differ by more than 2 degrees, over seeds 0..49 the mean share of steps of at most 1 degree is >= 0.7, every row uses >= 3 distinct degrees; same column: `hexNote(c, 0).deg >= hexNote(c - 6, 12).deg`; seeds 1 and 2 differ in >= 5 columns |
| A4 | new `echo: each Song sings its shape` | `Object.keys(AUDIO.SONGS)` minus `single`, `step` equals `Object.keys(DATA.brushes)` sorted; `songDegrees('stroke', 3, 2) === null`; `songDegrees('wave', 5, 1)` deep `[1,2,3,4,5]`; `songDegrees('fan', 3, 0)` deep `[0,2,4]`; `songDegrees('splash', 7, 3)[0] === -2`; halo strictly rising; unknown song null; `wakeDegree` without an anchor equals `hexNote().deg` |
| A5 | new `echo: a wake note plays live, never before init, muted or suspended, and a storm is capped` | before init false; `live()`: true and `_audio.started` grows; `setVolume('sfx', 0)` then false with no new sources; suspended false; after `_advance(2000)` 60 calls at one instant accept between 5 and 12; `last: true` always plays; every Song key with i 0..6 and an anchor plays without throwing; after `_advance(10000, 100)` `debug().live === 0` and `stopped === started` |
| A6 | new `echo: the echo send exists, is fed by wake notes, and is skipped when calm or lite; no delay node still works` | `graph.echoIn` reaches `sfxBus` and the destination; spy `createGain` (pattern of the `sfx options` test): after a wake, some new gain's `_out` contains `echoIn`; `options({calm: true})` then none does; `options()` returns `{calm: true, lite: false}`; a boot with `createDelay` throwing: `init({force: true})` true and `wake` true |
| A7 | new `the map sounds are re-voiced for Echo (ids kept)` | `L.sfx.length === 73` and still contains `paint ink_splash brush_pick brush_use ink_gain well page_turn`; `sfxRecipe('well').tune === 55`; `sfxRecipe('brush_pick').layers.filter((ly) => ly.v === 'shakuhachi').length >= 3`; `sfxRecipe('brush_use').layers.some((ly) => ly.v === 'taiko')` |
| A8 | soak test (line 672; insert after the `r < 0.75` branch at 685) | add branches `else if (r < 0.77) A.wake(rnd.int(0, 20), rnd.int(0, 12), { chapter: rnd.int(1, 3), seed: 7, song: rnd() < 0.5 ? undefined : rnd.pick(Object.keys(gg.DATA.brushes)), i: rnd.int(0, 6), aq: 3, ar: 5 }); else if (r < 0.78) A.awake(rnd());`; existing bounds still hold |
| A9 | new `the Hush: a map track is muffled, sparse and quiet while the land sleeps, and opens as it wakes` | for map1..3 `drive === 'awake'` and a `hush` with `lo` in 500..1000 and `floor` in [0.75, 1); `map3.hush.lo < map1.hush.lo`; `awake()` is 1 by default; `awake(0.06); music('map1')` (wake level 0 whatever the calibration): deck `target` `[1,0,0,0]`, `lp.frequency.value < 1000`; count notes started over 6 s; `awake(0.6)`: target `[1,1,1,1]`, `lp.frequency.value > 12000`, and the next 6 s start more than 1.3 times as many sources; `intensity()` stays 0; `music('combat1')`: its deck has no `lp` and starts at `[1,0,0,0]`; `awake('x') === 1`, `awake(-2) === 0` |
| A10 | new `the well sound is a temple bell: big, struck, beating, tuned to the map it rings over` | an osc layer under 130 Hz with `d >= 2`; two osc layers less than 1.5 Hz apart; an fm layer and a lowpass noise strike; `duck > 0`, `tune === 55`; live: `music('map2')`, oscillator-frequency spy (pattern of the `sfx options` test), reset the spy right before `sfx('well')`, the lowest frequency under 150 Hz is within 20 cents of 110 Hz (A) |
| A11 | offline test `every track schedules into an OfflineAudioContext` | add: `render(map3, {intensity: 0})` schedules fewer notes than `{intensity: 1}` |
| A12 | new `echo: Song chords never hold a semitone, a tritone or a major seventh` | for ch 1..3, every root -4..9, songs `fan` (n 3), `splash` (n 7), `halo` (n 6): `songDegrees(song, n, root, ch)` mapped to midi with `descs['map'+ch]` tonic + 12 and `scaleIntervals` (`midi = tonic + 12 + 12 * floor(d / 5) + sc[d mod 5]`); every pair's difference mod 12 is not 1, 6 or 11; `AUDIO.CHORD_ROOTS` has the three scale keys |
| A13 | new `the Hush is calibrated to real play` | `AUDIO.HUSH.from === 0.06`; `AUDIO.HUSH.span` and `AUDIO.HUSH.th` deep-equal the 7.2.4 numbers (a comment names the measured median `m`, the command and the date); hush values 900/0.85, 750/0.8, 600/0.75; first wake of a map sets `debug().liftKey` to `'<chapter>|<seed>'` and a second wake on the same map leaves it |
| A14 | new `the vox voice sings and speaks, and no score uses it` | `A.VOICES` contains `vox`; offline, `A.voice('vox', ...)` returns true for every vowel `a o u e m` and every syl `don ka tsu hey boom`, and its first gain automation event is a 0 (the `__env` spy pattern of line 140); no role of any `compose(id)` for every track id uses voice `vox`; `SONGS.blot.v === 'vox'`, `SONGS.step.v === 'vox'`; if an existing test asserts every voice is used by a score, exclude `vox` there with a comment (it is the wake-note voice) |

Loudness check L1 (browser, P6 acceptance; the node loader's OfflineAudioContext is a stub that cannot render samples). Run:

```
mkdir -p /tmp/echo_baseline
node tools/rogue_book/shot.mjs --url "rogue_book/index.html?debug=1&notutorial=1" --frames 10 --out /tmp/echo_baseline/peaks.png --js "(async () => { const out = {}; for (const id of ['paint', 'ink_gain', 'card_pick', 'well', 'relic_get']) { const c = new OfflineAudioContext(2, 44100 * 4, 44100); AUDIO.renderSfx(c, c.destination, id, { t0: 0.05, seed: 3 }); const b = await c.startRendering(); let p = 0; for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < d.length; i++) p = Math.max(p, Math.abs(d[i])); } out[id] = Math.round(2000 * Math.log10(p || 1e-9)) / 100; } return JSON.stringify(out); })()"
```

(shot.mjs awaits a returned promise and prints the result.) Pass: `paint < card_pick`, `ink_gain < card_pick`, and `|well - relic_get| <= 3`
(dB peaks). If it fails, change only the first number (`vol`) of the re-voiced recipe. Record the five numbers in the PR body.

Hygiene suite (H1): in `string ids handed to AUDIO, UI, ART and the bus exist in their closed lists` (line 421) add

```js
  bad.push(...literalUses(/(?<![.\w$])(?:snd|sfx)\s*\(\s*['"]([\w-]+)['"]/g, 'sfx', 'sound helper id'));
  bad.push(...literalUses(/\btick\s*:\s*['"]([\w-]+)['"]/g, 'sfx', 'counter tick sound'));
  bad.push(...literalUses(/['"]data-sfx['"]\s*:\s*['"]([\w-]+)['"]/g, 'sfx', 'data-sfx attribute', 'codeStr', ['none']));
```

(verified at a2bd24b: every current match is a valid id; the lookbehind keeps `AUDIO.sfx(` from double reporting; `rogue_book_lib.test.mjs`
only checks that expected messages are included, so it is unaffected.)

screen_map suite `tests/rogue_book_screen_map.test.mjs`:

| id | Change |
|---|---|
| M0 | `fresh()` (line 26): add a spy `g._run("globalThis.__wake = []; globalThis.__awake = []; { const o = AUDIO.wake, a = AUDIO.awake; AUDIO.wake = function (q, r, x) { __wake.push([q, r, x && x.song || null, x ? x.i : null, x && x.soft ? 1 : 0, x && x.last ? 1 : 0]); return o.call(AUDIO, q, r, x); }; AUDIO.awake = function (f) { __awake.push(f); return a.apply(AUDIO, arguments); }; }");` and helpers `const wakes = (g) => g._run('__wake'); const awakes = (g) => g._run('__awake');` |
| M1 | lines 215, 322, 382, 1572, 1682: NO id change (ids kept); leave them |
| M2 | new (headless) `a walk hums the path back, thinned` | a walk of L fresh hexes (use L >= 10): `wakes(g).filter((w) => w[4]).length === Math.min(L, 6) + Math.floor(Math.max(0, L - 6) / 2)` and those cells are the path's steps 1..6, 8, 10, ...; walking straight back over the same hexes within 4 s adds no soft call |
| M3 | new (realtime, `rt()`) `a chain sings its hexes in path order and holds the last` | after the double tap and `_tick(3000)`: the non-soft wake calls equal `f.pre.path` in order, `i` runs 0..n-1, only the last has `last` |
| M4 | new (realtime) `a Song sings every cell it wakes with its own gesture` | for `fan` and `splash`: wake calls carry `song === id`, count equals the painted cells, and `brush_use` is in the sfx log while `paint` is not (applyBrushNow no longer plays it) |
| M5 | new (headless) `the Hush follows the painted share` | on enter, the last `awakes(g)` equals `MAP.progress(R.map).frac`; after a paint it grows |
| M6 | new (realtime) `the melody is visible: one rising note mark per wake call, even with sound off` | after a chain of n hexes: the screen's `noteMarks` length equals the non-soft wake calls (n <= 24); then `AUDIO.setVolume('sfx', 0)` (AUDIO.wake now returns false) and another chain still adds n marks; marks are capped at 24 after a long chain. Read `noteMarks` through the same accessor the suite already uses for `reveals` (grep the suite); if there is none, expose it the same way |

ui suite `tests/rogue_book_ui.test.mjs`: line 14 stub add `options(o) { __log.opts = o; }, wake() {}, awake() {},`; in the applySettings
test (881 to 891) add `t.deep(g.log.opts, { calm: true, lite: true }, 'AUDIO.options bridges reduce motion and low quality');`; line 1042
the sfx id stays `'well'` (its toast regex is a P3 copy edit).

`ui.js` `applySettings` (line 194), after the `setVolume` line:
`if (isFn(au, 'options')) safe(() => au.options({ calm: !!o.reduceMotion, lite: o.quality === 'low' }));` and header line 12 gains
`AUDIO.options`.

#### 7.8 Optional extras

E2 (recommended if time allows):

- `hush` sfx, the Hush's breath for the chapter intro (screen_map `startIntro` 1993 plays `hush` instead of `page_turn`):
  `hush: [0.5, { var: 15, cd: 400, duck: 900, pri: 2 }, () => [N('white', 0, 1.1, 0.4, 'highpass', 2600, 5200, 0.7, { a: 0.9 }), N('pink', 0.2, 0.9, 0.2, 'bandpass', 900, 300, 0.8, { a: 0.6 }), O('sine', 147, 98, 0, 1.2, 0.25, { a: 0.5 })]],`
  plus the list entry appended at the END of `LISTS.sfx` (append only) and a recipe test.
- (The rising note marks moved to 7.5: they are required now.)

E3 (flavour, touches more contracts):

- `flute_call` (Kuro the Songweaver plays a flute): sfx `flute_call: [0.5, { var: 25, cd: 120 }, () => [V('shakuhachi', 79, 0, 0.12, 0.5), V('shakuhachi', 83, 0.13, 0.12, 0.5), V('shakuhachi', 86, 0.26, 0.35, 0.55)]]`;
  `scene.js` `sfxForEvent` case `play`: after the card sound, `if (DATA.cards[cardId] && DATA.cards[cardId].hero === 'kuro') out.push(['flute_call', { vol: 0.5 }]);`
  then add `'flute_call'` to `SCENE.SFX` (scene.js 128), the scene suite oracle (line 147) and DESIGN 5.9 item 7.
- (The sung `vox` voice moved to 7.1.10: it is required now.)
- Settings release preview `card_pick` -> `paint` (screen_menu 1561 and the menu suite at 842).
- Give the combat element `ink` (or its renamed id) its own layer instead of `slash`.

---------------------------------------------------------------------------------------------------------------------------------


#### 8.3 DESIGN.md 5.7 additions (append to the code block)

```
AUDIO.wake(q, r, o)                // one woken hex sings: o = {chapter, seed, cols, rows (the map's), song? (a DATA.brushes id), i?, n?, aq?, ar? (the Song's anchor),
                                   // last? (the held cadence), soft? (a walked hex), pan?}. Dropped like sfx, when the effects volume is 0, and above a note budget
AUDIO.hexNote(q, r, info) -> {deg, midi}   AUDIO.songDegrees(song, n, root) -> [deg] | null   AUDIO.wakeDegree(q, r, o) -> deg   // pure: the land's hidden tune
AUDIO.awake(frac?)                 // the painted share of the map (MAP.progress(M).frac); the map tracks are hushed (low-passed, quieter, fewer layers) until it rises; default 1
AUDIO.options({calm, lite}?)       // from UI.applySettings: calm = reduceMotion (no echo, no hummed steps), lite = quality low (cheap voice, fewer notes, no echo)
AUDIO.HUSH -> {from, span, th}     // the calibrated wake curve (read only); voice 'vox' sings vowels and speaks kuchi shoga, used by wake notes and never by a score
```

and one sentence after the block: "screen_map calls `AUDIO.wake` when each bloom starts and on every walked hex, and `AUDIO.awake` whenever
the painted count changes; the map tracks follow `awake`, the fight tracks follow `intensity`."

#### 8.4 ART_BIBLE.md section 9 rewrite brief

Keep the instrument and scale paragraph. Replace the track sentence's `map1..3 (calm exploration per chapter mood)` with "`map1..3` (the land
under the Hush: a still bed that gains bass, then arpeggios, then the melody as the map wakes, heard through a low-pass that opens with
it; chapter 3 is the deepest hush)". Add a paragraph "Echo": every woken hex sings one note of a seeded tune in the chapter's key (columns
carry the tune, rows bend it), a chain or a walk plays a phrase, each Song has a gesture with a sung or spoken layer (Drum Line plucks on taiko and speaks kuchi shoga, Ripple runs up
with a soft "oo", Shout cries "hey!" over a strummed triad, Beat Drop is a beatbox kick and sub drop then rises, Chorus stacks six bells and
six "ah" voices, Hum is one closed-mouth "mm"), and a half-beat echo answers.
Wells are temple bells tuned to the land (sfx id `well`, re-voiced). Pitch is decoration, never information.


### Re-voiced sfx recipes (ids kept, plan decision D8)

Replace the bodies of these seven `SFX_DEFS` entries in `js/audio.js` (lines about 963 to 985), keeping each KEY. `LISTS.sfx` in
`js/data.js` does not change. The `vol` values are estimates (the offline loudness tool is not in the repo): tune by ear with the game
running, keeping `paint` and `ink_gain` quieter than `card_pick`, and `well` near `relic_get`. `rawRecipe` must learn the `tune` option
(add `tune: o.tune || 0,` to the cached object) and `sfx` must apply it (see "Temple bells" above).

```js
    // ---- the map: waking the land (ids are internal and kept: paint = the sung wake, ink_splash = a find, brush_* = Songs, ink_gain = Echo, well = a temple bell, page_turn = a segue)
    paint: [0.9, { var: 50, cd: 60 }, () => [N('pink', 0, 0.22, 0.45, 'bandpass', 650, 1150, 4, { a: 0.03 }), N('white', 0, 0.012, 0.35, 'bandpass', 2400, 0, 1.4, { a: 0.001 }), O('triangle', 392, 523, 0.01, 0.16, 0.2, { a: 0.01 }), V('rin', 86, 0.14, 0.3, 0.22)]],
    ink_splash: [0.5, { var: 40, cd: 50 }, () => [V('hyoshigi', 60, 0, 0.05, 0.55, { double: 1 }), V('koto', 81, 0.06, 0.35, 0.42), V('koto', 86, 0.13, 0.45, 0.4), N('white', 0, 0.1, 0.12, 'highpass', 5000, 0, 0.8, { a: 0.004 })]],
    brush_pick: [0.62, { var: 30, cd: 60 }, () => [V('shakuhachi', 74, 0, 0.18, 0.45), V('shakuhachi', 79, 0.2, 0.18, 0.45), V('shakuhachi', 86, 0.4, 0.4, 0.5), V('koto', 86, 0.4, 0.5, 0.35)]],
    brush_use: [0.75, { var: 30, cd: 80, duck: 250 }, () => [N('pink', 0, 0.28, 0.4, 'bandpass', 500, 1800, 2.5, { a: 0.2 }), V('taiko', 38, 0.26, 0.5, 0.75), V('hyoshigi', 60, 0.26, 0.05, 0.45)]],
    ink_gain: [0.4, { var: 60, cd: 60 }, () => [O('sine', 660, 990, 0, 0.1, 0.45, { a: 0.004 }), O('sine', 660, 990, 0.12, 0.1, 0.22, { a: 0.004 }), O('sine', 660, 990, 0.24, 0.1, 0.1, { a: 0.004 }), N('white', 0, 0.12, 0.1, 'bandpass', 4200, 0, 1, { a: 0.01 })]],
    well: [0.62, { var: 12, cd: 300, duck: 600, pri: 2, tune: 55 }, () => [N('pink', 0, 0.09, 0.55, 'lowpass', 420, 160, 0.8, { a: 0.002 }), O('sine', 98, 0, 0, 3.0, 0.42, { a: 0.004 }), O('sine', 98.8, 0, 0, 3.0, 0.28, { a: 0.004 }), FM(196, 2.76, 2.4, 0, 2.4, 0.2), O('sine', 262, 0, 0, 2.0, 0.12, { a: 0.003 }), V('rin', 79, 0.03, 1.0, 0.3), N('pink', 0.3, 0.9, 0.1, 'bandpass', 400, 1600, 0.9, { a: 0.5 })]],
    page_turn: [0.6, { var: 30, cd: 120 }, () => [V('hyoshigi', 60, 0, 0.05, 0.6), V('hyoshigi', 62, 0.16, 0.05, 0.55), N('pink', 0.02, 0.35, 0.12, 'bandpass', 900, 500, 1.2, { a: 0.003 }), N('pink', 0.18, 0.35, 0.1, 'bandpass', 900, 500, 1.2, { a: 0.003 })]],
```

Meaning (for the audio.js header and ART_BIBLE section 9): `paint` a short sung "hah" (a breath through an "ah" formant that brightens,
a glottal tick, a small lift, a far bell answering); `ink_splash` two wooden knocks and a two-note answer (also the story seal stamp);
`brush_pick` a hummed three-note motif (learning a Song); `brush_use` a sharp intake of breath and the downbeat (the Song's notes follow
as wake notes); `ink_gain` a rising "ooh" that repeats softer twice (an echo); `well` a struck temple bell with a beating hum tone, tuned
to the map key; `page_turn` two sharp hyoshigi claps with a short wooden room tail (the kamishibai opening ritual: the event stage's
doors open on it). The scores' `mood` strings change too (internal, must stay
distinct): `boss3` 'cold, relentless, silencing'; `final` 'epic, desperate, the last verse'; `defeat` 'the last echo swallowed by the Hush'.
The audio.js line 895 comment `(fire, ice, paper)` becomes `(fire, ice, crackle)`.

Optional extra, NOT part of the default plan: the audio lens also designed renaming these seven internal ids (`paint -> wake`,
`ink_splash -> reveal_find`, `brush_pick -> song_get`, `brush_use -> song_cast`, `ink_gain -> echo_gain`, `well -> temple_bell`,
`page_turn -> segue`, 34 call sites including the hidden carriers `tick: 'ink_gain'` in screen_node.js and `'data-sfx'` keys in
screen_combat.js). Do it only if the owner asks (section 11, Q6); it changes no behaviour.

---

## Appendix F. Review notes (revision 2)

Three critics (completeness, executability, design) reviewed revision 1. Every blocker and major issue is applied in the plan body;
every correct minor issue too. Where to find each change:

| Issue | Resolution | Where |
|---|---|---|
| Plan untracked, no resume, scratchpad baselines (blocker, 2 majors) | P1 commits the plan first; 9.0.0 resume protocol from git; baselines regenerate from a2bd24b into `/tmp/echo_baseline/` | 0, 9.0.0, 9.0.1, P1, 8.7 |
| Save gate not runnable | exact `GAME.newRun` / `GAME.save` / `--store` / `continueRun` commands and acceptance | 8.7 gate 2 |
| screen_combat:366, browser 112/264, screen_menu 1072, screen_node 1182, run.js 845 | owned rows added (1B, 1A, 3B, 3C, 2E) | 8.2, P1, 5.7, Appendix B 3.6 and 3.7, Appendix C |
| Appendix E P-labels | E1, E2, E3 and a phase note | Appendix E header, 7.1.7, 7.1.9, 7.8 |
| Three origins of the Hush | one causal chain; the Conductor is the Singer's doubt and conducts the Hush; phase 2 is the Hush pouring out of him | 4.1, 4.5, spine, intro, boss_editor lore, spine test |
| Songs voiced only by instruments | required formant `vox` voice; kuchi shoga, "hey!", beatbox kick, hum, choir; Hanae and Suzu nod | 4.3, 7.1, Appendix E 7.1.3, 7.1.10, A14 |
| "song" as the world and a run; "Verse" for acts and pages | lowercase "song" banned in UI (rule 0.8, check 6); story collection is Ballads | 0, 3.1, 5.1, Appendix A tips and achievements, Appendix B, 8.3 |
| Hush uncalibrated | bot `--awake-report`, median-based WAKE_SPAN and TH_WAKE, lo 900/750/600, floor >= 0.75, first-wake lift, A13 | 7.1, Appendix E 7.2.1, 7.2.4 |
| Melody has no visual twin | rising note marks required, M6 | 7.1, 7.3, Appendix E 7.5 |
| Chords clash in in-sen and miyako-bushi | `CHORD_ROOTS` + `snapRoot`, A12 | Appendix E 7.1.3, 7.1.7 |
| `--` in the title | `ECHOWAKE: a rogue ballad` everywhere; `A NOTE FROM THE ROAD` decided | D1, 0.5, 5.9, 8.3, P3, Appendix B, C |
| P7 too large | split into P7a and P7b | 9, P7a, P7b |
| Tokenizer false positives, vague allowlist, sfx count | `${...}` placeholder, developer-message skip, exact allowlist, `>= 73` | 8.3 |
| Minor consistency items (title alternates, 4.4 scales, Suzu 121, `--echo`, stale rows, forge and Void rows, R18 wording, ui.js `isFn`, screenshots, enemies_3 fixture, esc helper, line numbers, walk thinning, per-verse `single`, Free Verse, Sing 25 Songs, share line, kamishibai claps, title bell rung, defeat bell, materials, map motion, Hush Moth and Inquisitor lore, `.mn-storypage`, Her voice, dev gallery labels, grep anchors) | applied | see the rows named in each critic's issue |

Rejected or changed, with the reason (one line each):

- Shrine of Echoes instead of the Hall of Echoes (design, minor): kept `Hall` as the default because it is the plaque word already checked against the 84 px phone plaque and every Appendix B and C row uses it; the Shrine is owner question 2.
- Kuzunoha's bell tails to singing foxfire (design, minor, optional part): not applied by default because her names, moves and roles were machine-validated with bells and the bells give Verse I its identity; Kuro's suzu bell IS dropped, and the foxfire is owner question 5.
- Halo in in-sen and miyako-bushi without the `+5` (design, major, one sub-point): not needed; degree `+5` is the root an octave up, not a semitone neighbour, so after `snapRoot` the full six-note stack has no 1, 6 or 11 interval (verified by script for every root); the clash fix itself is applied.
- A15 as an audio-suite peak test (executability, minor): the node loader's OfflineAudioContext is a stub that renders no samples, so the objective check is the browser loudness check L1 (same thresholds) instead of a suite test.
- Theme-suite allowlist entry for `'Her story'` (completeness, minor): not needed; the heading is changed to `'Her voice'` instead.
- Walk notes as "arp at minus 12 dB" (design, minor, one alternative): chose the other offered option, a breathy vox "mm" at vel 0.18, because it also serves the voice-and-rhythm pitch.
