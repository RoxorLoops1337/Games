# HOCUS VOCUS: the UI copy table (agent 0B)

Status: UI_COPY rev 1 (P0 agent 0B). Line numbers are from HV_BASE (ada3ca5); earlier phases move lines, so match on the quoted text, never
on the line number alone. The bible (`HV_BIBLE.md`) wins on every word; this file is the source for the rows marked "new" and for the
copy budgets and test pins below. It is the Hocus Vocus equivalent of `rogue_book/ECHO_PLAN.md` Appendix B (UI copy per file) and
Appendix C (UI test edits and copy budgets).

How to read it: section 1 says how the table was made and what each column means, section 2 is the table (one sub table per file),
section 3 the new UI strings that replace no literal (outfits, the social surfaces), section 4 the copy budgets the suites and the layout
enforce, section 5 the test pins each row changes, section 6 the couplings and traps the phase agents must know, section 7 the plan
conflicts found while writing this file, section 8 the cross-checks.

## 1. How the table was made

1. A scratch script (never in the repo) reused the literal walker of `tests/hocus_vocus_theme.test.mjs` (`tokenizeJs` from
   `tests/hocus_vocus_lib.mjs`): every string and template literal of `js/data_text.js`, `run.js`, `meta.js`, `ui.js`, `main.js`, `scene.js`,
   `screen_map.js`, `screen_menu.js`, `screen_node.js`, `screen_combat.js`, `screen_end.js` and `tutorial.js`, with `${...}` replaced by `X`,
   developer messages (`new Error`, `err(...)`, `console.*`) skipped. It found 3073 literals. The visible text of `index.html` and
   `gallery.html` and every CSS `content:` string were read the same way.
2. Each literal was matched against the Echowake vocabulary (the phase grep of HV_PHASES 2.4 widened with bible 6.2: wake, awake, heard,
   silent, land, journey, Treasure, Elite, Minion, Champion, Keeper, Peddler, Campfire, Forge, Gem Cache, Energy, Exhaust, Retain, Front,
   Back, row, Song, Verse, Echo, Hush, Chimes, Hall, Ballad, Tempo Trial, Daily Jam, the hero and boss names and the Japanese folklore
   words), against the Echowake tone words (kill, die, fall, fell, fallen, burn, fire, anvil, whetstone, purse, silence) and against every
   DATA display name of the content scripts (a hard-coded DATA name). 781 literals matched; each was read in its code, and the ones that
   are ids, CSS classes or surviving engine words (`Block`, `Swap`, `X cost`, bible 6.4) were dropped. Words the code builds from an id
   (`cap(row)`, `cap(tier)`, `cap(rarity)`, `cap(tag)`, a keyword id capitalised) print Echowake words too and have rows of their own.
3. Columns: `line` is the HV_BASE line; `Echowake literal` is the walker form (`X` stands for an interpolation; a leading or trailing space
   is part of the literal); `Hocus Vocus literal` is the exact replacement in the same form (a cell that starts without a backtick is an
   instruction, not a literal); `source` is where the new words come from (`bible 4.9` means HV_BIBLE section 4.9; `new` means no plan
   file had the string and it was written here in the bible's voice of 1.4); `phase` is the phase that pastes it.
4. Phases: P1 for `data_text.js`, `run.js` and `meta.js` (1A owns `data_text.js`, 1E owns `run.js` and `meta.js`); P2 for the rest (2B
   `screen_menu.js`, 2C `screen_map.js`, 2D `screen_node.js`, 2E `screen_end.js`, `tutorial.js`, `screen_combat.js` and the combat CSS
   strings, 2F `ui.js`, `main.js`, `scene.js` and the two pages); P9 for the social strings (section 3). The exceptions are marked in the
   phase column: the hit words of `scene.js` are P5 (agent 5C) and the canvas logo fallback in `screen_menu.js` is P4 (agent 4C).
5. Not in this table: DATA strings (cards, enemies, Charms, gems, Detours, Diary entries, barks, tips, Stickers, Encores, tiles, Spells,
   keywords, statuses, heroes: HV_HEROES, HV_ENEMIES, HV_WORLD_DATA, HV_STORY), text painted by `js/art*.js` (HV_ART_AUDIO 1 rule 7: for
   example the `ECHOWAKE` logo fallback in `js/art.js` and the logo letters of `js/art_scenes.js`, P4), comments and file header lines
   (`// Echowake: ...`, P10 10D) and the favicon (P4 4D).

## 2. The table, file by file

### 2.1 `js/data_text.js` (the rules-text generator; P1 1A)

The generator words of bible 4.9 and HV_HEROES 4.2, plus the defaults of HV_PHASES P1 agent note 1A. `KW(word, key)` is a keyword span: the word changes, the `data-kw` key never does. Where a row says "X = `lead`" the X is that span.

| line | Echowake literal | Hocus Vocus literal | source | phase |
|---|---|---|---|---|
| 229 | `Exhaust` | `Fade` (the `KW_EXHAUST` span; reading `DATA.keywords.exhaust.name` is better) | bible 4.2, HV_PHASES P1 1A | P1 |
| 230 | `Front` | `Lead` (`ROWKW.front`; so `Front:` and `Now Front:` read `Lead:` and `Now Lead:`) | bible 4.1, 4.9 | P1 |
| 230 | `Back` | `Backing` (`ROWKW.back`; `Backing:`, `Now Backing:`) | bible 4.1, 4.9 | P1 |
| 291 | `Energy spent` | `Breath spent` | bible 4.9 | P1 |
| 295 | `the number of cards in your X pile` | `the number of cards in your X pile` (X = the span `Faded`, data-kw `exhaust`: "your Faded pile") | HV_PHASES P1 1A | P1 |
| 300 | `your remaining Energy` | `your remaining Breath` | bible 4.9 | P1 |
| 300 | `Energy you have left` | `Breath you have left` | bible 4.9 | P1 |
| 349 | `X X while in the X rowX` | `X X while in the XX` (X = `lead`; "3 damage while in the lead") | HV_PHASES P1 1A | P1 |
| 350 | `X X (X in the X row)X` | `X X (X in the X)X` (X = `lead`; "4 damage (7 in the lead)") | HV_PHASES P1 1A | P1 |
| 378 | `X times (X in the X row)` | `X times (X in the X)` (X = `lead`) | HV_PHASES P1 1A | P1 |
| 405 | `the front hero gains X` | `the lead hero gains X` | bible 4.9 | P1 |
| 405 | `the back hero gains X` | `the backing hero gains X` | bible 4.9 | P1 |
| 406 | `the front hero loses X` | `the lead hero loses X` | bible 4.9 | P1 |
| 406 | `the back hero loses X` | `the backing hero loses X` | bible 4.9 | P1 |
| 407 | `heal the front hero for X` | `heal the lead hero for X` | bible 4.9 | P1 |
| 407 | `heal the back hero for X` | `heal the backing hero for X` | bible 4.9 | P1 |
| 408 | `the front hero` | `the lead hero` | bible 4.9 | P1 |
| 408 | `the back hero` | `the backing hero` | bible 4.9 | P1 |
| 428 | `you are Xin the X row` | `you are Xin the X` (X = `lead` or `backing spot`; "if you are now in the backing spot") | HV_PHASES P1 1A | P1 |
| 458 | `down` | `voiceless` (the span word of `your ally is X`, data-kw `down`) | bible 4.2 | P1 |
| 462 | `you have no Energy left` | `you have no Breath left` | bible 4.9 | P1 |
| 463 | `you have at least X Energy left` | `you have at least X Breath left` | bible 4.9 | P1 |
| 464 | `you have at most X Energy left` | `you have at most X Breath left` | bible 4.9 | P1 |
| 465 | `you have X to X Energy left` | `you have X to X Breath left` | bible 4.9 | P1 |
| 501 | `KW(k[0].toUpperCase() + k.slice(1), k)` | read `DATA.keywords[k].name` (`a card with Fade`, `with Hold`, `with Opener`, `with One Take`) | HV_PHASES P1 1A | P1 |
| 508 | `a Minion` | `a Sidekick` | bible 4.9, 4.11 | P1 |
| 508 | `an Elite` | `a Rival` | bible 4.9, 4.11 | P1 |
| 508 | `a Keeper` | `a Headliner` | bible 4.9, 4.11 | P1 |
| 512 | `minion` | `sidekick` (the fight word: "a sidekick fight") | bible 4.9 | P1 |
| 512 | `elite` | `Rival` ("Winning a Rival fight"; `aAn` gives "a") | bible 4.9 | P1 |
| 512 | `Keeper` | `Headliner` ("a Headliner fight") | bible 4.9 | P1 |
| 527 | `Exhausted` | `fades` (`X is X` becomes `X X`: "a card fades", span data-kw `exhaust`) | HV_PHASES P1 1A | P1 |
| 531 | `either hero swaps rows` | `either hero swaps spots` | HV_HEROES 4.2 | P1 |
| 531 | `you swap into the X row` | `you swap into the X` (X = `lead`) | HV_PHASES P1 1A | P1 |
| 531 | `you swap rows` | `you swap spots` | bible 4.1 | P1 |
| 532 | `you fall` | `you lose your voice` | HV_PHASES P1 1A | P1 |
| 532 | `a hero falls` | `a hero loses their voice` | HV_PHASES P1 1A, HV_HEROES 4.2 | P1 |
| 534 | `you wake a hex` | `you unmute a hex` | bible 4.9 | P1 |
| 536 | `you rest at a camp` | `you rest in a green room` | new (bible 4.1 Green Room) | P1 |
| 537 | `you enter a shop` | `you visit a merch stall` | new (bible 4.1; HV_WORLD_DATA 13 TRIG `/stall/i`) | P1 |
| 539 | `every X verse start` | `every X act start` | bible 4.9 | P1 |
| 539 | `at the start of each verse` | `at the start of each act` | bible 4.9 | P1 |
| 545 | `when it dies` | `when it is defeated` | new (bible 1.3 rule 3) | P1 |
| 547 | `when another enemy dies` | `when another enemy is defeated` | new (bible 1.3 rule 3) | P1 |
| 557 | `verse` | `act` (`once per act`, `up to 2 times per act`) | bible 4.9 | P1 |
| 752 | ` from your X pile` | ` from your X pile` (X = `Faded`) | HV_PHASES P1 1A | P1 |
| 756 | `X XX` | `X XX` (the leading span reads `Fade`: "Fade up to 2 cards") | bible 4.9 | P1 |
| 757 | `Retain` | `Hold` ("Hold up to 2 cards") | bible 4.9 | P1 |
| 760 | `return XX to your hand` | `return XX to your hand` (the pile span reads `Faded`) | HV_PHASES P1 1A | P1 |
| 778 | `add X to your X pile` | `add X to your X pile` (X = `Faded`) | HV_PHASES P1 1A | P1 |
| 785 | `a fallen hero` | `a voiceless hero` | bible 4.2 | P1 |
| 786 | `revive X with X` | `bring X back with X` (`who` reads `yourself`, `them` (was `that hero`) or `a voiceless hero`) | HV_HEROES 4.2 | P1 |
| 842 | `the front hero` | `the lead hero` (`E_HERO.front`) | bible 4.9 | P1 |
| 842 | `the back hero` | `the backing hero` (`E_HERO.back`) | bible 4.9 | P1 |
| 851 | `the front hero` | `the lead hero` | bible 4.9 | P1 |
| 913 | `the front hero` | `the lead hero` | bible 4.9 | P1 |
| 924 | `swap your rows` | `swap your spots` | bible 4.1 | P1 |
| 962 | `lose X Energy` | `lose X Breath` | bible 4.9 | P1 |
| 963 | `Energy` | `Breath` (the noun of `gain X`) | bible 4.9 | P1 |
| 970 | `X rows` | `X spots` ("Swap spots.") | bible 4.1, 4.9 | P1 |
| 973 | `Echo` | `Vox` (span data-kw `ink`; reading `DATA.keywords.ink.name` is better) | bible 4.9 | P1 |
| 1023 | `move to the X row` | `move to the X` (X = `lead` or `backing spot`: "Move to the lead.") | bible 4.1 | P1 |
| 1068 | `the front hero` | `the lead hero` (`runWho`) | bible 4.9 | P1 |
| 1076 | `Echo` | `Vox` (all three spans: "gain 50% of your max Vox", "lose 1 Vox", "gain 2 Vox") | bible 4.9 | P1 |
| 1087 | `gain a random X Treasure` | `gain a random X Charm` | bible 4.9 | P1 |
| 1089 | `learn a random Song` | `learn a random Spell` | bible 4.9 | P1 |
| 1092 | `wake X X for free` | `unmute X X for free` | bible 4.9 | P1 |
| 1130 | `KW_EXHAUST()` | the closing `Fade.` sentence (from the 229 row) | bible 4.2 | P1 |
| 1187 | `gain X Energy` | `gain X Breath` | bible 4.9 | P1 |
| 1189 | `apply X Poison` | `apply X X` (X = `DATA.statuses.poison.name`, Earworm) | bible 4.3 | P1 |
| 1191 | `gains X` | `gains X` (the keyword word is built from the id: read `DATA.keywords[k].name`, so "gains Hold" not "gains Retain") | HV_PHASES P1 1A | P1 |
| 1192 | `loses X` | `loses X` (the same: "loses Fade") | HV_PHASES P1 1A | P1 |
| 1194 | `Front` | `Lead` (gem condition prefix) | bible 4.1 | P1 |
| 1194 | `Back` | `Backing` | bible 4.1 | P1 |
| 1194 | `X row: X` | `X: X` ("Lead: +1 hit", "Backing: gain 1 Breath") | bible 4.1 | P1 |
| 1244 | `Stunned` | `Starstruck` | bible 4.3, 4.10 | P1 |
| 1248 | `the front hero` | `the lead hero` (intent text: "Deals 7 x2 to the lead hero") | bible 4.9 | P1 |
| 1249 | `the back hero` | `the backing hero` | bible 4.9 | P1 |
| 1255 | `the front hero` | `the lead hero` | bible 4.9 | P1 |
| 1257 | `the front hero` | `the lead hero` (`DEST.front`) | bible 4.9 | P1 |
| 1257 | `the back hero` | `the backing hero` (`DEST.back`) | bible 4.9 | P1 |
| 1307 | `swaps your rows` | `swaps your spots` | bible 4.1 | P1 |
| 1317 | `Front` | `Lead` (`rowText` label: "Lead: +2 damage on attacks") | bible 4.1 | P1 |
| 1317 | `Back` | `Backing` | bible 4.1 | P1 |
| 1324 | `Regen X` | `X X` (X = `DATA.statuses.regen.name`, Warm Tea) | bible 4.3 | P1 |
| 1325 | `Thorns X` | `X X` (X = `DATA.statuses.thorns.name`, Feedback) | bible 4.3 | P1 |

### 2.2 `js/run.js` (logic strings; P1 1E)

| line | Echowake literal | Hocus Vocus literal | source | phase |
|---|---|---|---|---|
| 378 | `Gained X Echo.` | `Gained X Vox.` | bible 4.9 | P1 |
| 378 | `Lost X Echo.` | `Lost X Vox.` | bible 4.9 | P1 |
| 437 | `No treasure to find.` | `No charm to find.` | new (bible 4.1 Charm) | P1 |
| 452 | `No treasure to find.` | `No charm to find.` | new (bible 4.1 Charm) | P1 |
| 472 | `Found the X.` | `Learned X.` | new (bible 4.1: you learn a Spell; Spell names take no article) | P1 |
| 472 | `No Song to find.` | `No Spell to find.` | bible 4.9 | P1 |
| 500 | `The land wakes (X).` | `The sound comes back (X).` | bible 4.9 | P1 |
| 656 | `Verse X begins.` | `Act X begins.` | bible 4.9 | P1 |
| 742 | `The land hums back one Echo.` | `A passer-by hums along: 1 Vox.` | bible 4.9 | P1 |
| 835 | `Not yet: you never freed the fox` | `Not yet: you never untangled the gull` | new (HV_STORY D2-2, the harbour gull) | P1 |
| 835 | `Not yet: the fox has not befriended you` | `Not yet: the gull has not made friends with you` | new (HV_STORY D2-2) | P1 |
| 845 | `Not yet: the journey has not led here` | `Not yet: the tour has not come this way` | bible 4.9 | P1 |
| 846 | `Verse X only` | `Act X only` | bible 4.9 | P1 |
| 851 | `Nothing left to sharpen` | `Nothing left to rehearse` | HV_PHASES P1 1E | P1 |
| 925 | `A fable unfolds.` | `A detour begins.` | bible 4.9 | P1 |
| 970 | `The fable has nothing left to tell. You find a little Echo.` | `The detour leads nowhere. You find a little Vox.` | bible 4.9 | P1 |
| 1022 | `The party fell.` | `The party lost their voices.` | new (bible 1.3 rule 3) | P1 |
| 1040 | `A keeper fell.` | `A headliner bowed out.` | bible 4.9 | P1 |
| 1104 | `Learned the Song.` | `Learned the Spell.` | bible 4.9 | P1 |
| 1267 | `The last note rings out.` | `The whole crowd sings the last line.` | bible 4.9 | P1 |

### 2.3 `js/meta.js` (P1 1E)

| line | Echowake literal | Hocus Vocus literal | source | phase |
|---|---|---|---|---|
| 332 | `Verse X, Echo X, X and X` | `Act X, Vox X, X and X` ("Act 2, Vox 5, Jasmin and RoxorLoops") | bible 4.9, 5.1 | P1 |

### 2.4 `js/ui.js` (P2 2F)

| line | Echowake literal | Hocus Vocus literal | source | phase |
|---|---|---|---|---|
| 265 | `Echowake is a landscape journey. Rotate your phone and the land will open wide.` | `Hocus Vocus is a landscape tour. Rotate your phone and the Soundlands open wide.` | new | P2 |
| 481 | `Something broke the rhythm` | `Something went a bit off-key` (the error modal title; the toast form is `Something went a bit off-key. Your tour is safe.`) | bible 5.6 | P2 |
| 483 | `The music skipped a beat in X. Everything up to your last save is safe.` | `The music skipped a beat in X. Your tour is safe up to your last save.` | new (bible 5.6 voice) | P2 |
| 753 | `A NOTE FROM THE ROAD` | `A TIP FROM JORDAN` | bible 4.1, 5.3 | P2 |
| 1432 | `Gain X Energy.` | `Gain X Breath.` (fallback card text) | bible 4.9 | P2 |
| 1433 | `X rows.` | `X spots.` (fallback card text: "Swap spots.") | bible 4.1 | P2 |
| 1474 | `Empty X socket` | `Empty X socket` (X = `DATA.COLOUR_NAME[color]`: "Empty pink socket", never the id `red`) | bible 4.1 | P2 |
| 1482 | `Prism slot` | `Rainbow slot` (read `DATA.keywords.prism.name`) | bible 4.2 | P2 |
| 1482 | ` slot` | ` slot` (the colour before it through `DATA.COLOUR_NAME`: "Pink slot") | bible 4.1 | P2 |
| 1627 | `ECHOWAKE` | `HOCUS VOCUS` (card back word, stacked on two lines; see budgets) | bible 1.2 | P2 |
| 1646 | `Keeper` | `Headliner` (relic tooltip rarity; `cap(def.rarity)` must also map `shop` to `Merch`) | HV_WORLD_DATA 14.1 | P2 |
| 1659 | `Tier ` | `Tier ` (then the colour through `DATA.COLOUR_NAME` and ` gem`: "Tier 2 pink gem") | HV_WORLD_DATA 10.2 | P2 |
| 1707 | `Spend it at peddlers. Keep some for the next shop.` | `Spend it at Jordan's merch stalls. Keep some for the next one.` | new | P2 |
| 1707 | `Echo` | `Vox` (`STAT_TIP.ink` label; the pill aria reads "Vox 7/14") | bible 4.1 | P2 |
| 1707 | `Hit points. A hero at 0 is downed.` | `Hit points. A hero at 0 loses their voice.` | new (bible 4.2) | P2 |
| 1708 | `Energy` | `Breath` | bible 4.10 | P2 |
| 1708 | `Spend Energy to play cards. It refills every turn.` | `Spend Breath to play cards. It refills every turn.` | bible 4.10 | P2 |
| 1708 | `Songs` | `Spells` | bible 4.1 | P2 |
| 1708 | `Chimes` | `Cheers` | bible 4.1 | P2 |
| 1708 | `Earned every journey. Spend them in the Hall of Echoes to unlock new content.` | `Earned after every tour. Spend them on the Tour Bus.` | bible 5.5 | P2 |
| 1886 | `Colorblind aids` | `Colour-blind aids` (both the label and the aria label) | bible 6.1 H10, HV_WORLD_DATA 11 | P2 |
| 1894 | `Short tips during your first journey` | `Short tips during your first tour` | HV_WORLD_DATA 11 | P2 |
| 2002 | `No treasures yet. Elites, chests and shops hold them.` | `No charms yet. Rivals, gift boxes and merch stalls hold them.` | bible 5.6 | P2 |
| 2003 | `Treasures` | `Charms` | bible 5.3 | P2 |

### 2.5 `js/main.js` (P2 2F)

Rows 549 to 733 are the placeholder screens (shown only when a real screen file failed to load) and rows 750 to 817 the `?gallery` component sheet: low priority, but they keep a grep for old words clean.

| line | Echowake literal | Hocus Vocus literal | source | phase |
|---|---|---|---|---|
| 104 | `This journey already ended in another window. Nothing more will be kept.` | `This tour already ended in another window. Nothing more will be kept.` | bible 4.1 | P2 |
| 135 | ` Chimes for the journey you set down` | ` Cheers for the tour you set down` | bible 4.1 | P2 |
| 153 | `The journey could not begin (RUN is not ready)` | `The tour could not start (RUN is not ready)` | bible 4.1 | P2 |
| 168 | `There is no saved journey to continue` | `There is no saved tour to continue` | bible 4.1 | P2 |
| 177 | `The temple bell rings` | `The tea is warm` (with the suffix below: "The tea is warm: 4 Vox.") | bible 5.6 | P2 |
| 177 | ` (+X Echo)` | `: X Vox.` | bible 5.6 | P2 |
| 178 | `You learn a Song` | `You learn a Spell` | bible 4.1 | P2 |
| 262 | `Abandon this journey?` | `Abandon this tour?` | bible 5.3 | P2 |
| 262 | `The journey ends here. You keep a share of the Chimes for the hexes you woke.` | `The tour ends here. You keep a share of the Cheers for the hexes you unmuted.` | bible 5.3 | P2 |
| 262 | `Abandon` | `Abandon tour` | bible 5.3 | P2 |
| 262 | `Keep playing` | `Keep touring` | bible 5.3 | P2 |
| 267 | ` Chimes` | ` Cheers` | bible 4.1 | P2 |
| 491 | `Treasure added: ` | `Charm added: ` (debug toast) | bible 4.1 | P2 |
| 556 | `Verse ` | `Act ` | bible 4.1 | P2 |
| 556 | ` Chimes` | ` Cheers` | bible 4.1 | P2 |
| 591 | `New Journey` | `New Tour` | bible 5.1 | P2 |
| 592 | `Daily Jam` | `Daily Duet` | bible 5.1 | P2 |
| 593 | `Hall` | `Tour Bus` | bible 5.1 | P2 |
| 594 | `ECHOWAKE` | `HOCUS VOCUS` | bible 1.2 | P2 |
| 594 | `a rogue ballad` | `beatboxing and vocal magic` | bible 1.2 | P2 |
| 604 | `Begin the journey` | `Start the Tour` | bible 5.2 | P2 |
| 610 | `Locked: finish an earlier verse to wake this hero` | `Locked: clear an earlier act to bring this hero on tour` | new (bible 5.2) | P2 |
| 614 | ` step into the silence.` | ` step onto the stage.` | new | P2 |
| 622 | `Tempo Trial` | `Encore` | bible 5.2 | P2 |
| 631 | `No journey is active.` | `No tour is on the road.` | bible 5.3 | P2 |
| 634 | `Elite` | `Rival` (the nine node buttons: read `DATA.tiles[kind].name`) | bible 4.4 | P2 |
| 634 | `Shop` | `Merch Stall` | bible 4.4 | P2 |
| 634 | `Camp` | `Green Room` | bible 4.4 | P2 |
| 634 | `Fable` | `Detour` | bible 4.4 | P2 |
| 634 | `Chest` | `Gift Box` | bible 4.4 | P2 |
| 634 | `Forge` | `Studio` | bible 4.4 | P2 |
| 634 | `Gem cache` | `Sparkle Booth` | bible 4.4 | P2 |
| 634 | `Keeper` | `Headliner` | bible 4.4 | P2 |
| 639 | `Verse X: the map (placeholder)` | `Act X: the map (placeholder)` | bible 4.1 | P2 |
| 664 | ` Echo` | ` Vox` | bible 4.1 | P2 |
| 664 | `Treasure offered` | `Charm offered` | bible 4.1 | P2 |
| 670 | `The peddler` | `Jordan's Merch Stall` | bible 4.1, 5.6 | P2 |
| 671 | `A fable` | `A detour` | bible 4.1 | P2 |
| 672 | `The campfire` | `The Green Room` | bible 4.1 | P2 |
| 672 | `You rest by the fire` | `You put your feet up` | bible 4.1 (Rest verb line) | P2 |
| 673 | `The inkstone forge` | `The Studio` | bible 4.4 | P2 |
| 674 | `A treasure chest` | `A gift box` | bible 4.1 | P2 |
| 674 | `You open the chest` | `You open the gift` | bible 5.6 | P2 |
| 675 | `A gem cache` | `A sparkle booth` | bible 4.1 | P2 |
| 681 | `Verse X complete` | `Act X complete` | bible 4.1 | P2 |
| 681 | `The verse ends.` | `The act ends.` | bible 4.1 | P2 |
| 686 | `The journey ends` | `The lights go down` | bible 5.4 | P2 |
| 690 | `The Hush lets go` | `Still human` | bible 2.5, 5.4 | P2 |
| 699 | `A verse` | `A diary entry` | bible 2.6 | P2 |
| 699 | `Once, the land could sing...` | `Nothing here yet. On we go, and the tour goes on.` | bible 2.6 | P2 |
| 699 | `Play on` | `On we go` | bible 4.1 | P2 |
| 709 | `Wake the grey fog with Echo to reveal hexes, then walk onto them.` | `Unmute the glossy fog with Vox to reveal hexes, then walk onto them.` | new | P2 |
| 709 | `Fight with two heroes: one in front, one behind. Swap rows when it helps.` | `Fight with two heroes: one in the lead, one backing. Swap spots when it helps.` | new | P2 |
| 709 | `Play cards with Energy. Socket gems into cards to change how they play.` | `Play cards with Breath. Socket gems into cards to change how they play.` | bible 4.1 | P2 |
| 709 | `Reach the keeper of the verse and break the Hush.` | `Reach the headliner of each act and win them over.` | new | P2 |
| 727 | `Treasures` | `Charms` | bible 5.3 | P2 |
| 729 | `Wake hexes with Echo, fight with two heroes in two rows, play cards with Energy, and socket gems into card slots. Reach the keeper of each verse.` | `Unmute hexes with Vox, fight with two heroes in two spots, play cards with Breath, and socket gems into card slots. Reach the headliner of each act.` | new | P2 |
| 730 | `Abandon journey` | `Abandon tour` | bible 5.3 | P2 |
| 779 | `Bestiary` | `Who's Who` (gallery section) | bible 4.1 | P2 |
| 803 | `The temple bell rings (+4 Echo)` | `The tea is warm: 4 Vox.` | bible 5.6 | P2 |
| 803 | `Not enough Energy` | `Not enough Breath` | bible 4.10 | P2 |
| 803 | `Achievement: First Echo` | `Sticker earned: First Gig` | bible 4.1, 4.7 | P2 |
| 806 | `Something broke the rhythm` | `Something went a bit off-key` | bible 5.6 | P2 |
| 806 | `Something went wrong in the music, but your progress is safe. Turn back to the title and try again.` | `Something went a bit off-key, but your tour is safe. Head back to the title and try again.` | bible 5.6 | P2 |
| 807 | `Abandon this journey?` | `Abandon this tour?` | bible 5.3 | P2 |
| 807 | `The journey ends here. You keep a share of the Chimes.` | `The tour ends here. You keep a share of the Cheers.` | bible 5.3 | P2 |
| 807 | `Keep playing` | `Keep touring` | bible 5.3 | P2 |
| 808 | `Choose a card to exhaust` | `Choose a card to fade` | bible 4.2 | P2 |
| 808 | `Exhaust` | `Fade` | bible 4.2 | P2 |
| 817 | `ECHOWAKE components: ` | `HOCUS VOCUS components: ` | bible 1.2 | P2 |
| 846 | `Achievement: ` | `Sticker earned: ` | bible 4.1 | P2 |

### 2.6 `js/scene.js` (P2 2F, the hit words P5 5C)

| line | Echowake literal | Hocus Vocus literal | source | phase |
|---|---|---|---|---|
| 140 | `ZAN!` | `LA!` | bible 4.10 | P5 |
| 141 | `BAN!` | `SIZZ!` | bible 4.10 | P5 |
| 142 | `KIN!` | `TING!` | bible 4.10 | P5 |
| 143 | `PIKA!` | `WOMP!` | bible 4.10 | P5 |
| 144 | `WAAN!` | `PKAH!` | bible 4.10 | P5 |
| 145 | `BUKU!` | `NANANA!` | bible 4.10 | P5 |
| 146 | `PIKA!` | `TA-DA!` (holy) | bible 4.10 | P5 |
| 895 | `KEEPER` | `HEADLINER` (boss banner fallback name) | bible 4.10 | P2 |
| 1173 | `DON!` | `BOOM!` (the heavy slash word) | bible 4.10 | P5 |
| 1336 | `Stunned` | `Starstruck` | bible 4.3 | P2 |
| 1373 | `GOGOGO` | `BOOM!` (a manga sound word, outside the allowed art words) | HV_ART_AUDIO 1 rule 7 | P5 |
| 2049 | `KEEPER` | `HEADLINER` (the seal on the boss banner; see budgets) | bible 4.10 | P2 |
| 2280 | `Claw Rake` | `Wild Swipe` (scene demo payload, `?scene` only) | new | P2 |
| 2283 | `Crushing Gore` | `Heavy Stomp` | new (bible 1.3: no gore) | P2 |
| 2285 | `Leaf Imp` | read `DATA.enemies.leaf_imp.name` | hard-coded DATA name | P2 |
| 2286 | `You dare break my silence?` | `Oh no. That was a little off-key.` | new (bible 3.6: the Gloss is polite) | P2 |
| 2297 | `You will be silenced!` | `Hold still. This will look so much better.` | new (bible 3.6) | P2 |

### 2.7 `js/screen_map.js` (P2 2C)

| line | Echowake literal | Hocus Vocus literal | source | phase |
|---|---|---|---|---|
| 171 | `Verse ` | `Act ` (`chapterTitle` fallback) | bible 5.6 | P2 |
| 990 | `Echo` | `Vox` (meter label `.mp-ink-l`) | bible 5.6 | P2 |
| 1015 | `Echo ` | `Vox ` (meter aria: "Vox 7 of 14") | bible 5.6 | P2 |
| 1018 | `Echo` | `Vox` (meter tip name) | bible 5.6 | P2 |
| 1018 | ` Echo to wake a hex next to the awake land. Temple bells, kills, camps and the land itself refill it.` | ` Vox to unmute a hex next to live ground. Tea stalls, won fights, green rooms and kind passers-by refill it.` | new | P2 |
| 1039 | `Song` | `Spell` (chip tip kind) | bible 4.1 | P2 |
| 1039 | `Sung once, then it fades.` | `Cast once, then it is gone.` | new | P2 |
| 1042 | `No Songs. Songbirds and champions teach them.` | `No Spells. Buskers and rivals teach them.` | bible 5.6 | P2 |
| 1066 | ` more treasures` | ` more charms` | bible 4.1 | P2 |
| 1067 | `Treasures: none yet` | `Charms: none yet` | bible 4.1 | P2 |
| 1067 | `Treasures` | `Charms` | bible 4.1 | P2 |
| 1089 | `Verse ` | `Act ` (banner `.mp-ch`, roman: "Act I") | bible 5.6 | P2 |
| 1093 | `Land awake` | `Live ground` (progress aria label) | new | P2 |
| 1102 | `What every hex, Song and control means.` | `What every hex, Spell and control means.` | bible 4.1 | P2 |
| 1103 | `See the whole land, or return to following the party.` | `See the whole map, or go back to following the party.` | new | P2 |
| 1111 | `Songs` | `Spells` (tray label) | bible 5.6 | P2 |
| 1123 | `Sing` | `Cast` (mode bar apply button) | bible 4.1 | P2 |
| 1125 | `Song mode` | `Spell mode` | bible 4.1 | P2 |
| 1147 | `% awake` | `% live` | bible 5.6 | P2 |
| 1149 | ` hexes awake` | ` hexes live` | bible 5.6 | P2 |
| 1190 | `Teaches the ` | `Teaches ` | new (Spell names take no article) | P2 |
| 1191 | `Rings back ` | `A warm tea worth ` | new (bible 4.4 Tea Stall) | P2 |
| 1191 | ` Echo.` | ` Vox.` | bible 4.1 | P2 |
| 1192 | `Holds a treasure and gold.` | `Holds a charm and gold.` | bible 4.1 | P2 |
| 1215 | `No awake path leads there.` | `No live path leads there.` | bible 4.1 | P2 |
| 1221 | `, heard` | `, spotted` (both branches; see budgets) | bible 4.1 | P2 |
| 1222 | `Silent ground` | `Muted ground` | bible 5.6 | P2 |
| 1222 | `Grey and still. Wake it to hear what it holds.` | `Glossy and quiet. Unmute it to hear what it holds.` | bible 5.6 | P2 |
| 1224 | `Tap to wake: ` | `Tap to unmute: ` | bible 4.1 | P2 |
| 1224 | `Not enough Echo to wake: ` | `Not enough Vox to unmute: ` | bible 4.1 | P2 |
| 1224 | ` Echo.` | ` Vox.` | bible 4.1 | P2 |
| 1228 | `Tap twice to wake a chain of ` | `Tap twice to unmute a chain of ` | bible 4.1 | P2 |
| 1228 | `Too far for your Echo: a chain of ` | `Too far for your Vox: a chain of ` | bible 4.1 | P2 |
| 1250 | `Wake fog beside the land for ` | `Unmute nearby fog for ` (with the next row: "Unmute nearby fog for 1 Vox, or tap live ground to walk.", 56 characters, was 65) | new | P2 |
| 1250 | ` Echo, or tap awake ground to walk.` | ` Vox, or tap live ground to walk.` | bible 4.1 | P2 |
| 1250 | `Tap fog to wake it (` | `Tap fog to unmute it (` | bible 4.1 | P2 |
| 1250 | ` Echo), tap awake ground to walk.` | ` Vox), tap live ground to walk.` | bible 4.1 | P2 |
| 1251 | `No Echo left to wake. Walk to a bell, fight, or sing a Song.` | `No Vox left. Walk to a tea stall, fight, or cast a Spell.` | new | P2 |
| 1251 | `No Echo to wake. Walk to a bell, or sing a Song.` | `No Vox left. Walk to a tea stall, or cast a Spell.` | new | P2 |
| 1253 | `Tap fog to wake, ground to walk.` | `Tap fog to unmute, ground to walk.` | bible 4.1 | P2 |
| 1253 | `No Echo: walk, or sing a Song.` | `No Vox: walk, or cast a Spell.` | bible 4.1 | P2 |
| 1253 | `Songs: ` | `Spells: ` | bible 4.1 | P2 |
| 1254 | ` hexes awake` | ` hexes live` ("12 of 180 hexes live") | bible 5.6 | P2 |
| 1301 | `The land hums back one Echo.` | `A passer-by hums along: 1 Vox.` | bible 4.9 | P2 |
| 1303 | `The land hums back one Echo.` | `A passer-by hums along: 1 Vox.` | bible 4.9 | P2 |
| 1402 | `This journey has ended.` | `This tour has ended.` | bible 4.1 | P2 |
| 1402 | ` cannot be woken.` | ` cannot be unmuted.` (after `DATA.tiles.block.name`: "Blur cannot be unmuted.") | bible 4.1 | P2 |
| 1402 | `That hex is already awake.` | `That hex is already live.` | bible 4.1 | P2 |
| 1403 | `No way to reach it through the silence.` | `No way to reach it through the fog.` | new (35 characters, inside the phone budget of 40) | P2 |
| 1403 | `Not enough Echo.` | `Not enough Vox.` | bible 4.1 | P2 |
| 1403 | `You do not know that Song.` | `You do not know that Spell.` | bible 4.1 | P2 |
| 1403 | `That would wake nothing new.` | `That would unmute nothing new.` | bible 4.1 | P2 |
| 1404 | `That Song is unknown.` | `That Spell is unknown.` | bible 4.1 | P2 |
| 1404 | `Aim the Song first.` | `Aim the Spell first.` | bible 4.1 | P2 |
| 1404 | `That is not a place this Song can start.` | `This Spell cannot start from here.` | new (the phone budget is 40; the plain swap is 41) | P2 |
| 1404 | `Too far from the awake land.` | `Too far from the live ground.` | bible 4.1 | P2 |
| 1415 | ` Echo and you hold ` | ` Vox and you hold ` | bible 4.1 | P2 |
| 1431 | `Woke ` | `Unmuted ` | bible 4.1 | P2 |
| 1431 | ` Echo. ` | ` Vox. ` | bible 4.1 | P2 |
| 1431 | ` Echo left.` | ` Vox left.` | bible 4.1 | P2 |
| 1442 | `Start from an awake hex.` | `Start from a live hex.` | bible 4.1 | P2 |
| 1442 | `Start from a silent hex beside the awake land.` | `Start from a muted hex beside the live ground.` | bible 4.1 | P2 |
| 1442 | `Start beside the awake land.` | `Start beside the live ground.` | bible 4.1 | P2 |
| 1442 | `Start from a silent hex within 4 hexes of the party.` | `Start from a muted hex within 4 hexes of the party.` | bible 4.1 | P2 |
| 1460 | `You do not know that Song.` | `You do not know that Spell.` | bible 4.1 | P2 |
| 1463 | `The ` | `` (drop the article: `X has nowhere to unmute right now.`) | new (Spell names take no article) | P2 |
| 1463 | ` has nowhere to wake right now.` | ` has nowhere to unmute right now.` | bible 4.1 | P2 |
| 1487 | `Song set aside.` | `Spell set aside.` | bible 4.1 | P2 |
| 1512 | `Aim, then tap the arrow hex again to wake ` | `Aim, then tap the arrow again to unmute ` | new (keeps the line at 49, was 51) | P2 |
| 1512 | `Tap the arrow again to wake ` | `Tap the arrow again to unmute ` | bible 4.1 | P2 |
| 1512 | `Nothing would wake that way. Aim elsewhere.` | `Nothing would unmute that way. Aim elsewhere.` | bible 4.1 | P2 |
| 1512 | `Nothing wakes that way. Aim elsewhere.` | `Nothing unmutes that way. Aim elsewhere.` | bible 4.1 | P2 |
| 1512 | `Tap the hex again or press Sing to wake ` | `Tap again or press Cast to unmute ` | new (keeps the line short) | P2 |
| 1512 | `Tap again to wake ` | `Tap again to unmute ` | bible 4.1 | P2 |
| 1516 | `Glowing hexes are places to start. Hover for the shape, tap to sing.` | `Glowing hexes are places to start. Hover for the shape, tap to cast.` | bible 4.1 | P2 |
| 1516 | `Tap a glowing hex to sing.` | `Tap a glowing hex to cast.` | bible 4.1 | P2 |
| 1519 | `Aim the Song at hexes it can wake` | `Aim the Spell at hexes it can unmute` | bible 4.1 | P2 |
| 1520 | `Sing ` | `Cast ` (and the bare `Sing` label on the same line: `Cast`) | bible 4.1 | P2 |
| 1555 | `Waking ` | `Unmuting ` (both) | bible 4.1 | P2 |
| 1555 | `Nothing to wake that way.` | `Nothing to unmute that way.` | bible 4.1 | P2 |
| 1557 | `Tap to wake ` | `Tap to unmute ` | bible 4.1 | P2 |
| 1573 | `Song anchored. Aim it, then tap to sing. Facing ` | `Spell anchored. Aim it, then tap to cast. Facing ` | bible 4.1 | P2 |
| 1576 | `Aim the Song at hexes it can wake.` | `Aim the Spell at hexes it can unmute.` | bible 4.1 | P2 |
| 1580 | ` would wake.` | ` would unmute.` | bible 4.1 | P2 |
| 1580 | `Nothing would wake.` | `Nothing would unmute.` | bible 4.1 | P2 |
| 1583 | `Nothing would wake that way.` | `Nothing would unmute that way.` | bible 4.1 | P2 |
| 1591 | ` would wake. Tap again to apply.` | ` would unmute. Tap again to apply.` | bible 4.1 | P2 |
| 1606 | `Pick a glowing hex for the Song to start from.` | `Pick a glowing hex for the Spell to start from.` | bible 4.1 | P2 |
| 1619 | `The ` | `` (drop the article: `X unmutes 5 hexes.`) | new (Spell names take no article) | P2 |
| 1619 | ` wakes ` | ` unmutes ` | bible 4.1 | P2 |
| 1649 | `No awake path leads there.` | `No live path leads there.` | bible 4.1 | P2 |
| 1716 | ` Echo` | ` Vox` (float text "+4 Vox") | bible 4.1 | P2 |
| 1736 | `The bell rings: ` | `The tea is warm: ` | bible 5.6 | P2 |
| 1736 | ` Echo.` | ` Vox.` | bible 5.6 | P2 |
| 1736 | `You learn the ` | `You learn ` | new (Spell names take no article) | P2 |
| 1747 | `The keeper of this verse.` | `The headliner of this act.` | bible 4.4 | P2 |
| 1908 | ` Echo. ` | ` Vox. ` | bible 4.1 | P2 |
| 1908 | `Tap it again to wake.` | `Tap it again to unmute.` | bible 4.1 | P2 |
| 1934 | `You know no Songs. Songbirds and champions teach them.` | `You know no Spells. Buskers and rivals teach them.` | bible 5.6 | P2 |
| 2042 | `Only silence` | `No map yet` | new (bible 5.6 voice) | P2 |
| 2043 | `There is no map to show. The land was never woken, or the journey is over.` | `There is no map to show. The tour has not started, or it is over.` | bible 5.6 | P2 |
| 2051 | `Verse ` | `Act ` (the intro card kicker) | bible 4.1 | P2 |
| 2096 | `The land hums back one Echo.` | `A passer-by hums along: 1 Vox.` | bible 4.9 | P2 |
| 2102 | `Verse ` | `Act ` | bible 4.1 | P2 |
| 2102 | ` Echo. ` | ` Vox. ` | bible 4.1 | P2 |
| 2102 | ` percent awake.` | ` percent live.` | bible 4.1 | P2 |
| 2144 | `Dropped by a verse's keeper.` | `Dropped by an act's headliner.` | bible 4.1 | P2 |
| 2145 | `Sold only by peddlers.` | `Sold only at merch stalls.` | bible 4.1 | P2 |
| 2146 | `Dropped by champions, treasure chests and peddlers.` | `Found with rivals, in gift boxes and at merch stalls.` | bible 4.1 | P2 |
| 2147 | `Found in Verse ` | `Found in Act ` | bible 4.1 | P2 |
| 2147 | `Carried since the journey began.` | `Carried since the tour began.` | bible 4.1 | P2 |
| 2166 | `Keeper` | `Headliner` (rarity tag; `cap(d.rarity)` must map `shop` to `Merch`) | HV_WORLD_DATA 14.1 | P2 |
| 2173 | `No treasures yet. Champions, chests and peddlers hold them.` | `No charms yet. Rivals, gift boxes and merch stalls hold them.` | bible 5.6 | P2 |
| 2177 | `treasure` | `charm` (the `U.plural` noun of the summary: "5 charms: ...") | bible 4.1 | P2 |
| 2177 | `counts[r] + ' ' + r` | `counts[r] + ' ' + RARITY_NAME[r].toLowerCase()` ("2 common, 1 headliner, 1 merch"; the rarity ids `boss` and `shop` were printed) | HV_WORLD_DATA 14.1 | P2 |
| 2180 | `Treasures` | `Charms` | bible 4.1 | P2 |
| 2248 | `slide the land, with a little glide` | `slide the map, with a little glide` | new | P2 |
| 2248 | `Click fog beside the awake land` | `Click fog beside live ground` | bible 4.1 | P2 |
| 2248 | `wake it for 1 Echo` | `unmute it for 1 Vox` | bible 4.1 | P2 |
| 2248 | `preview the cheapest chain, click again to wake all of it` | `preview the cheapest chain, click again to unmute all of it` | bible 4.1 | P2 |
| 2248 | `Click awake ground` | `Click live ground` | bible 4.1 | P2 |
| 2248 | `back out of a Song or a preview` | `back out of a Spell or a preview` | bible 4.1 | P2 |
| 2249 | `slide the land` | `slide the map` | new | P2 |
| 2249 | `Tap fog beside the land` | `Tap fog beside live ground` | bible 4.1 | P2 |
| 2249 | `wake it for 1 Echo` | `unmute it for 1 Vox` | bible 4.1 | P2 |
| 2249 | `preview the chain, then wake it` | `preview the chain, then unmute it` | bible 4.1 | P2 |
| 2249 | `Tap awake ground` | `Tap live ground` | bible 4.1 | P2 |
| 2249 | `Song chip, glowing hex, aim, tap again` | `Spell chip, glowing hex, aim, tap again` | bible 4.1 | P2 |
| 2249 | `sing a Song` | `cast a Spell` | bible 4.1 | P2 |
| 2250 | `fit the whole land, again to follow the party` | `fit the whole map, again to follow the party` | new | P2 |
| 2250 | `wake or walk to the cursor hex` | `unmute or walk to the cursor hex` | bible 4.1 | P2 |
| 2250 | `pick a Song, Esc to set it aside` | `pick a Spell, Esc to set it aside` | bible 4.1 | P2 |
| 2256 | `Silent ground` | `Muted ground` | bible 4.1 | P2 |
| 2256 | `A hex nobody has woken. Wake it next to the awake land for ` | `A hex the Gloss has muted. Unmute it next to live ground for ` | new | P2 |
| 2256 | ` Echo to hear what it holds.` | ` Vox to hear what it holds.` | bible 4.1 | P2 |
| 2257 | `Heard from afar` | `Spotted from afar` | bible 4.1 | P2 |
| 2257 | `Landmarks ring faintly through the fog, as silhouettes: ` | `Landmarks show through the fog as silhouettes: ` | new | P2 |
| 2258 | `A tile that has been dealt with fades back into the land. Walk over it freely.` | `A tile that has been dealt with fades back into plain ground. Walk over it freely.` | new | P2 |
| 2259 | `Holes the Hush swallowed whole. Nothing can cross them and no Song wakes them.` | `Patches the Gloss smoothed away. Nothing can cross them and no Spell unmutes them.` | bible 4.4 | P2 |
| 2268 | `heard from afar` | `spotted from afar` | bible 4.1 | P2 |
| 2278 | `Songs are free and sung once. The gold ring is where the Song starts, teal is what it wakes. Lines and fans can face any of the six directions.` | `Spells are free and cast once. The gold ring is where the Spell starts, teal is what it unmutes. Lines and wedges can face any of the six directions.` | new (bible 4.5: Air Horn is a wedge) | P2 |
| 2322 | `The land` | `The Soundlands` | bible 5.6 | P2 |
| 2322 | `Songs` | `Spells` | bible 5.6 | P2 |

### 2.8 `js/screen_menu.js` (P2 2B; the logo fallback P4 4C)

| line | Echowake literal | Hocus Vocus literal | source | phase |
|---|---|---|---|---|
| 249 | `Start a new journey?` | `Start a new tour?` | bible 5.2 | P2 |
| 249 | `You have a journey in progress. Beginning a new one will replace it.` | `You have a tour on the road. Starting a new one will replace it.` | bible 5.2 | P2 |
| 249 | `Begin anew` | `Start fresh` | bible 5.2 | P2 |
| 249 | `Keep my journey` | `Keep my tour` | bible 5.2 | P2 |
| 257 | `The journey cannot begin yet` | `The tour cannot start yet` | bible 4.1 | P2 |
| 431 | `ECHOWAKE` | `HOCUS VOCUS` (`drawLogoFallback` measure) | bible 1.2 | P4 |
| 436 | `ECHOWAKE` | `HOCUS VOCUS` (`drawLogoFallback`, stacked two lines) | bible 1.2 | P4 |
| 487 | `Return to your saved journey` | `Back to your tour` | bible 5.1 | P2 |
| 488 | `Tempo Trial ` | `Encore ` | bible 4.1 | P2 |
| 488 | UI.hanko('T' + info.trial | `UI.hanko('E' + info.trial` (the hanko letter) | HV_WORLD_DATA 10.6 | P2 |
| 488 | `Daily Jam` | `Daily Duet` | bible 5.1 | P2 |
| 491 | `New Journey` | `New Tour` | bible 5.1 | P2 |
| 491 | `Choose two heroes and a Tempo Trial` | `Pick your duo and an Encore` | bible 5.1 | P2 |
| 494 | `A new jam every day` | `A new duet every day` | bible 5.1 | P2 |
| 495 | `Daily Jam` | `Daily Duet` | bible 5.1 | P2 |
| 512 | `A new Daily Jam has begun` | `A new Daily Duet has begun` | bible 5.1 | P2 |
| 516 | `Hall` | `Tour Bus` | bible 5.1 | P2 |
| 523 | `Drawn in ink, sung in code. No two journeys alike.` | `Drawn in code, sung with heart. No two tours alike.` | bible 5.1 | P2 |
| 532 | `a rogue ballad` | `beatboxing and vocal magic` | bible 1.2 | P2 |
| 536 | `Echowake, a rogue ballad` | `Hocus Vocus, a vocal magic adventure` | bible 1.2 | P2 |
| 619 | `Begin the Journey` | `Start the Tour` | bible 5.2 | P2 |
| 619 | `Begin Daily Jam` | `Start Daily Duet` | bible 5.2 (as reconciled by 0A) | P2 |
| 678 | ` Not yet woken from the Hush` | ` Not on the tour yet` | new | P2 |
| 681 | `Finish the verse to unlock ` | `Clear the act to bring ` | bible 5.2 | P2 |
| 681 | ` for every future journey.` | ` on every future tour.` | bible 5.2 | P2 |
| 687 | `cap(row)` | `Lead` / `Backing` (a display word, never `cap` of the id) | bible 4.1 | P2 |
| 687 | `/^(Front\|Back): /` | `/^(Lead\|Backing): /` (strips the `DATA.rowText` label) | bible 4.1 | P2 |
| 726 | `Choose Two Heroes` | `Pick your duo` | bible 5.2 | P2 |
| 726 | `Chimes` | `Cheers` (aria label) | bible 4.1 | P2 |
| 751 | `FRONT` | `LEAD` | bible 5.2 | P2 |
| 752 | `BACK` | `BACKING` | bible 5.2 | P2 |
| 754 | `Swap front and back` | `Swap lead and backing` | bible 4.1 | P2 |
| 756 | `Choose two heroes to see them stand together.` | `Pick two heroes to see them on stage together.` | bible 5.2 | P2 |
| 771 | `Lower the Tempo Trial` | `Lower the Encore` | bible 4.1 | P2 |
| 772 | `Raise the Tempo Trial` | `Raise the Encore` | bible 4.1 | P2 |
| 776 | `Tempo Trial rules` | `Encore rules` | bible 4.1 | P2 |
| 777 | `Tempo Trial` | `Encore` | bible 5.2 | P2 |
| 778 | `Daily Jam` | `Daily Duet` | bible 5.2 | P2 |
| 784 | `Choose two heroes first` | `Pick two heroes first` (also 832 and 954) | new (matches `Pick your duo`) | P2 |
| 788 | `Daily Jam` | `Daily Duet` | bible 5.2 | P2 |
| 788 | `the same jam for everyone today` | `the same duet for everyone today` | bible 5.2 | P2 |
| 810 | `The Daily Jam chooses your heroes` | `The Daily Duet chooses your heroes` | bible 4.1 | P2 |
| 831 | `The Daily Jam sets the order too` | `The Daily Duet sets the order too` | bible 4.1 | P2 |
| 848 | `Today's Daily Jam is not available right now` | `Today's Daily Duet is not available right now` (the code has a curly apostrophe: make it straight) | bible 4.1 | P2 |
| 869 | `A new Daily Jam has begun` | `A new Daily Duet has begun` | bible 5.1 | P2 |
| 911 | `FRONT` | `LEAD` (hero card badge) | bible 5.2 | P2 |
| 911 | `BACK` | `BACKING` | bible 5.2 | P2 |
| 926 | `: prefers ` | `: prefers the lead` (or `: prefers backing`: the spot word, never the id `front` or `back`) | new | P2 |
| 933 | `Trial 0` | `No encore` | bible 5.2 | P2 |
| 933 | `Trial ` | `Encore ` ("Encore V: Harsh Critics") | bible 5.2 | P2 |
| 936 | `The Daily Jam is always Trial 0.` | `The Daily Duet never has an encore.` | bible 5.2 | P2 |
| 936 | `Win a journey to unlock Tempo Trials.` | `Win a tour to unlock Encores.` | bible 5.2 | P2 |
| 936 | `The tune as it was first sung.` | `The tour, just as it comes.` | bible 5.2 | P2 |
| 936 | `Every level below is added on top.` | `Every encore below is added on top.` | bible 5.2 | P2 |
| 944 | `No trials yet. Break the Hush once to open the first.` | `No encores yet. Beat the Gloss once to earn the first.` | bible 5.2 | P2 |
| 944 | `No extra rules. Higher trials stack their rules here.` | `No extra rules. Higher encores stack their rules here.` | bible 5.2 | P2 |
| 1103 | `Achievements` | `Stickers` | bible 5.5 | P2 |
| 1104 | `Ballads` | `Diary` | bible 5.5 | P2 |
| 1105 | `Bestiary` | `Who's Who` | bible 5.5 | P2 |
| 1106 | `History` | `Past Tours` | bible 5.5 | P2 |
| 1108 | `Minion` | `Sidekick` | HV_WORLD_DATA 10.1 | P2 |
| 1108 | `Champion` | `Rival` | HV_WORLD_DATA 10.1 | P2 |
| 1108 | `Keeper` | `Headliner` | HV_WORLD_DATA 10.1 | P2 |
| 1109 | `Treasure` | `Charm` | HV_WORLD_DATA 10.1 | P2 |
| 1137 | `Treasures` | `Charms` | HV_WORLD_DATA 10.2 | P2 |
| 1150 | `Nothing in the Hall matches those filters.` | `Nothing on the bus matches those filters.` | HV_WORLD_DATA 10.2 | P2 |
| 1154 | `Treasures` | `Charms` | HV_WORLD_DATA 10.2 | P2 |
| 1177 | `Keeper` | `Headliner` (through `RARITY_NAME`: Common, Uncommon, Rare, Headliner, Merch) | HV_WORLD_DATA 10.2 | P2 |
| 1177 | ` treasure` | ` charm` | HV_WORLD_DATA 10.2 | P2 |
| 1177 | ` of ` | ` for ` ("Rare charm for Jasmin") | HV_WORLD_DATA 10.2 | P2 |
| 1181 | ` gem` | ` gem` (the colour word through `DATA.COLOUR_NAME`: "Tier 2 pink gem") | HV_WORLD_DATA 10.2 | P2 |
| 1197 | ` more Chimes` | ` more Cheers` | HV_WORLD_DATA 10.2 | P2 |
| 1199 | ` Chimes. You can afford it.` | ` Cheers. You can afford it.` | HV_WORLD_DATA 10.2 | P2 |
| 1199 | ` Chimes.` | ` Cheers.` | HV_WORLD_DATA 10.2 | P2 |
| 1248 | ` more Chimes` | ` more Cheers` | HV_WORLD_DATA 10.2 | P2 |
| 1271 | ` Chimes earned` | ` Cheers earned` | HV_WORLD_DATA 10.3 | P2 |
| 1280 | ` Chimes` | ` Cheers` (aria `Reward N Cheers`) | HV_WORLD_DATA 10.3 | P2 |
| 1286 | `No achievements yet.` | `No stickers yet.` | bible 5.5 | P2 |
| 1303 | `The Verses` | `The Acts` | HV_WORLD_DATA 10.4 | P2 |
| 1305 | `The Voices` | `The Crew` | HV_WORLD_DATA 10.4 | P2 |
| 1311 | `Setlist` | `Tour Diary` | HV_WORLD_DATA 10.4 | P2 |
| 1311 | ` ballads heard. Ballads you have not heard yet stay silent.` | ` entries read. Entries you have not reached yet stay sealed.` | HV_WORLD_DATA 10.4 | P2 |
| 1319 | `Ballad ` | `Entry ` (both branches) | HV_WORLD_DATA 10.4 | P2 |
| 1319 | `. Hear again.` | `. Read again.` | HV_WORLD_DATA 10.4 | P2 |
| 1319 | `: not heard yet.` | `: not reached yet.` | HV_WORLD_DATA 10.4 | P2 |
| 1320 | `Hear again` | `Read again` | HV_WORLD_DATA 10.4 | P2 |
| 1320 | `Unheard` | `Sealed` | HV_WORLD_DATA 10.4 | P2 |
| 1322 | `You have not heard this ballad yet. Play on to find it.` | `You have not reached this entry yet. Keep touring to find it.` | HV_WORLD_DATA 10.4 | P2 |
| 1329 | `Stray Ballads` | `Loose Entries` | HV_WORLD_DATA 10.4 | P2 |
| 1330 | `No ballads yet.` | `No entries yet.` | HV_WORLD_DATA 10.4 | P2 |
| 1376 | `Verse ` | `Act ` | HV_WORLD_DATA 10.5 | P2 |
| 1382 | `. Defeated ` | `. Won over ` | HV_WORLD_DATA 10.5 | P2 |
| 1389 | `The bestiary is blank. Meet a creature in a fight to record it here.` | `Nobody in the Who's Who yet. Meet a creature in a fight to add it here.` | HV_WORLD_DATA 10.5 | P2 |
| 1402 | `Verse ` | `Act ` | HV_WORLD_DATA 10.5 | P2 |
| 1403 | `cap(tg)` | `TAG_LABEL[tg]`: spirit `Sprite`, beast `Critter`, folk `Showbiz`, undead `Faded`, construct `Gadget`, insect `Bug`, avian `Bird`, aquatic `Seaside`, void `Glossy` | HV_ENEMIES 8 | P2 |
| 1405 | `A shape in the silence. Meet this creature in a fight and its echo will be kept here.` | `A shape behind the Gloss. Meet this creature in a fight and its photo goes on the wall.` | HV_WORLD_DATA 10.5 | P2 |
| 1406 | `HP at Trial 0` | `HP with no encore` | HV_WORLD_DATA 10.5 | P2 |
| 1418 | `Nothing recorded yet.` | `Nothing on the wall yet.` | HV_WORLD_DATA 10.5 | P2 |
| 1442 | `No journeys yet` | `No tours yet` | HV_WORLD_DATA 10.6 | P2 |
| 1442 | `Finish a journey, win or lose, and it will be remembered here: the heroes, the score, how far you got.` | `Finish a tour, win or lose, and it will be remembered here: the heroes, the score, how far you got.` | HV_WORLD_DATA 10.6 | P2 |
| 1448 | `journeys begun` | `tours started` | HV_WORLD_DATA 10.6 | P2 |
| 1454 | `Fallen` | `Curtain fell` | HV_WORLD_DATA 10.6 | P2 |
| 1455 | `Verse ` | `Act ` | HV_WORLD_DATA 10.6 | P2 |
| 1456 | `, Tempo Trial ` | `, Encore ` | HV_WORLD_DATA 10.6 | P2 |
| 1456 | `, Daily Jam` | `, Daily Duet` | HV_WORLD_DATA 10.6 | P2 |
| 1461 | UI.hanko('T' + r.trial | `UI.hanko('E' + r.trial` (the hanko letter) | HV_WORLD_DATA 10.6 | P2 |
| 1461 | `Tempo Trial ` | `Encore ` | HV_WORLD_DATA 10.6 | P2 |
| 1461 | `Daily Jam` | `Daily Duet` | HV_WORLD_DATA 10.6 | P2 |
| 1462 | ` Chimes` | ` Cheers` | HV_WORLD_DATA 10.6 | P2 |
| 1478 | `The Hall of Echoes` | `The Tour Bus` | HV_WORLD_DATA 10.1 | P2 |
| 1478 | `Chimes` | `Cheers` (aria label) | HV_WORLD_DATA 10.1 | P2 |
| 1537 | `Unlocks, achievements, history, the bestiary and your saved journey will be erased. Your settings stay.` | `Unlocks, stickers, past tours, the Who's Who and your saved tour will be erased. Your settings stay.` | HV_WORLD_DATA 11 | P2 |
| 1538 | `Really erase every echo?` | `Really clear out the whole van?` | HV_WORLD_DATA 11 | P2 |
| 1538 | `This cannot be undone. Every Chime and every verse you have heard will be gone.` | `This cannot be undone. All your Cheers and every diary entry you have read will be gone.` | HV_WORLD_DATA 11 | P2 |
| 1544 | `All is quiet again` | `Back to the very first soundcheck` | HV_WORLD_DATA 11 | P2 |
| 1572 | `The fox sang the grove awake, note by note.` | `A soft note, a late kick, and the whole street starts to sing along.` | HV_WORLD_DATA 11 | P2 |
| 1583 | `Leave the journey from the title screen to clear it` | `Leave the tour from the title screen to clear it` | HV_WORLD_DATA 11 | P2 |
| 1584 | `Erases unlocks, history and your saved journey. Asks twice.` | `Erases unlocks, stickers, past tours and your saved tour. Asks twice.` | HV_WORLD_DATA 11 | P2 |
| 1586 | `Try it: the row shakes as you drag` | `Try it: this line shakes as you drag` | HV_WORLD_DATA 11 | P2 |
| 1591 | `Short tips during your first journey` | `Short tips during your first tour` | HV_WORLD_DATA 11 | P2 |
| 1699 | `3 verses, 3 bosses` | `3 acts, 3 headliners` | new (How to Play diagram label) | P2 |
| 1736 | `wake, then walk` | `unmute, then walk` | new (diagram label) | P2 |
| 1769 | `FRONT` | `LEAD` (diagram) | bible 5.2 | P2 |
| 1769 | `BACK` | `BACKING` | bible 5.2 | P2 |
| 1773 | ` prefers ` | ` prefers the lead` (or ` prefers backing`; the diagram printed the id) | new | P2 |
| 1831 | `Energy` | `Breath` (diagram) | bible 4.10 | P2 |
| 1864 | `Heavy` | `Big hit` (intent legend) | bible 4.10 | P2 |
| 1864 | `Defend` | `Guard` | bible 4.10 | P2 |
| 1864 | `Power up` | `Hype up` | bible 4.10 | P2 |
| 1865 | `Hex` | `Jinx` | bible 4.10 | P2 |
| 1925 | `Tempo Trials 0 to 10; you have opened up to ` | `Encores 0 to 10; you have opened up to ` | HV_WORLD_DATA 12 | P2 |
| 1928 | `Chimes` | `Cheers` | HV_WORLD_DATA 12 | P2 |
| 1928 | `Earned after every journey. Spend them in the Hall of Echoes.` | `Earned after every tour. Spend them on the Tour Bus.` | HV_WORLD_DATA 12 | P2 |
| 1929 | `Tempo Trials` | `Encores` | HV_WORLD_DATA 12 | P2 |
| 1929 | `Win a journey to unlock the next trial. Each one stacks a new rule.` | `Win a tour to unlock the next encore. Each one stacks a new rule.` | HV_WORLD_DATA 12 | P2 |
| 1930 | `Daily Jam` | `Daily Duet` | HV_WORLD_DATA 12 | P2 |
| 1934 | `Swap rows` | `Swap spots` | HV_WORLD_DATA 12 | P2 |
| 1934 | `Song tray` | `Spell tray` | HV_WORLD_DATA 12 | P2 |
| 1936 | /both heroes fall/ | `/both heroes lose their voice/` (HOWTO `book` tip regex) | HV_STORY 4 | P2 |
| 1936 | `A Land Without Sound` | `A World on Mute` | HV_WORLD_DATA 12 | P2 |
| 1936 | `Two heroes, three verses, one silence to break.` | `Two heroes, three acts, one Gloss to sing through.` | HV_WORLD_DATA 12 | P2 |
| 1937 | `You lead two heroes across a grey, still land. A yokai called the Hush has eaten every sound.` | `You lead two heroes across the Soundlands, where real voices are magic. The Gloss has smoothed them all into silence.` | HV_WORLD_DATA 12 | P2 |
| 1938 | `Cross three verses. Each ends with a boss, and the last one guards the Hush itself.` | `Play three acts. Each ends with a headliner, and the last one is the Gloss's own star.` | HV_WORLD_DATA 12 | P2 |
| 1939 | `Every journey is a new one: a different map, different cards, different treasures. Win or lose, you earn Chimes to unlock more.` | `Every tour is a new one: a different map, different cards, different charms. Win or lose, you earn Cheers to unlock more.` | HV_WORLD_DATA 12 | P2 |
| 1940 | /^Waking a hex costs Echo/ | `/^Unmuting a hex costs Vox/` (HOWTO `map` tip regex) | HV_STORY 4 | P2 |
| 1940 | `Wake the Land` | `Unmute the Soundlands` | HV_WORLD_DATA 12 | P2 |
| 1940 | `The land is silent. Your Echo wakes it.` | `The Soundlands are on mute. Your Vox turns them back on.` | HV_WORLD_DATA 12 | P2 |
| 1941 | `Spend 1 Echo to wake a hex next to awake ground. It reveals what waits there: a fight, a shop, a camp, a fable.` | `Spend 1 Vox to unmute a hex next to live ground. It reveals what waits there: a fight, a merch stall, a green room, a detour.` | HV_WORLD_DATA 12 | P2 |
| 1942 | `Tap any awake hex to walk there. Stepping onto a fight or a fable starts it.` | `Tap any live hex to walk there. Stepping onto a fight or a detour starts it.` | HV_WORLD_DATA 12 | P2 |
| 1943 | `Echo comes back from temple bells, wins and camps. One-use Songs wake whole shapes for free.` | `Vox comes back from tea stalls, wins and green rooms. One-use Spells unmute whole shapes for free.` | HV_WORLD_DATA 12 | P2 |
| 1944 | /front hero takes most/ | `/lead hero takes most/` (HOWTO `rows` tip regex) | HV_STORY 4 | P2 |
| 1944 | `Two Heroes, Two Rows` | `Two Heroes, Two Spots` | HV_WORLD_DATA 12 | P2 |
| 1944 | `Who stands in front matters.` | `Who takes the lead matters.` | HV_WORLD_DATA 12 | P2 |
| 1945 | `The front hero takes most attacks. The back hero is safe from most of them.` | `The lead hero takes most attacks. The backing hero is safe from most of them.` | HV_WORLD_DATA 12 | P2 |
| 1946 | `Each hero has a favourite row and a bonus there. Check it on the hero card.` | `Each hero has a favourite spot and a bonus there. Check it on the hero card.` | HV_WORLD_DATA 12 | P2 |
| 1947 | `You get one free swap per turn, more cost 1 Energy. If one hero falls, the other steps forward.` | `You get one free swap per turn, more cost 1 Breath. If one hero loses their voice, the other steps up.` | HV_WORLD_DATA 12 | P2 |
| 1948 | `Energy and Cards` | `Breath and Cards` | HV_WORLD_DATA 12 | P2 |
| 1948 | `Three Energy, five cards, one enemy turn.` | `Three Breath, five cards, one enemy turn.` | HV_WORLD_DATA 12 | P2 |
| 1949 | `Every card belongs to one hero. Play cards with Energy: you have 3 each turn.` | `Every card belongs to one hero. Play cards with Breath: you have 3 each turn.` | HV_WORLD_DATA 12 | P2 |
| 1952 | `The enemy always shows its hand.` | `Every enemy shows what it is about to do.` | HV_WORLD_DATA 12 | P2 |
| 1953 | `The bubble over an enemy tells you what it will do next: hit, block, weaken, summon.` | `The bubble over an enemy tells you what it will do next: hit, block, jinx, summon.` | HV_WORLD_DATA 12 | P2 |
| 1954 | `Statuses stack. Vulnerable takes more damage, Weak deals less, Poison ignores Block.` | `Statuses stack. Exposed takes more damage, Muffled deals less, Earworm ignores Block.` (better: build the three names from `DATA.statuses`) | HV_WORLD_DATA 12 | P2 |
| 1956 | `Cut a gem, change the card.` | `Set a gem, change the card.` | HV_WORLD_DATA 12 | P2 |
| 1957 | `Cards have 0 to 3 slots. A slot takes a gem of its own colour, and a prism slot takes any.` | `Cards have 0 to 3 slots. A slot takes a gem of its own colour, and a rainbow slot takes any.` | HV_WORLD_DATA 12 | P2 |
| 1958 | `Gems add damage, Block, extra hits, cards, Energy and more. The card text changes to match.` | `Gems add damage, Block, extra hits, cards, Breath and more. The card text changes to match.` | HV_WORLD_DATA 12 | P2 |
| 1959 | `Cut gems at camps, forges and shops. Replacing a gem destroys the old one, so choose well.` | `Set gems at green rooms, studios and merch stalls. Replacing a gem loses the old one, so choose well.` | HV_WORLD_DATA 12 | P2 |
| 1960 | /A fable is a choice/ | `/A detour is a choice/` (HOWTO `places` tip regex) | HV_STORY 4 | P2 |
| 1960 | `Camps, Shops and Fables` | `Green Rooms, Stalls and Detours` | HV_WORLD_DATA 12 | P2 |
| 1961 | `Camps let you rest, sharpen a card, cut gems or meditate for Echo. Peddlers sell cards, gems, treasures and card removal.` | `Green rooms let you rest, rehearse a card, set gems or warm up. Jordan's merch stalls sell cards, gems and charms, and declutter your deck.` | HV_WORLD_DATA 12 | P2 |
| 1962 | `Fables are choices with a safe way, a gamble and often a price. Treasures bend the rules for the whole journey.` | `Detours are choices with a safe way, a gamble and often a price. Charms bend the rules for the whole tour.` | HV_WORLD_DATA 12 | P2 |
| 1963 | `Champions guard treasure, the forge upgrades a card, and a gem cache lets you pick one gem.` | `Rivals guard charms, the studio upgrades a card, and a sparkle booth lets you pick one gem.` | HV_WORLD_DATA 12 | P2 |
| 1964 | `After the Journey` | `After the Tour` | HV_WORLD_DATA 12 | P2 |
| 1964 | `Every journey leaves something behind.` | `Every tour leaves something behind.` | HV_WORLD_DATA 12 | P2 |
| 1965 | `You earn Chimes after every journey. Spend them in the Hall of Echoes on new cards, treasures and gems.` | `You earn Cheers after every tour. Spend them on the Tour Bus on new cards, charms and gems.` | HV_WORLD_DATA 12 | P2 |
| 1966 | `Win a journey to open Tempo Trials, stackable challenges. The Daily Jam is the same seed for everyone.` | `Win a tour to open Encores, stackable challenges. The Daily Duet is the same seed for everyone.` | HV_WORLD_DATA 12 | P2 |
| 2007 | `Liner note` | `Jordan's tip` | bible 5.1 | P2 |
| 2089 | `No journey is underway.` | `No tour is on the road.` | bible 5.3 | P2 |
| 2094 | `Your journey` | `Your tour` | bible 5.3 | P2 |
| 2095 | `Verse ` | `Act ` | bible 4.1 | P2 |
| 2095 | `Tempo Trial ` | `Encore ` | bible 4.1 | P2 |
| 2095 | `Daily Jam` | `Daily Duet` | bible 4.1 | P2 |
| 2098 | `Treasures` | `Charms` | bible 5.3 | P2 |
| 2098 | `No treasures yet` | `No charms yet` | bible 5.3 | P2 |
| 2107 | `Treasures` | `Charms` | bible 5.3 | P2 |
| 2107 | ` treasures` | ` charms` | bible 5.3 | P2 |
| 2115 | `Abandon journey` | `Abandon tour` | bible 5.3 | P2 |
| 2127 | `A note from the road` | `A tip from Jordan` | bible 5.3 | P2 |
| 2144 | `Your journey is saved. See you at the next beat.` | `Your tour is saved. See you at the next beat.` | bible 4.1 | P2 |
| 2151 | `The journey cannot be abandoned right now` | `The tour cannot be abandoned right now` | bible 4.1 | P2 |

### 2.9 `js/screen_node.js` (P2 2D)

| line | Echowake literal | Hocus Vocus literal | source | phase |
|---|---|---|---|---|
| 285 | `No journey is underway` | `No tour is on the road` | bible 5.3 | P2 |
| 285 | `There is no journey to show here.` | `There is no tour to show here.` | bible 5.6 | P2 |
| 314 | `Treasures` | `Charms` | bible 4.1 | P2 |
| 316 | `Treasures` | `Charms` | bible 4.1 | P2 |
| 365 | `Sharpen a card` | `Rehearse a card` | bible 4.1 | P2 |
| 366 | `Sharpen it` | `Rehearse it` | bible 4.1 | P2 |
| 368 | `It is torn out of your deck for good.` | `It leaves your deck for good.` | new (no paper words, bible 6.3) | P2 |
| 436 | `That choice can wait: the journey goes on without it.` | `That choice can wait: the tour goes on without it.` | bible 4.1 | P2 |
| 460 | `The forge has done its work for today.` | `The studio has done its work for today.` | bible 4.1 | P2 |
| 460 | `The fire has burned low.` | `No more breaks in this green room.` | new | P2 |
| 462 | `Prism` | `Rainbow` | bible 4.1 | P2 |
| 594 | `Nothing left to sharpen.` | `Nothing left to rehearse.` | bible 4.1 | P2 |
| 594 | `No cards to cut gems into.` | `No cards to set gems into.` | bible 4.1 | P2 |
| 611 | `Already sharpened.` | `Already rehearsed.` | bible 4.1 | P2 |
| 626 | `Choose a card to sharpen. You will see the result before you commit.` | `Choose a card to rehearse. You will see the result before you commit.` | bible 4.1 | P2 |
| 635 | ` sharpened` | ` rehearsed` | bible 4.1 | P2 |
| 648 | `It is torn out of your deck for good.` | `It leaves your deck for good.` | new | P2 |
| 675 | `Sharpen this card` | `Rehearse this card` | bible 4.1 | P2 |
| 695 | ` and prism sockets only.` | ` and rainbow sockets only.` (both colour words before it through `DATA.COLOUR_NAME`: "is pink: it fits pink and rainbow sockets only.") | bible 4.1 | P2 |
| 751 | ` or prism socket.` | ` or rainbow socket.` (the colour words through `DATA.COLOUR_NAME`) | bible 4.1 | P2 |
| 757 | `The pouch is empty. Chests, caches and peddlers carry gems.` | `The pouch is empty. Gift boxes, sparkle booths and merch stalls carry gems.` | bible 5.6 | P2 |
| 785 | `Sharpen a Card` | `Rehearse a Card` | bible 4.1 | P2 |
| 785 | `Cut Gems` | `Set Gems` | bible 4.1 | P2 |
| 852 | `A Champion Falls` | `A Rival Bows Out` | new (bible 1.3 rule 3) | P2 |
| 852 | `The Guardian Falls` | `The Headliner Bows Out` | new (bible 1.3 rule 3) | P2 |
| 852 | `The Journey Goes On` | `The Tour Goes On` | bible 4.1 | P2 |
| 854 | `The echoes fade. The road is a little safer.` | `The street hums again. The road is a little safer.` | new | P2 |
| 855 | `The champion kneels, and yields what it guarded.` | `The rival takes a bow, and hands over what it guarded.` | new | P2 |
| 856 | `The verse ends on a satisfying final beat.` | `The act ends on a satisfying final beat.` | bible 4.1 | P2 |
| 856 | `A silence breaks, and stays broken.` | `The mute is off, and it stays off.` | new | P2 |
| 857 | `A fable ends the way fables do: with a bill.` | `A detour ends the way detours do: with a souvenir.` | new (no admin words, bible 6.1 H4) | P2 |
| 857 | `The journey goes on, a little richer.` | `The tour goes on, a little richer.` | bible 4.1 | P2 |
| 867 | `Keeper treasure` | `Headliner charm` | HV_WORLD_DATA 14.1 | P2 |
| 867 | ` treasure` | ` charm` (through `RARITY_NAME`: "Merch charm" for `shop`) | HV_WORLD_DATA 14.1 | P2 |
| 961 | ` Falls` | ` Bows Out` ("Kraki Bows Out") | new (bible 1.3 rule 3) | P2 |
| 976 | `Echo` | `Vox` (read `DATA.keywords.ink.name`) | bible 4.1 | P2 |
| 981 | `Song` | `Spell` (both: the fallback name and the kind label) | bible 4.1 | P2 |
| 991 | `The foe left nothing but an echo.` | `The foe left nothing but a squeak.` | bible 4.10 | P2 |
| 1160 | `A treasure guarded here` | `A charm, waiting here` | bible 5.6 | P2 |
| 1171 | `Treasure choices` | `Charm choices` | bible 4.1 | P2 |
| 1182 | `Choose one treasure. The others fade with the verse.` | `Choose one charm. The others fade with the act.` | bible 4.1 | P2 |
| 1204 | `Take the treasure, or leave it.` | `Take the charm, or leave it.` | bible 5.6 | P2 |
| 1222 | `Welcome, welcome! Mind the lanterns, they bite.` | `Fresh merch! I made a sticker of your face. It is very flattering.` (`PEDDLER.hello`; the pool becomes Jordan's) | bible 3.5 | P2 |
| 1222 | `Ah, travellers from the quiet roads! Wares for the weary.` | `Tote bag? It has a picture of a tote bag on it.` | bible 3.5 | P2 |
| 1222 | `Everything here fell off something else. Good as new!` | `Everything here is one of a kind. I made two.` | bible 3.5 | P2 |
| 1222 | `Step closer. The prices are only a little bit frightening.` | `Welcome back! I redesigned everything since you got here.` | new (Jordan, bible 3.5 voice) | P2 |
| 1223 | `Excellent taste! Terrible for my stock, wonderful for my purse.` | `Great choice. I drew that one on the bus.` (`PEDDLER.buy`) | new (Jordan) | P2 |
| 1223 | `Sold! I will wrap it in a tune, free of charge.` | `Sold! Want it in a tote bag? It is a very good tote bag.` | new (Jordan) | P2 |
| 1223 | `A fine choice. I was sad to see it go. Only slightly.` | `You have excellent taste. I would know, I designed it.` | new (Jordan) | P2 |
| 1223 | `Ha! The land will thank you. I will thank your gold.` | `That one suits you. Everything suits you, but that one most.` | new (Jordan) | P2 |
| 1224 | `Ah... the purse is a little thin, friend.` | `Not quite enough gold. I will keep it warm for you.` (`PEDDLER.poor`) | new (Jordan) | P2 |
| 1224 | `Come back with more gold and fewer regrets.` | `So close! Come back with a few more coins.` | new (Jordan) | P2 |
| 1224 | `I do not take IOUs. The Hush eats those.` | `Gold first, then merch. Those are my only rules.` | new (Jordan) | P2 |
| 1224 | `Almost! Almost is a lovely word, but it does not spend.` | `Almost! Almost is a lovely word, but it does not buy stickers.` | new (Jordan) | P2 |
| 1225 | `That one is gone. Ask the ghost who bought it.` | `That one is gone. I am already drawing a new one.` (`PEDDLER.sold`; the second line stays) | new (Jordan) | P2 |
| 1226 | `Burn it, bury it, forget it. A satisfied customer!` | `Gone! Your deck feels lighter already.` (`PEDDLER.remove`) | new (Jordan) | P2 |
| 1226 | `Gone. As if it never made a sound.` | `Decluttered. I might put it on a sticker.` | new (Jordan) | P2 |
| 1227 | `Free gem cutting! Do not tell the other stalls.` | `Free gem setting! Do not tell the other stalls.` (`PEDDLER.cut`; the second line stays) | bible 5.6 | P2 |
| 1228 | `You have cleaned me out! Take a bow. I will take a nap.` | `You have cleaned me out! Time to draw more merch.` | new (Jordan) | P2 |
| 1229 | `Come again! I will be here. Probably. The Hush is closing in.` | `Come again! I will have new designs by then.` (`PEDDLER.leave`; the third line stays) | new (Jordan) | P2 |
| 1229 | `Safe roads, traveller. Mind the silence.` | `Safe travels! Wear the merch with pride.` | new (Jordan) | P2 |
| 1230 | `A relic is forever. A card is a mood.` | `A charm is forever. A card is a mood.` (`PEDDLER.idle`; the other four idle lines stay) | bible 4.1 | P2 |
| 1230 | `Do you hear that? That is the sound of discounts.` | `Do you hear that? That is the sound of new merch.` | new (Jordan) | P2 |
| 1263 | `The Peddler` | `Jordan's Merch Stall` | bible 5.6 | P2 |
| 1288 | `Gems, treasures and services` | `Gems, charms and services` | bible 4.1 | P2 |
| 1348 | `Tier ` | `Tier ` (the gem plaque: `cap(g.color)` becomes the `DATA.COLOUR_NAME` word plus ` gem`: "Tier 2 pink gem") | HV_WORLD_DATA 10.2 | P2 |
| 1349 | `Rare find` | `Merch charm` (rarity `shop`) | HV_WORLD_DATA 14.1 | P2 |
| 1349 | `Keeper treasure` | `Headliner charm` | HV_WORLD_DATA 14.1 | P2 |
| 1349 | `Keeper` | `Headliner` (tip bubble; `cap(d.rarity)` through `RARITY_NAME`) | HV_WORLD_DATA 14.1 | P2 |
| 1350 | `Song` | `Spell` | bible 4.1 | P2 |
| 1354 | `Card removal, ` | `Declutter, ` (aria label) | bible 4.1 | P2 |
| 1354 | `Card removal` | `Declutter` (plaque name) | bible 4.1 | P2 |
| 1356 | `Card removal` | `Declutter` | bible 4.1 | P2 |
| 1356 | `Burn one card from your deck for good. Every removal costs ` | `Remove a card from your deck for good. Every declutter costs ` | bible 4.1 (sub line) | P2 |
| 1357 | `Cut gems, free` | `Set gems, free` | bible 5.6 | P2 |
| 1357 | `Cut gems` | `Set gems` | bible 5.6 | P2 |
| 1359 | `Cut gems` | `Set gems` | bible 5.6 | P2 |
| 1369 | `The stall is bare. Nothing to sell today.` | `The stall is bare. Jordan is restocking.` | bible 5.6 | P2 |
| 1383 | `Card removal, ` | `Declutter, ` | bible 4.1 | P2 |
| 1418 | `You already own that treasure.` | `You already own that charm.` | bible 4.1 | P2 |
| 1419 | `The peddler shakes his head.` | `Jordan shakes his head.` | bible 3.5 | P2 |
| 1448 | `The peddler burns it for good. The price goes up by ` | `Jordan takes it off your hands for good. The price goes up by ` | HV_PHASES P2 2D (suggested) | P2 |
| 1471 | `Cut Gems (free)` | `Set Gems (free)` | bible 5.6 | P2 |
| 1479 | `The peddler's stall. You have ` | `Jordan's merch stall. You have ` | bible 5.6 | P2 |
| 1506 | ` Echo` | ` Vox` | bible 4.1 | P2 |
| 1519 | `The land wakes` | `The sound comes back` | bible 4.9 | P2 |
| 1609 | `A Lost Fable` | `A Lost Detour` | bible 4.1 | P2 |
| 1613 | `Fable` | `Detour` (the seal: read `DATA.tiles.event.name`) | bible 4.4 | P2 |
| 1638 | `Only silence. The fable slipped away before it could be heard.` | `Nothing here. The detour wandered off before you arrived.` | new | P2 |
| 1640 | `Play on` | `On we go` | bible 5.6 | P2 |
| 1664 | `The journey has already moved on.` | `The tour has already moved on.` | bible 4.1 | P2 |
| 1757 | `Mend by the fire` | `Put your feet up` | bible 4.1 | P2 |
| 1758 | `Sharpen` | `Rehearse` | bible 4.1 | P2 |
| 1759 | `Cut Gems` | `Set Gems` | bible 4.1 | P2 |
| 1760 | `Meditate` | `Warm Up` | bible 4.1 | P2 |
| 1760 | `Echo and a Song` | `Vox and a Spell` | bible 4.1 | P2 |
| 1786 | `The Campfire` | `The Green Room` (`'The ' + DATA.tiles.camp.name`) | bible 4.4 | P2 |
| 1786 | `One fire, one moment of peace. Use it well.` | `Five minutes backstage. Use them well.` | new | P2 |
| 1789 | `Camp actions` | `Green room actions` | bible 4.1 | P2 |
| 1791 | `Break camp` | `Back on the road` | bible 5.6 | P2 |
| 1805 | `Chests, caches and peddlers carry them.` | `Gift boxes, sparkle booths and merch stalls carry them.` | bible 5.6 | P2 |
| 1805 | `You carry no gems to cut.` | `You carry no gems to set.` | bible 4.1 | P2 |
| 1807 | `The fire has burned low: no actions left.` | `The break is over: no actions left.` | new | P2 |
| 1808 | `Cut more: still open this visit.` | `Set more: still open this visit.` | bible 4.1 | P2 |
| 1811 | `Gain Echo and a Song.` | `Gain Vox and a Spell.` | bible 4.1 | P2 |
| 1811 | `The fire has burned low: no actions left.` | `The break is over: no actions left.` | new | P2 |
| 1819 | ` can be sharpened.` | ` can be rehearsed.` | bible 4.1 | P2 |
| 1819 | `Every card is already sharp.` | `Every card is already rehearsed.` | bible 4.1 | P2 |
| 1819 | `Nothing left to sharpen.` | `Nothing left to rehearse.` | bible 4.1 | P2 |
| 1822 | ` Echo (` | ` Vox (` | bible 4.1 | P2 |
| 1822 | `Echo is already full.` | `Vox is already full.` | bible 4.1 | P2 |
| 1822 | `+ one random Song` | `+ one random Spell` | bible 4.1 | P2 |
| 1845 | `EMBERS` | `CLOSED` (locked action badge) | new | P2 |
| 1852 | ` left by the fire` | ` left in the green room` | new | P2 |
| 1852 | `The fire has burned low` | `The break is over` | new | P2 |
| 1869 | `The fire will not take you in.` | `The green room is not ready for you.` | new | P2 |
| 1883 | `The mind will not settle.` | `Your voice will not warm up right now.` | new | P2 |
| 1889 | ` Echo` | ` Vox` | bible 4.1 | P2 |
| 1889 | `Echo is full` | `Vox is full` | bible 4.1 | P2 |
| 1889 | ` and the ` | ` and ` | new (Spell names take no article) | P2 |
| 1893 | `Sharpen a Card` | `Rehearse a Card` | bible 4.1 | P2 |
| 1893 | `Sharpen it by the fire` | `Rehearse it backstage` | new | P2 |
| 1893 | `The whetstone rings. The card comes back keener.` | `One more take. The card comes back sharper.` | new | P2 |
| 1896 | `That card cannot be sharpened.` | `That card cannot be rehearsed.` | bible 4.1 | P2 |
| 1910 | `Cut Gems` | `Set Gems` | bible 4.1 | P2 |
| 1921 | `Leave without resting?` | `Leave without a break?` | bible 5.6 | P2 |
| 1924 | `Break camp` | `Back on the road` | bible 5.6 | P2 |
| 1930 | `The campfire. ` | `The green room. ` | bible 4.1 | P2 |
| 1944 | `Sharpened!` | `Rehearsed!` | bible 4.1 | P2 |
| 1964 | `One good blow, or a jeweller's patience. Not both.` | `One great take, or a jeweller's patience. Not both.` | new | P2 |
| 1966 | `Forge actions` | `Studio actions` | bible 4.1 | P2 |
| 1972 | `Sharpen a Card` | `Rehearse a Card` | bible 4.1 | P2 |
| 1972 | `Bring one card to the anvil. One blow, one upgrade.` | `Bring one card to the mic. One take, one upgrade.` | new | P2 |
| 1973 | `Cut Gems` | `Set Gems` | bible 4.1 | P2 |
| 1983 | `Leave the forge` | `Leave the studio` | bible 5.6 | P2 |
| 1990 | `You chose gem cutting. One upgrade or gems, not both.` | `You chose gem setting. One upgrade or gems, not both.` | bible 4.1 | P2 |
| 1990 | `The forge has done its work today.` | `The studio has done its work today.` | bible 4.1 | P2 |
| 1990 | `Nothing left to sharpen.` | `Nothing left to rehearse.` | bible 4.1 | P2 |
| 1992 | `One upgrade or gem cutting, not both.` | `One upgrade or gem setting, not both.` | bible 4.1 | P2 |
| 1992 | `You carry no gems to cut.` | `You carry no gems to set.` | bible 4.1 | P2 |
| 1995 | `Every card is already sharp.` | `Every card is already rehearsed.` | bible 4.1 | P2 |
| 1995 | `Bring one card to the anvil. One blow, one upgrade.` | `Bring one card to the mic. One take, one upgrade.` | new | P2 |
| 1996 | `The gems are cutting. Keep going, or leave.` | `The gems are setting. Keep going, or leave.` | bible 4.1 | P2 |
| 1997 | `The forge has cooled. Its work is done.` | `The ON AIR light is off. Its work is done.` | new (bible 4.4 stamp) | P2 |
| 2006 | `Choose a Card for the Anvil` | `Choose a Card for the Mic` | new | P2 |
| 2006 | `Bring it to the anvil` | `Bring it to the mic` | new | P2 |
| 2006 | `One blow. The card comes back keener.` | `One take. The card comes back sharper.` | new | P2 |
| 2023 | `Strike!` | `Hit it!` | bible 5.6 | P2 |
| 2030 | `Strike the anvil and the card comes back sharpened.` | `Hit it and the card comes back rehearsed.` | new | P2 |
| 2049 | `The anvil rings, but nothing changes.` | `The take is fine, but nothing changes.` | new | P2 |
| 2058 | ` is sharpened.` | ` is rehearsed.` | bible 4.1 | P2 |
| 2076 | `Cut Gems at the Forge` | `Set Gems at the Studio` | bible 4.1 | P2 |
| 2079 | `The gems are set. Cut more, or leave.` | `The gems are set. Set more, or leave.` | bible 4.1 | P2 |
| 2109 | `A Treasure Chest` | `A Gift Box` | bible 4.4 | P2 |
| 2109 | `Already opened. Only dust remains.` | `Already opened. Only ribbon remains.` | new | P2 |
| 2111 | `Open the chest` | `Open the gift` | bible 5.6 | P2 |
| 2112 | `Open the chest` | `Open the gift` | bible 5.6 | P2 |
| 2144 | `The chest will not give that up.` | `The gift box will not give that up.` | bible 4.1 | P2 |
| 2158 | `The chest is empty.` | `The gift box is empty.` | bible 4.1 | P2 |
| 2178 | `Take the treasure` | `Take the charm` | bible 5.6 | P2 |
| 2185 | `Tier ` | `Tier ` (the same colour word: "Tier 1 blue gem") | HV_WORLD_DATA 10.2 | P2 |
| 2204 | `The chest is empty. Whatever it held is yours now.` | `The gift box is empty. Whatever it held is yours now.` | bible 4.1 | P2 |
| 2206 | `An empty chest.` | `An empty gift box.` | bible 4.1 | P2 |
| 2206 | `A treasure chest. Open it.` | `A gift box. Open it.` | bible 4.1 | P2 |
| 2239 | `The Gem Cache` | `The Sparkle Booth` | bible 4.4 | P2 |
| 2239 | `The hollow is empty now.` | `The booth is empty now.` | new | P2 |
| 2239 | `Three gems glint in the dark. Only one will come with you.` | `Three gems sparkle on the counter. Only one will come with you.` | new | P2 |
| 2255 | ` or prism socket yet.` | ` or rainbow socket yet.` (`f.color` through `DATA.COLOUR_NAME`) | bible 4.1 | P2 |
| 2273 | `The cache will not give it up.` | `The booth will not give it up.` | bible 4.1 | P2 |
| 2298 | `cap(g.color` | `cap(DATA.COLOUR_NAME[g.color])` ("Pink") | HV_WORLD_DATA 10.2 | P2 |
| 2304 | `You already took a gem from this cache.` | `You already took a gem from this booth.` | bible 4.1 | P2 |
| 2304 | `The cache holds nothing you can use.` | `The booth holds nothing you can use.` | bible 4.1 | P2 |
| 2310 | `An empty cache.` | `An empty booth.` | bible 4.1 | P2 |
| 2310 | `A gem cache. Choose one of three gems.` | `A sparkle booth. Choose one of three gems.` | bible 4.1 | P2 |

### 2.10 `js/screen_combat.js` (P2 2E)

| line | Echowake literal | Hocus Vocus literal | source | phase |
|---|---|---|---|---|
| 102 | `Not enough Energy` | `Not enough Breath` | bible 4.10 | P2 |
| 105 | `exhaust` | `fade` (`PICK_VERB.exhaust`: "Choose a card to fade") | bible 4.2 | P2 |
| 106 | `Heavy blow` | `Big hit` | bible 4.10 | P2 |
| 106 | `Power up` | `Hype up` | bible 4.10 | P2 |
| 106 | `Curse` | `Jinx` | bible 4.10 | P2 |
| 337 | `Thorns ` | `DATA.statuses.thorns.name + ' '` (Feedback) | hard-coded DATA name | P2 |
| 338 | `Regen ` | `DATA.statuses.regen.name + ' '` (Warm Tea) | hard-coded DATA name | P2 |
| 363 | ` is stunned and loses its action.` | ` is starstruck and loses its action.` | bible 4.3 | P2 |
| 367 | `, a killing blow` | `, a finishing blow` | new (bible 1.3 rule 3) | P2 |
| 372 | ` is down.` | ` is voiceless.` | bible 4.2 | P2 |
| 373 | ` stands up with ` | ` finds their voice again with ` | new | P2 |
| 375 | ` steps to the front, ` | ` takes the lead, ` | bible 4.1 | P2 |
| 375 | ` to the back.` | ` moves to backing.` | bible 4.1 | P2 |
| 391 | ` is down` | ` is voiceless` | bible 4.2 | P2 |
| 392 | ` is stunned` | ` is starstruck` | bible 4.3 | P2 |
| 711 | `Down. Their cards are dead until the fight is won.` | `Voiceless. Their cards clog your hand until the fight is won.` | bible 4.2 | P2 |
| 721 | `FRONT` | `LEAD` | bible 4.10 | P2 |
| 729 | `FALLEN` | `VOICELESS` | bible 4.10 | P2 |
| 746 | `FRONT` | `LEAD` | bible 4.10 | P2 |
| 746 | `BACK` | `BACKING` | bible 4.10 | P2 |
| 755 | `front row` | `the lead` (aria) | bible 4.1 | P2 |
| 755 | `back row` | `backing` | bible 4.1 | P2 |
| 755 | `down` | `voiceless` | bible 4.2 | P2 |
| 760 | `Swap rows` | `Swap spots` | bible 4.1 | P2 |
| 768 | `Swap rows` | `Swap spots` | bible 4.1 | P2 |
| 769 | `Bound: neither hero can swap while a hero has Bind.` | `Tangled: neither hero can swap while a hero is Tangled.` | bible 4.10 | P2 |
| 780 | ` Energy` | ` Breath` | bible 4.10 | P2 |
| 784 | `Bound: the heroes cannot swap rows` | `Tangled: the heroes cannot swap spots` | bible 4.10 | P2 |
| 786 | `Not enough Energy to swap` | `Not enough Breath to swap` | bible 4.10 | P2 |
| 794 | `Swap rows, ` | `Swap spots, ` | bible 4.1 | P2 |
| 794 | ` Energy` | ` Breath` | bible 4.10 | P2 |
| 794 | `, bound` | `, tangled` | bible 4.3 | P2 |
| 820 | `Keeper` | `Headliner` (and `cap(u.tier)` through `TIER_NAME`: Sidekick, Creature, Rival) | bible 4.10 | P2 |
| 824 | `Stunned: it loses its next action.` | `Starstruck: it loses its next action.` | bible 4.10 | P2 |
| 830 | `A Taunt is pulling this attack.` | `A Spotlight is pulling this attack.` | bible 4.10 | P2 |
| 909 | `STUN` | `WOW` | bible 4.10 | P2 |
| 933 | `stunned` | `starstruck` (aria `X intends: starstruck`) | bible 4.3 | P2 |
| 1169 | `Exhausted, ` | `Faded, ` | bible 4.2 | P2 |
| 1175 | `Energy` | `Breath` | bible 4.10 | P2 |
| 1177 | `Energy` | `Breath` | bible 4.10 | P2 |
| 1177 | `Spend Energy to play cards. It refills every turn and never carries over.` | `Spend Breath to play cards. It refills every turn and never carries over.` | bible 4.10 | P2 |
| 1191 | `Energy ` | `Breath ` | bible 4.10 | P2 |
| 1426 | `Bound: the heroes cannot swap rows` | `Tangled: the heroes cannot swap spots` | bible 4.10 | P2 |
| 1426 | `Not enough Energy to swap` | `Not enough Breath to swap` | bible 4.10 | P2 |
| 1947 | `the exhaust pile` | `the faded pile` | HV_PHASES P1 1A | P2 |
| 1963 | `Exhausted` | `Faded` | HV_PHASES P1 1A | P2 |
| 2018 | `Defeat. Both heroes have fallen.` | `Defeat. Both heroes have lost their voices.` | bible 1.3 | P2 |
| 2123 | `Treasures` | `Charms` | bible 4.1 | P2 |
| 2132 | ` more treasures` | ` more charms` | bible 4.1 | P2 |
| 2183 | `Exhausted` | `Faded` | HV_PHASES P1 1A | P2 |
| 2203 | `Keeper: ` | `Headliner: ` | bible 4.10 | P2 |
| 2203 | `Champion: ` | `Rival: ` | bible 4.10 | P2 |
| 2205 | `KEEPER` | `HEADLINER` | bible 4.10 | P2 |
| 2209 | `KEEPER` | `HEADLINER` | bible 4.10 | P2 |
| 2209 | `CHAMPION` | `RIVAL` | bible 4.10 | P2 |

### 2.11 `js/screen_end.js` (P2 2E)

| line | Echowake literal | Hocus Vocus literal | source | phase |
|---|---|---|---|---|
| 88 | `INTRO` | `CURTAIN UP` | HV_STORY 3.4 | P2 |
| 89 | `VERSE ` | `ACT ` (`ACT ONE`) | HV_STORY 3.4 | P2 |
| 90 | `VERSE ` | `END OF ACT ` | HV_STORY 3.4 | P2 |
| 90 | ` COMPLETE` | `` (dropped: `END OF ACT ONE`) | HV_STORY 3.4 | P2 |
| 91 | `OUTRO` | `FINALE` | HV_STORY 3.4 | P2 |
| 91 | `END` | `BRAVO` | HV_STORY 3.4 | P2 |
| 92 | `INTERLUDE` | `INTERMISSION` | HV_STORY 3.4 | P2 |
| 92 | `REST` | `PAUSE` | HV_STORY 3.4 | P2 |
| 93 | `A VOICE OF THE SONG` | `MEET THE CREW` | HV_STORY 3.4 | P2 |
| 94 | `A BALLAD` | `A DIARY ENTRY` | HV_STORY 3.4 | P2 |
| 348 | `Only silence` | `Nothing here yet` | new | P2 |
| 349 | `There is no journey to show here.` | `There is no tour to show here.` | bible 5.6 | P2 |
| 442 | `A Silent Ballad` | `A Diary Entry` | new (HV_STORY 3.1) | P2 |
| 443 | `Nothing has been sung here yet. Play on, and the journey goes on.` | `Nothing here yet. On we go, and the tour goes on.` | HV_STORY 3.1 | P2 |
| 463 | `Play on` | `On we go` | HV_STORY 3.4 | P2 |
| 466 | `Tap to listen on` | `Tap to continue` | HV_STORY 3.4 | P2 |
| 514 | `Verses cleared` | `Acts cleared` | bible 4.1 | P2 |
| 515 | `Bosses felled` | `Headliners won over` | new (bible 1.3) | P2 |
| 516 | `Elites defeated` | `Rivals defeated` | bible 4.1 | P2 |
| 517 | `Gold in the purse` | `Gold in your pocket` | new | P2 |
| 524 | `Cards sharpened` | `Cards rehearsed` | bible 4.1 | P2 |
| 533 | `The land's mercy` | `Kind passers-by` | new (bible 4.9 mercy line) | P2 |
| 556 | `Daily Jam ` | `Daily Duet ` | bible 5.4 | P2 |
| 556 | `Tempo Trial ` | `Encore ` | bible 5.4 | P2 |
| 556 | `Tempo Trial 0` | `Encore 0` | HV_PHASES P2 2E | P2 |
| 557 | `ECHOWAKE: ` | `HOCUS VOCUS: ` | bible 5.4 | P2 |
| 557 | `the Hush let go` | `still human` | bible 5.4 | P2 |
| 557 | `a rest in Verse ` | `intermission in Act ` | bible 5.4 | P2 |
| 559 | `treasure` | `charm` (`U.plural` noun) | bible 4.1 | P2 |
| 559 | `verse` | `act` (`U.plural` noun: "2 acts cleared") | bible 4.1 | P2 |
| 567 | ` joins the band` | ` joins the tour!` | bible 5.4 | P2 |
| 567 | `. Choose X when you begin a new journey.` | `. Waiting on the hero select.` | bible 5.4 | P2 |
| 573 | `TRIAL` | `ENCORE` (seal) | bible 5.4 | P2 |
| 573 | `Tempo Trial ` | `Encore ` | bible 5.4 | P2 |
| 573 | `A faster tempo of the same journey is waiting on the hero select.` | `A harder encore of the same tour is waiting on the hero select.` | new | P2 |
| 705 | `Verse ` | `End of Act ` (fallback title: "End of Act I") | new | P2 |
| 705 | ` Complete` | `` (dropped) | new | P2 |
| 708 | `VERSE ` | `END OF ACT ` | HV_STORY 3.4 | P2 |
| 708 | ` COMPLETE` | `` (dropped) | HV_STORY 3.4 | P2 |
| 711 | `, falls silent` | `, sings along` | new (bible 1.3 rule 4) | P2 |
| 714 | ` joins the band` | ` joins the tour!` | bible 5.4 | P2 |
| 716 | ` joins the band` | ` joins the tour!` | bible 5.4 | P2 |
| 724 | `The music swells. Whatever held this verse silent has let go.` | `The music swells. The Gloss has let go of this act.` | new | P2 |
| 725 | `The Land Sings` | `The Soundlands Sing` | new | P2 |
| 738 | `The Journey So Far` | `The Tour So Far` | bible 4.1 | P2 |
| 764 | `Treasures carried` | `Charms carried` | bible 4.1 | P2 |
| 769 | `What the Land Gives` | `What the Soundlands Give` | new | P2 |
| 770 | `Treasures ` | `Charms ` | bible 4.1 | P2 |
| 782 | `Verse ` | `Act ` | bible 4.1 | P2 |
| 844 | `The deck was not kept with this journey` | `The deck was not kept with this tour` | bible 4.1 | P2 |
| 846 | `Treasures` | `Charms` | bible 5.4 | P2 |
| 849 | `No treasures` | `No charms` | bible 5.4 | P2 |
| 850 | `Treasures ` | `Charms ` | bible 5.4 | P2 |
| 850 | `No treasures were found on this journey` | `No charms were found on this tour` | bible 5.4 | P2 |
| 853 | `What You Carried` | `What Was in the Van` | bible 5.4 | P2 |
| 880 | `THE SONG FADES` | `THE LIGHTS GO DOWN` | HV_STORY 3.4 | P2 |
| 881 | `The Hush Returns` | `The Show Must Go On` | HV_STORY 3.4 | P2 |
| 882 | `Fell in Verse ` | `Curtain fell in Act ` | HV_STORY 3.4 | P2 |
| 882 | `  \|  Tempo Trial ` | `  \|  Encore ` | bible 5.4 | P2 |
| 882 | `  \|  Daily Jam` | `  \|  Daily Duet` | bible 5.4 | P2 |
| 890 | `The echoes thinned, and the land went still. Breathe, and try again.` | `The lights went down, and the Soundlands went quiet. Breathe, and try again.` | HV_STORY 3.4 | P2 |
| 907 | `Chimes earned` | `Cheers earned` | bible 5.4 | P2 |
| 911 | `Achievement bonus +` | `Sticker bonus +` | bible 4.1 | P2 |
| 912 | `Chimes held ` | `Cheers held ` | bible 4.1 | P2 |
| 917 | `Nothing new this time. The next journey might be the one.` | `Nothing new this time. The next tour might be the one.` | bible 5.4 | P2 |
| 920 | `This journey was not recorded, so no Chimes were paid.` | `This tour was not recorded, so no Cheers were given.` | bible 5.4 | P2 |
| 922 | `The Land Remembers` | `The Tour Bus Remembers` | new | P2 |
| 924 | `The music rests. Score ` | `The lights go down. Score ` | new | P2 |
| 946 | `Choose your heroes from the title to begin again` | `Pick your duo from the title to start again` | new (bible 5.2) | P2 |
| 963 | `Hanae sheathed her blade and glanced about to see who had noticed how well that went. Everyone had. She studied the sky.` | `Jasmin hummed the last line once more, very softly, and the whole crowd leaned in to hear it. Her scrunchie had not moved at all.` | HV_STORY 3.5 | P2 |
| 964 | `Kuro pushed up his glasses, tucked his flute under one arm, and began humming the harmony of the next tune. He called it research.` | `RoxorLoops beatboxed the sound of the curtain coming down, the applause and the van door, then took a bow at both ends of his hair.` | HV_STORY 3.5 | P2 |
| 965 | `Suzu tied a new ribbon to the shrine bell and listened. For the first time in a very long while, nothing was out of tune.` | `RawClaw took off his headphones and listened. For the first time in a long while, nothing needed fixing. He added a little reverb anyway.` | HV_STORY 3.5 | P2 |
| 966 | `Raiga laughed so hard the thunder came to see what was funny, then stayed for tea. Nobody asked it to leave.` | `Andy played one last low note so warm that the stage lights hummed along. 'Nice,' he said, and that was the whole speech.` | HV_STORY 3.5 | P2 |
| 1013 | `ECHOWAKE` | `HOCUS VOCUS` (share card; see budgets) | bible 1.2 | P2 |
| 1016 | `THE SONG FADED IN VERSE ` | `INTERMISSION IN ACT ` | bible 5.4 | P2 |
| 1016 | `THE HUSH, LET GO` | `STILL HUMAN` | bible 5.4 | P2 |
| 1032 | `DAILY JAM` | `DAILY DUET` | bible 4.1 | P2 |
| 1032 | `TEMPO TRIAL` | `ENCORE` | bible 4.1 | P2 |
| 1035 | `TREASURES` | `CHARMS` | bible 4.1 | P2 |
| 1051 | `END` | `BRAVO` (share card seal on a win; `FIN` on a loss stays) | HV_STORY 3.4 | P2 |
| 1100 | `The Hush Lets Go` | `Human` | bible 5.4 | P2 |
| 1101 | `The last note rings out, and is left to echo on purpose. The land begins to sing on its own.` | `The whole crowd sings the last line together, and the stage is left open for whoever wants to sing next.` | bible 2.5 | P2 |
| 1105 | `OUTRO` | `FINALE` | HV_STORY 3.4 | P2 |
| 1114 | `Tap to listen on` | `Tap to continue` | HV_STORY 3.4 | P2 |
| 1117 | `END` | `BRAVO` | HV_STORY 3.4 | P2 |
| 1129 | `Every Voice That Ever Sang` | `Everyone Who Sang Along` | HV_STORY 3.4 | P2 |
| 1153 | `END` | `BRAVO` | HV_STORY 3.4 | P2 |
| 1153 | `THE LAST NOTE` | `FINALE` | HV_STORY 3.4 | P2 |
| 1153 | `The Final Chorus` | `Human` | HV_STORY 3.4 | P2 |
| 1178 | `chimes ` | `cheers ` | bible 4.1 | P2 |
| 1180 | `Chimes earned` | `Cheers earned` | bible 5.4 | P2 |
| 1183 | `No new unlocks this time. Spend your Chimes in the Hall of Echoes.` | `No new unlocks this time. Spend your Cheers on the Tour Bus.` | bible 5.4 | P2 |
| 1186 | `This journey was not recorded, so no Chimes were paid.` | `This tour was not recorded, so no Cheers were given.` | bible 5.4 | P2 |
| 1261 | `echowake-` | `hocus-vocus-` (the saved share card file name, `hocus-vocus-123.png`) | new | P2 |
| 1261 | `journey` | `tour` (file name fallback) | bible 4.1 | P2 |

### 2.12 `js/tutorial.js` (P2 2E; titles bible 5.6, texts new unless marked)

| line | Echowake literal | Hocus Vocus literal | source | phase |
|---|---|---|---|---|
| 40 | `Wake the land` | `Unmute the Soundlands` | bible 5.6 | P2 |
| 41 | `The land is grey and still. Tap a hex beside the awake patch to spend 1 Echo and hear what hides there.` | `The Soundlands are on mute. Tap a hex beside the live patch to spend 1 Vox and hear what hides there.` | bible 5.6 | P2 |
| 42 | `Echo is your budget` | `Vox is your budget` | bible 5.6 | P2 |
| 43 | `Each new hex costs 1 Echo. Temple bells, victories and a camp's Meditate refill it, so wake with purpose.` | `Each new hex costs 1 Vox. Tea stalls, victories and a green room's Warm Up refill it, so unmute with purpose.` | new | P2 |
| 44 | `Now walk` | `Now roll` | bible 5.6 | P2 |
| 45 | `Awake hexes can be walked on. Tap one to head there. You stop at anything worth hearing: a fight, a shop, a camp, a fable.` | `Live hexes can be walked on. Tap one to head there. You stop at anything worth hearing: a fight, a merch stall, a green room, a detour.` | new | P2 |
| 46 | `Read the stamps` | `Read the map signs` | bible 5.6 | P2 |
| 47 | `Every stamp is a promise: fights, elites, peddlers, camps, forges, chests, bells and fables each wear their own. Fog hides the rest, but the boss is always a dark shape.` | `Every sign is a promise: fights, rivals, merch stalls, green rooms, studios, gift boxes, tea stalls and detours each wear their own. Fog hides the rest, but the headliner always shows.` | new | P2 |
| 48 | `The road to the boss` | `The road to the headliner` | bible 5.6 | P2 |
| 49 | `The keeper of each verse waits on the far right of the land. About sixteen hexes will get you there, and every extra hex is a choice. Fights along the way refill your Echo.` | `The headliner of each act waits on the far right of the map. About sixteen hexes will get you there, and every extra hex is a choice. Fights along the way refill your Vox.` | new | P2 |
| 50 | `A Song wakes for free` | `A Spell unmutes for free` | bible 5.6 | P2 |
| 51 | `One-use Songs wake whole shapes of fog at no Echo cost. Save the long ones for the road to the boss.` | `One-use Spells unmute whole shapes of fog at no Vox cost. Save the long ones for the road to the headliner.` | new | P2 |
| 52 | `Treasures` | `Charms` | bible 5.6 | P2 |
| 53 | `Treasures bend the rules for the rest of the journey. Tap here any time to read what yours do.` | `Charms bend the rules for the rest of the tour. Tap here any time to read what yours do.` | new | P2 |
| 55 | `Energy` | `Breath` | bible 5.6 | P2 |
| 56 | `You get 3 Energy each turn, and a card's cost is the number in its corner orb. Whatever you do not spend is gone when the turn ends.` | `You get 3 Breath each turn, and a card's cost is the number in its corner orb. Whatever you do not spend is gone when the turn ends.` | new | P2 |
| 62 | `Out of Energy, or happy with your hand? End the turn. The enemies act, your hand is discarded and you draw fresh cards.` | `Out of Breath, or happy with your hand? End the turn. The enemies act, your hand is discarded and you draw fresh cards.` | new (the one wink of this run of hints) | P2 |
| 65 | `Front row, back row` | `Lead and backing` | bible 5.6 | P2 |
| 66 | `The front hero takes most of the blows, and cards change with the row. One swap per turn is free, so use it.` | `The lead hero takes most of the blows, and cards change with the spot. One swap per turn is free, so use it.` | new | P2 |
| 71 | `A boss` | `A headliner` | bible 5.6 | P2 |
| 72 | `Bosses change shape as they weaken, and the music tells you when. Watch their intents, keep Block up, and do not burn everything in the first turns.` | `Headliners change shape as they weaken, and the music tells you when. Watch their intents, keep Block up, and do not spend everything in the first turns.` | new | P2 |
| 74 | `The spoils` | `The goodie bag` | bible 5.6 | P2 |
| 76 | `A campfire` | `A green room` | bible 5.6 | P2 |
| 77 | `Rest to heal, Sharpen a card, Cut gems, or Meditate for Echo and a Song. You only get so many, so pick what the journey needs.` | `Rest to heal, Rehearse a card, Set gems, or Warm Up for Vox and a Spell. You only get so many, so pick what the tour needs.` | new | P2 |
| 78 | `The peddler` | `Jordan's merch stall` | bible 5.6 | P2 |
| 79 | `Cards, gems, treasures and a Song are for sale. Paying to remove a weak card is often the best buy on the shelf.` | `Cards, gems, charms and a Spell are for sale. Paying Jordan to declutter a weak card is often the best buy on the stall.` | new | P2 |
| 80 | `A fable` | `A detour` | bible 5.6 | P2 |
| 81 | `A fable is a choice, not a test. There is usually a safe option, a gamble and a price. Pick your risk.` | `A detour is a choice, not a test. There is usually a safe option, a gamble and a price. Pick your risk.` | HV_STORY 4 (tip 21) | P2 |
| 83 | `Gems set into card sockets of their own colour, and a prism socket takes any. Cut them at camps, forges and shops. A new gem replaces the old one for good.` | `Gems set into card sockets of their own colour, and a rainbow socket takes any. Set them at green rooms, studios and merch stalls. A new gem replaces the old one for good.` | new | P2 |

### 2.13 CSS `content` strings (`css/combat.css`; P2 2E)

| line | Echowake literal | Hocus Vocus literal | source | phase |
|---|---|---|---|---|
| 185 | `KO` | `WON` (lethal preview badge) | bible 4.10 | P2 |
| 204 | `RETAIN` | `HOLD` (held card badge) | bible 4.10 | P2 |
| 334 | `KO!` | `WON!` (colour-blind lethal badge) | bible 4.10 | P2 |

### 2.14 `hocus_vocus/index.html` (P2 2F, text only; the favicon is P4 4D)

| line | Echowake literal | Hocus Vocus literal | source | phase |
|---|---|---|---|---|
| 8 | `ECHOWAKE: a rogue ballad` | `HOCUS VOCUS: A Vocal Magic Adventure` (`<title>`) | bible 1.2 | P2 |
| 9 | `Two heroes, one silent land. Wake the grey fog hex by hex with Echo, build a deck of gem-socketed cards, and break the Hush. An anime deckbuilding roguelike.` | `Two heroes, one world on mute. Unmute the Soundlands hex by hex with Vox, build a deck of gem-socketed cards, and sing the Gloss out of the spotlight. A chibi deckbuilding roguelike of beatboxing and vocal magic.` (meta description) | new | P2 |
| 42 | `ECHOWAKE` | `HOCUS VOCUS` (watchdog heading) | bible 1.2 | P2 |
| 57 | `ECHOWAKE` | `HOCUS VOCUS` (boot splash `<b>`) | bible 1.2 | P2 |
| 69 | `Echowake needs JavaScript.` | `Hocus Vocus needs JavaScript.` | bible 1.2 | P2 |

### 2.15 `hocus_vocus/gallery.html` (developer art sheet viewer; P2 2F)

| line | Echowake literal | Hocus Vocus literal | source | phase |
|---|---|---|---|---|
| 6 | `ECHOWAKE gallery` | `HOCUS VOCUS gallery` (`<title>`) | bible 1.2 | P2 |
| 229 | `ECHOWAKE gallery` | `HOCUS VOCUS gallery` (nav heading) | bible 1.2 | P2 |
## 3. New UI strings that replace no Echowake literal

These are added, not swapped. Their words come from the plan files named; nothing here is new wording except where marked.

| Where | Hocus Vocus string | source | phase |
|---|---|---|---|
| `js/screen_menu.js` hero select detail, outfit row | label `Outfit`; options `Stage clothes` and the skin name (`Unicorn Onesie`, `Monster Onesie`, `Goat Suit`, from `DATA.outfits`); locked `Win 3 tours with ` + name + ` to unlock.` | bible 5.2, 7.1 | P3 (3C) |
| `js/screen_end.js` unlock list | `New outfit: ` + skin name | bible 7.1 | P3 (3C) |
| `js/ui.js` relic tooltip, `js/screen_menu.js` Tour Bus Charm tile, `js/screen_node.js` reward plaque | the Charm flavour line: `DATA.relics[id].flavor` in italics under the rules text when present (no literal) | HV_WORLD_DATA 13 | P2 (2F, 2B, 2D) |
| `js/screen_menu.js`, `js/screen_combat.js` | `TIER_NAME`: `Sidekick`, `Creature`, `Rival`, `Headliner` | bible 4.10 | P2 |
| `js/screen_menu.js` (and the same words in `ui.js`, `screen_map.js`, `screen_node.js`) | `RARITY_NAME`: `{ common: 'Common', uncommon: 'Uncommon', rare: 'Rare', boss: 'Headliner', shop: 'Merch' }`; Charm subtitle `Rare charm for Jasmin`, `Headliner charm`, `Merch charm` | HV_WORLD_DATA 10.2, 13, 14.1 | P2 |
| `js/screen_menu.js` Who's Who chips | `TAG_LABEL`: spirit `Sprite`, beast `Critter`, folk `Showbiz`, undead `Faded`, construct `Gadget`, insect `Bug`, avian `Bird`, aquatic `Seaside`, void `Glossy` | HV_ENEMIES 8 | P2 (2B) |
| every screen that prints a gem colour | `DATA.COLOUR_NAME[color]` (`red` reads `pink`; added to `js/data.js` by P1 1A) | bible 4.1, HV_PHASES P1 1A | P2 |
| every screen that prints a row id | a row word map `{ front: 'Lead', back: 'Backing' }` (`the lead`, `backing` in prose) | bible 4.1 | P2 |
| title footer `.mn-foot` (`js/screen_menu.js`), the sheet (`js/ui.js` `UI.followPanel`), Tour Bus tab `follow` (key `6`), settings About row | `Follow the duo` | HV_STORY 5.3, bible 7.2 | P9 (9A, 9B) |
| every follow surface, the victory cast phase credit | `Made for RoxorLoops and Jasmin. Find them as @roxorloopsandjasmin.` | HV_STORY 3.5, 5.3, 6 | P9 (9A, 9B, 9C) |
| `js/ui.js` `LINK_ORDER` only | `Website`, `YouTube`, `Facebook`, `TikTok`, `Instagram`; aria `<label>: RoxorLoops and Jasmin, opens in a new tab` | HV_STORY 5.3, 5.7 | P9 (9A) |
| `js/ui.js` `UI.share` | button `Share` (aria `Share Hocus Vocus`); share title `HOCUS VOCUS: A Vocal Magic Adventure`; share text `I just played HOCUS VOCUS: A Vocal Magic Adventure, with RoxorLoops and Jasmin. Still human.`; toasts `Copied. Go on, show someone.` and `Could not copy here. The address bar has the link.` | HV_STORY 5.3, bible 7.2 | P9 (9A) |
| title footer, Tour Bus tab, settings, victory (never game over) | `Support the duo` (aria `Support the duo, opens in a new tab`); support line `Enjoying the tour? The real duo would love your support.` | HV_STORY 5.3 | P9 |
| Tour Bus tab and the sheet, all five URLs empty | `Links are on their way. For now, look for @roxorloopsandjasmin.` | HV_STORY 5.3 | P9 |
| Tour Bus tab footer | `Jordan made these buttons. Press them gently.` | HV_STORY 5.3 | P9 (9B) |
| settings, last group (`js/screen_menu.js` `settingsForm`) | heading `About`; the about text and the short about of HV_STORY 6; `Version ` + VERSION | HV_STORY 5.3, 6; HV_WORLD_DATA 11 | P9 (9B) |
| the sheet | button `Close` | HV_STORY 5.4 | P9 (9A) |
| `js/screen_end.js` victory show phase and game over | `Share` beside `Copy summary` and `Save card`; game over row `Share` and `Follow the duo` | HV_STORY 5.4 | P9 (9C) |

## 4. Copy budgets

| Where | Budget | Enforced by | Hocus Vocus copy, measured |
|---|---|---|---|
| Map info chip action line (`.mp-info-act`) | 66 characters (normal), 52 (Larger text 1.3), 40 (phone, any size) | `tests/hocus_vocus_screen_map.test.mjs` "info chip copy" (about line 1179) | `Too far for your Vox: a chain of 12 hexes costs 12.` 51 and `Tap twice to unmute a chain of 12 hexes costs 12.` 49 (normal only); `Tap twice: a chain of 12 hexes costs 12.` 40 and `Too far: a chain of 12 hexes costs 12.` 38 (Larger and phone; 40 is exactly the Echowake length); `Unmuting 12 hexes. Tap the aimed direction to apply.` 52 (normal only) and `Unmuting 12 hexes. Tap the arrow again.` 39; `Start from a muted hex within 4 hexes of the party.` 51 and `Start from a muted hex beside the live ground.` 46 (normal only; the short forms are 34 and 29); `Not enough Vox to unmute: 1 Vox.` 32; `No way to reach it through the fog.` 35; `This Spell cannot start from here.` 34 (the plain swap `That is not a place this Spell can start.` is 41 and would break the phone budget). The walk lines are pinned verbatim and do not change. |
| Map info chip text (two clamped lines) | no longer than today | `css/map.css`, the same test | resting `Unmute nearby fog for 1 Vox, or tap live ground to walk.` 56 (was 65), short 54 (was 54); `No Vox left. Walk to a tea stall, fight, or cast a Spell.` 57 (was 60), short 50 (was 48) |
| Spell mode bar (two clamped lines) | no longer than today | the same test | `Aim, then tap the arrow again to unmute 12 hexes.` 49 (was 51); `Tap again or press Cast to unmute 12 hexes.` 43 (was 49); `Nothing would unmute that way. Aim elsewhere.` 45 (was 43); `Glowing hexes are places to start. Hover for the shape, tap to cast.` 68 (was 68) |
| Tutorial hints | title at most 30, text 40 to 230, no dashes | `tests/hocus_vocus_screen_end.test.mjs` 706, 707 | titles 6 to 25 characters; texts 88 to 184 |
| Hero select Begin button at Larger text | `len * (0.46 + 0.02) * 27.3 + 32 <= 259` px | `tests/hocus_vocus_screen_menu.test.mjs` "Begin labels" (1772 to 1786): `.ts-big .mn-begin` letter-spacing .02em, `.mn-launch` 296 px, padding 14 px, 9 px scrollbar | `Start the Tour` 14 characters, 215.5 px: fits; `Start Daily Duet` 16 characters, 241.7 px: fits; `Start the Daily Duet` 20 characters, 294 px: fails (why bible 5.2 takes the short form) |
| Title slim plaques on a phone | 84 px each, three in a row | `tests/hocus_vocus_screen_menu.test.mjs` about 1731 | `Tour Bus` (8 letters at 14 px) stays on one line like `Settings`; `How to Play` wraps as it does today |
| Continue plaque sub | 3 clamped lines | `css/menu.css` 40 | `Act 2, Vox 5, Jasmin and RoxorLoops` 35 characters (was 31); Larger text and phones already drop the hero faces; check in the G2 Continue shot |
| Combat hero name plates | `.ch-name` min-width 3em (Hanae was 2.98em) | `tests/hocus_vocus_screen_combat.test.mjs` 1586 | `RoxorLoops` is 10 letters: P1 1F measures it and edits the test |
| Combat row tags | `.ct-row` min-width 5.6em, sized for `FRONT` | `tests/hocus_vocus_screen_combat.test.mjs` 1588 | `BACKING` is 7 letters and `LEAD` 4: re-measure so both tags keep one width (P2 2E); the hero select badge and slot labels likewise |
| Boss banner seal (`js/scene.js` 2049) | a 68 x 40 px plate, text at 15 px | screenshots (boss1, boss2, boss3) | `HEADLINER` is 9 letters where `KEEPER` was 6: about 11 px text or a wider plate; size it with `measureText` |
| Combat reveal plate and boss banner | one line | screenshots | `HEADLINER` (9) where `KEEPER` was 6; `RIVAL` is shorter than `CHAMPION` |
| Reward banner (`.nk-banner`) | one line | screenshots (reward, boss rewards) | `Scrollspinner Bows Out` and `The Headliner Bows Out` 22 characters (was `Kuzunoha Falls` 14, `The Guardian Falls` 18) |
| Map info chip name | one line | the comment at `js/screen_map.js` 1221 | `, spotted` is 2 letters longer than `, heard` (phone at Larger text) |
| Share card title (`js/screen_end.js` 1013), card back word (`js/ui.js` 1627), boot splash | `spaced(ctx, title, x, y, 5)` at 800 31px Georgia on a 600 px card | screenshots (victory, card back, boot) | `HOCUS VOCUS` is 11 characters where `ECHOWAKE` was 8: measure, and use the stacked two-line form of bible 1.2 where it does not fit |
| Curtain call lines | at most 140 characters | HV_STORY 3.5 | 129, 131, 137, 121 |
| Hit words | at most 12 characters, ASCII | bible 4.10 | longest `NANANA!` 7 |
| How to Play rules | three lines under the diagram, no test budget | screenshots (HV_PHASES 2.6 `menus`, pages 1, 2 and 7) | the HV_WORLD_DATA 12 lines grow by up to 24 characters (page 1 rule 1: 93 to 117; page 7 rule 1: 121 to 139): look at them at Larger text |
| Everything | no em or en dash, no tab | `tests/hocus_vocus_hygiene.test.mjs` | every new string uses commas, colons and full stops |

## 5. Test pins

Each pin names the assertion that changes and the row of section 2 that changes it. Lines are from HV_BASE. Pins marked (not in HV_PHASES 9)
were found while building this table; add them to the phase's test edits. The P0 pins (DATA reads by 0C and 0D) are listed in HV_PHASES 9
and are not repeated here, except where a P0 pin and a copy row share a line.

### 5.1 P1 pins (the rows of `data_text.js`, `run.js`, `meta.js`)

- `text`: about 200 literal pins (HV_PHASES 9): the bible 4.3 and 4.9 word map applied to the expected literals only (P1 1A), for example
  296 `'Gain 2 Echo.'` becomes `'Gain 2 Vox.'`; `Front:` and `Back:` become `Lead:` and `Backing:`; `Energy` becomes `Breath` and the old
  sumi `Breath` becomes `Groove`.
- `content`: 254 `'Energy'` becomes `'Breath'`; 277 and 278 `/Now (Front|Back):/` becomes `/Now (Lead|Backing):/` and `/(Swap|swap) rows/`
  becomes `/(Swap|swap) spots/`; 306 `/swap into the front row/` becomes `/swap into the lead/`; 307 `/you fall/` becomes `/you lose your voice/`;
  314 `'whenever either hero swaps rows'` becomes `'whenever either hero swaps spots'`; 381 `/^(Front|Back): /` becomes `/^(Lead|Backing): /`;
  437 `'Move to the front row. Gain 1 Bloom and 3 Block.'` becomes `'Move to the lead. Gain 1 Bloom and 3 Block.'`; 447 `'... Swap rows. Now Back: ...'`
  becomes `'... Swap spots. Now Backing: ...'` (rows data_text 230, 349, 350, 531, 532, 970, 1023).
- `combat`: 1764 `'Deals 7 x2 to the front hero'` becomes `'Deals 7 x2 to the lead hero'` (row 1248); 1770 `'Deals 5 to Hanae'` reads the hero name
  from DATA; 1804 to 1807 the status names in intent text read DATA (HV_PHASES 9).
- `treasure`: 216 to 229 the dictionaries, 309 `'Every 5th time you wake a hex, gain 1 Echo.'` becomes `'Every 5th time you unmute a hex, gain 1 Vox.'`
  (rows 534, 973), 439 to 442 gem samples `Front row:` becomes `Lead:` (row 1194), 572 to 574 junk texts (rows 405 to 408, 527, 962): HV_WORLD_DATA 13.
- `run`: 655 and 1294 `/Echo/` becomes `/Vox/` (run.js 378, 970); 1337 `'Verse 3 only'` becomes `'Act 3 only'` (run.js 846); 1408 `/kind|give|Fable/i`
  becomes `/kind|give|Detour/i` (run.js 925).
- `meta`: 332 `'Verse 2, Echo 5, Hanae and Kuro'` becomes `'Act 2, Vox 5, Jasmin and RoxorLoops'`; 333 `'Verse 1, Echo 1, Raiga and Suzu'` becomes
  `'Act 1, Vox 1, Andy and RawClaw'` (meta.js 332).
- `narrative`: 716 `/sharpen/i` becomes `/rehearse/i` (run.js 851).
- `screen_menu` 122 `/Verse 1/` and `game` 214 `/Verse 1/` become `/Act 1/` (meta.js 332).

### 5.2 P2 and later pins

- `lib.test` 205: `'ECHOWAKE: a rogue ballad'` becomes `'HOCUS VOCUS: A Vocal Magic Adventure'` (index.html 8; P2 2F).
- `theme` 215, 219, 220: the title, boot splash and noscript pins (index.html 8, 57, 69; the P2 lead).
- `player.mjs` (fallbacks; the data-act hooks stay first; P2 2F): 142 `/Raise the (Ink|Tempo) Trial/` gains `Raise the Encore` (screen_menu 772);
  145 `/begin the (tale|journey)/i` gains `start the tour` (screen_menu 619); 150 `/play on|turn the page|continue/i` gains `on we go` (screen_end 463);
  410 the outcome regex gains `on we go`.
- `ui` (P2 2F): 210 `/Something broke the rhythm/` becomes `/Something went a bit off-key/` (ui.js 481; not in HV_PHASES 9); 1042 `/bell/i`
  becomes `/tea/i` (main.js 177; not in HV_PHASES 9); 1044 `/song/i` becomes `/spell/i` (main.js 178); 1132 `/Chimes/` becomes `/Cheers/` (main.js 267);
  1147 `/no saved journey/i` becomes `/no saved tour/i` (main.js 168); 1173 the pause labels `'Treasures'` and `'Abandon journey'` become `'Charms'`
  and `'Abandon tour'` (main.js 727, 730); 1228 `/Begin/` on the placeholder hero select becomes `/Start/` (main.js 604; not in HV_PHASES 9).
- `screen_map` (P2 2C): 165 `/Verse I/` becomes `/Act I/` (1089); 166 `/\d+% awake/` becomes `/\d+% live/` (1147); 175 `'hexes awake'` becomes
  `'hexes live'` (1254); 189 and 197 `/silence/i` becomes `/no map/i` (2042; not in HV_PHASES 9); 220 `/hexes awake/` or `/% awake/` becomes `live`;
  274 the toast `/Echo/` becomes `/Vox/` (1403, 1415); 284 `/Too far for your Echo/` becomes `/Too far for your Vox/` (1228); 287 `'needs ' + cost + ' Echo'`
  becomes `' Vox'` (1415); 302 `/Silent ground|heard/` becomes `/Muted ground|spotted/` and `/1 Echo/` becomes `/1 Vox/` (1221, 1222, 1224); 306
  `', (heard)'` becomes `', (spotted)'` (1221); 325 `/hums back one Echo/` becomes `/hums along: 1 Vox/` (1301, 1303); 381 `/No Songs/` becomes
  `/No Spells/` (1042); 402 `/Tap again|Sing/` becomes `/Tap again|Cast/` (1512, 1520); 431 `/Sing \d/` becomes `/Cast \d/` (1520); 461
  `/no songs/i` becomes `/no spells/i` (1934); 465 `/nowhere to wake/i` becomes `/nowhere to unmute/i` (1463); 1189 `/wake/i` becomes `/unmute/i`
  (1250); 1190 `/tap awake ground to walk\./` becomes `/tap live ground to walk\./` (1250; the phone form `/ground to walk\./` holds); 1410 the
  boss rarity `'keeper'` becomes `'headliner'` and `shop` reads `merch` (2166); 1411 and 1413 `/Found in Verse (I|II),/` becomes
  `/Found in Act (I|II),/` (2147); 1414 `/keeper/i` and `/peddler/i` become `/headliner/i` and `/merch/i` (2144, 2145); 1415 `/5 treasures/` becomes
  `/5 charms/` (2177; not in HV_PHASES 9); 1421 `/Treasures/` becomes `/Charms/` (1067); 1423 `/No treasures yet/` becomes `/No charms yet/` (2173);
  1439 the tabs become `['The Soundlands', 'Spells', 'Controls', 'Words']` (2322); 1446 `/Silent ground/` and `/Heard from afar/` become
  `/Muted ground/` and `/Spotted from afar/` (2256, 2257); 1699 and 1712 `/Verse I/`, `/Verse II/` become `/Act I/`, `/Act II/` (2051); 1770
  `/Woke 1 hex for 1 Echo/` becomes `/Unmuted 1 hex for 1 Vox/` (1431); 1821 and 1824 `/hexes awake/` become `/hexes live/` (1254). The
  `__wake` and `__awake` spies (28 to 42, 1982 to 2060) use AUDIO ids and stay.
- `screen_menu` (P2 2B): 304 and 313 `'FRONT'`, `'BACK'` become `'LEAD'`, `'BACKING'` (911); 472 `/Daily Jam chooses/` becomes `/Daily Duet chooses/`
  (810); 544 `/Costs \d+ Chimes|Unlocked/` becomes `/Costs \d+ Cheers|Unlocked/` (1199); 553 `segBtn(g, 'Treasures')` becomes `'Charms'` (1137);
  616 `/more Chimes/` becomes `/more Cheers/` (1248); 666 `/13 Chimes/` becomes `/13 Cheers/` (1271); 696 `/2 of \d+ ballads heard/` becomes
  `/2 of \d+ entries read/` (1311); 700 `/not heard this ballad/` becomes `/not reached this entry/` (1322); 723 `/Verse 1: /` becomes `/Act 1: /`
  (1376); 738 `/Verse 1/` becomes `/Act 1/` (1402); 762 the outcomes `['Victory', 'Fallen', 'Abandoned', 'Fallen']` become
  `['Victory', 'Curtain fell', 'Abandoned', 'Curtain fell']` (1454; not in HV_PHASES 9); 764 `'Verse 3'` becomes `'Act 3'` (1455); 765
  `/\+52 Chimes/` becomes `/\+52 Cheers/` (1462); 775 `/No journeys yet/` becomes `/No tours yet/` (1442); 940 `/quiet again/i` becomes
  `/very first soundcheck/i` (1544; not in HV_PHASES 9); 1072 `/Liner note/` and the fallback string `'Liner note'` become `/Jordan's tip/` and
  `"Jordan's tip"` (2007); 1155 `'Verse 1Tempo Trial II'` becomes `'Act 1Encore II'` (2095); 1181 `/Daily Jam/` present and `/Tempo Trial/` absent
  become `/Daily Duet/` and `/Encore/` (2095); 1260 `/Abandon this journey/` becomes `/Abandon this tour/` (main.js 262 through the shared confirm);
  1301 `/No journey is underway/` becomes `/No tour is on the road/` (2089); 1455 `/new Daily Jam/i` becomes `/new Daily Duet/i` (512, 869); 1778
  and 1780 `'Begin the Journey'` and `/^Begin Daily Jam$/` become `'Start the Tour'` and `/^Start Daily Duet$/`, with the width model of section 4
  (619). The HOWTO margin note test (1066) and the tip regexes follow HV_STORY 4 (1936, 1940, 1944, 1960). 1542 `'Swap'` stays.
- `screen_node` (P2 2D): 185 `'A Champion Falls'` becomes `'A Rival Bows Out'` (852); 297 `/nothing but an echo/` becomes `/nothing but a squeak/`
  (991); 955 `/Only silence/` becomes `/Nothing here/` (1638; not in HV_PHASES 9); 1018 `/can be sharpened/` becomes `/can be rehearsed/` (1819;
  not in HV_PHASES 9); 1039 `/Every card is already sharp/` becomes `/Every card is already rehearsed/` (1819; not in HV_PHASES 9); 1049
  `/\+4 Echo \(3 to 7\)/` becomes `/\+4 Vox \(3 to 7\)/` (1822); 1198 `/already sharp|Nothing left/` becomes `/already rehearsed|Nothing left/`
  (1990, 1995; not in HV_PHASES 9); 1199 `/no gems/` holds (`You carry no gems to set.`); the seven presses `btnByText(g, /Take the treasure/)` at
  1245, 1248, 1339, 1354, 1985, 2035 and 2148 become `/Take the charm/` (2178; not in HV_PHASES 9); 1629 the remove note fixture
  `'The peddler burns it for good.'` becomes `'Jordan takes it off your hands for good.'` (1448); 1683 `/Sharpen this card/` becomes
  `/Rehearse this card/` (675; not in HV_PHASES 9); 1693 `/Nothing left to sharpen/` becomes `/Nothing left to rehearse/` (594; not in
  HV_PHASES 9); 2078 `/No journey is underway/` becomes `/No tour is on the road/` (285); 939 `/already moved on/` holds (1664); 2079
  `/Back to Title/` holds; 953 `'no_such_fable'` is an id.
- `screen_combat` (P2 2E): 291 `'Not enough Energy'` becomes `'Not enough Breath'` (102), and the hero part of `'Kuro is down'` reads DATA (P0 0C)
  while the tail becomes `' is voiceless'` (391); 292 `'Suzu is stunned'` keeps the DATA name and the tail becomes `' is starstruck'` (392); 310 and
  624 `'FRONT'`, `'BACK'` become `'LEAD'`, `'BACKING'` (746); 345 `'STUN'` becomes `'WOW'` (909; not in HV_PHASES 9); 444 `'Not enough Energy'`
  becomes `'Not enough Breath'` (102); 626 `'1 Energy'` becomes `'1 Breath'` (780); 634 `'Not enough Energy to swap'` becomes
  `'Not enough Breath to swap'` (786); 640 `'Bound'` becomes `'Tangled'` (784; not in HV_PHASES 9); 453 and 458 tails as 291 and 292; 720 the row
  text `'Front: +2 damage'` and `'Back: '` become `'Lead: +2 damage'` and `'Backing: '` (data_text 1317, P1); 1588 the `.ct-row` width rule
  (section 4).
- `screen_end` (P2 2E): 175 the On we go button (463); 216 `'A Silent Ballad'` becomes `'A Diary Entry'` (442); 274 `'VERSE ONE COMPLETE'` becomes
  `'END OF ACT ONE'` (708); 306 and 398 `/joins the band/` becomes `/joins the tour!/` (714, 716, 567); 359 `/Fell in Verse I/` becomes
  `/Curtain fell in Act I/` (882); 398 `/Tempo Trial 2 unlocked/` becomes `/Encore 2 unlocked/` (573); 445 `/... \| Tempo Trial 0/` becomes
  `/... \| Encore 0/` (556); 741 `/Echo/` in the first hint becomes `/Vox/` (tutorial.js 41); 776 and 831 are hint ids (keep).
- `game`: 214 `/Verse 1/` (P1, above); 519 `/another window/` holds (main.js 104).

## 6. Couplings and traps for the phase agents

1. `js/run.js` logs a relic as `Found X.` (lines 453, 606, 1099) and `js/screen_map.js` `relicSource` finds the Act a relic came from by
   matching `'Found ' + d.name + '.'` in the run log. Keep `Found X.` in run.js exactly (it carries no Echowake word), or change both together.
2. Words built from ids are as visible as literals: `data_text.js` 501, 1191, 1192 (keyword ids capitalised), `screen_menu.js` 687, 926, 1177,
   1181, 1403, 1773, `screen_combat.js` 820, `ui.js` 1474, 1482, 1646, 1659, `screen_map.js` 2166, 2177, `screen_node.js` 695, 751, 867, 1348, 1349,
   2185, 2255, 2298. Each needs its display map (`DATA.keywords[k].name`, `TIER_NAME`, `RARITY_NAME`, `TAG_LABEL`, `DATA.COLOUR_NAME`, the row
   word map), never `cap(id)`.
3. Spell names take no article (`Boots and Cats`, `Abracadabass`): run.js 472 and `screen_map.js` 1190, 1463, 1619, 1736 and `screen_node.js`
   1889 drop their `the`.
4. `screen_map.js` `say(normal, larger, phone)` picks a sentence per copy tier: keep the order and the budgets of section 4.
5. The How to Play pages find their margin note by a regex over `DATA.tips` (`screen_menu.js` 1936 to 1960): each new regex must match exactly
   one tip of HV_STORY 4, which P2 2A pastes in the same phase.
6. Engine words that survive (bible 6.4) stay hard-coded: `Block`, `Swap`, `X cost`, `HP`, `gold`. `BOSS` in `scene.js` (891 to 903, 1041, 2295)
   is an internal banner kind that `bossInfo` maps to the Headliner's name; it is never shown.
7. Developer-only names stay: the `?gallery` component names `Paper panel` and `Lacquer panel` (`main.js` 772, 778), the gallery background
   option `paper` (`gallery.html` 254), every sfx id (`page_turn`, `well`, ...) and every CSS class (`ev-page`, `st-page`, `mn-p-run`).
8. The `PEDDLER` constant and its keys (`hello`, `buy`, `poor`, `sold`, `remove`, `cut`, `empty`, `leave`, `idle`) are ids; only the strings become
   Jordan's. The lines that carry no Echowake word stay (`Sold out! Try the one next to it.`, `Steady hands make sparkling cards.`,
   `Off you go! Buy something next time, or at least admire it louder.`, `Psst. The blue gems are the sensible ones.`,
   `My grandmother sold cards, and my grandmother was never wrong. Twice.`,
   `Sale sticker means sale. I do not make the rules. I make the stickers.`).
9. Encore level 0: the hero select says `No encore` (bible 5.2); the copied summary line keeps `Encore 0` (HV_PHASES P2 2E, `screen_end.test` 445).
10. No new string uses lowercase `song`, the noun `run`, or a word of bible 6.2 or 6.3, so neither theme check 6 (before or after P1 1F rescopes it)
    nor check 7b needs an allowlist entry for this table. The rows avoid `run-through` on purpose (the run rule's `\b` would match it).
11. The scene demo payloads (`scene.js` 2280 to 2297) are `?scene` developer demos; the tests' summon payload names (`scene.test` 328, 438, 808) are
    fixtures and stay.

## 7. Plan conflicts found while writing this file

1. Bible 5.2 begin button `Start the Daily Duet` fails the width model (294 px against 259): this table uses `Start Daily Duet`, the default
   P0 agent 0A applies to the bible (HV_PHASES P0, conflict c).
2. Bible 5.2 names Encore level 0 `No encore`, while HV_PHASES P2 2E expects `Encore 0` in the summary line: both kept, each in its own place
   (section 6 item 9).
3. Bible 5.6 gives a generic error toast, but the fork's error surface is the `UI.modal` of `ui.js` 481: its title takes the toast's first
   sentence (`Something went a bit off-key`) and its body says the tour is safe.
4. HV_PHASES 9 misses several pins that the copy rows change; section 5 lists each one marked "not in HV_PHASES 9" (ui 210, 1042, 1228;
   screen_map 189, 197, 1415; screen_menu 762, 940; screen_node 955, 1018, 1039, 1198, 1683, 1693 and the seven `Take the treasure` presses;
   screen_combat 345, 640).
5. HV_PHASES P2 2D marks `Jordan takes it off your hands for good.` as a suggestion for the remove note; this table adopts it.

## 8. Cross-checks done for this file

- Every literal the scratch scan flagged (781) is a row of section 2 or was dropped as an id, a CSS class, a surviving engine word or the
  internal `BOSS` kind (section 6 items 6 and 7); the rows built from code expressions are marked as instructions.
- A scratch generator checked every row's Echowake literal against its line at HV_BASE: all found.
- Every new string: printable ASCII, no em or en dash, no ` - ` or `--` used as a dash, British spelling, none of the bible 6.2 or 6.3 words
  (ids inside notes aside), no noun `run`, no lowercase `song`, no tone word (kill, die, dead, death, blood, gore) and no admin word; checked
  by script.
- The tutorial hint titles are bible 5.6 exact and in the hint order of `tutorial.js`; the How to Play titles, kickers and rules are
  HV_WORLD_DATA 12 exact; the Tour Bus and settings strings are HV_WORLD_DATA 10 and 11 exact; the end screen story strings are HV_STORY 3.4
  and 3.5 exact.
- The budgets of section 4 were measured by script from the strings in section 2.
