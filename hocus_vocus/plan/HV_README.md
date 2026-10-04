# HOCUS VOCUS: the plan, one page

`hocus_vocus/` is a fork of Echowake (`rogue_book/`) being re-themed into **HOCUS VOCUS: A Vocal Magic Adventure** (tagline
`beatboxing and vocal magic`), a card roguelike starring the beatbox and singing duo RoxorLoops and Jasmin (`@roxorloopsandjasmin`).
Same engine, same ids, same numbers: only player-facing words, art and sound change. Echowake stays untouched and playable. Live at
`https://games-71g.pages.dev/hocus_vocus/`; save keys `hv_profile_v1`, `hv_run_v1` (plus `hv_skins_v1` for outfits).

## The files, and the order to read them

Never read a plan file whole: `grep -n '^#' <file>`, then Read with offset and limit.

| # | File | What it is | Read it when |
|---|---|---|---|
| 1 | `HV_README.md` | this index | first |
| 2 | `HV_BIBLE.md` | the authority: world, story, cast, THE GLOSSARY (4), exact UI copy (5), hard rules H1 to H18 and the banned word lists (6), skins, links, sample hook (7). It wins every conflict | sections 0 to 3 once; 4 and 6 as a lookup |
| 3 | `HV_PHASES.md` | the executable order: 12 phases (one PR each), file ownership per agent, gates G1 to G7, agent prompts, risks, owner questions, every test pin | sections 0 to 3 once, then your phase |
| 4 | `HV_HEROES.md` | the four hero kits, 288 barks (5 DATA lines per key), names, concepts and flavours of all 160 cards | P1 (cards), P2 (barks) |
| 5 | `HV_ENEMIES.md` | all 51 enemies: names, lore, moves, says, roles, art briefs; the three Headliners | P1 (names), P5 to P7 (art) |
| 6 | `HV_WORLD_DATA.md` | 66 Charms, 24 gems, 32 Stickers, 10 Encores, 14 tiles, 6 Spells, 16 keywords, 20 statuses; Tour Bus, settings, How to Play copy | P1, P2 |
| 7 | `HV_STORY.md` | 48 Detours, the 16 Tour Diary entries, 30 tips, curtain lines, the Follow the duo panel (`DATA.LINKS`), Share and Support | P2, P9 |
| 8 | `HV_ART_AUDIO.md` | every picture and sound: the owners' chibi cast port, outfits, logo, scenes, 51 enemy redraws, motifs, icons, map, fx, UI skin, cover, 19 tracks, 73 sfx, the sample hook | P3 to P8, P10 |
| 9 | `HV_UI_COPY.md` | every other UI literal with its new string and phase (written in P0 by agent 0B) | P2 |
| 10 | `inventory.md` | the generated list of every player-facing id with its Echowake name and rules text | to look an id up |

`node tools/hocus_vocus/plan_check.mjs` proves every inventory id appears in the plan files (today: 467 ids, 0 missing).

## Decisions at a glance

- **The world**: the Soundlands (always plural: "the Soundlands are"), where real voices are magic.
- **The force**: the Gloss, a kind little filter made to help one nervous singer feel brave, turned up until it smoothed everything:
  polished, filtered, perfect, and so the world went on mute. Never evil, never destroyed. Its colour word is opal, never pearl.
- **The heart**: the owners' song "Human" ("are we losing being human?", paraphrased, never quoted). Two real, imperfect voices answer
  it. Placed exactly once each: victory entry `Human`, Sticker `ch3_clear` Still Human, Flawless's last phase, the share line.
- **Other nods** (bible 2.9): Arabic Impro (`hanae_whirling_petals`), Calling of the Moon (`hanae_blade_duet`, the Act II rooftop, the
  Night Noodle Market), the viral audition clip (Charm The Viral Clip, Detour Have You Seen the Clip?, two hero entries).

| Act (was Verse) | Setting | Headliner (id stays) |
|---|---|---|
| Act I | **Blossom Bay**: a candy-coloured harbour town, cherry trees, the Snack Pier | **Kraki, the Karaoke Kraken** (`boss_kuzunoha`) |
| Act II | **Scrollopolis**: a neon city of giant phone screens at 2 am, a moon nobody looks at | **Scrollspinner, Queen of the Feed** (`boss_jorogumo`) |
| Act III | **The Perfect Stage**: a flawless floating talent show, mannequin fans, three empty judges' chairs | **Flawless, Star of the Perfect Stage** (`boss_editor`) |

| Cast | id | Role, colour | Title, passive, resource | Outfit (unlock Sticker) |
|---|---|---|---|---|
| **Jasmin** | `hanae` | lead, attack, pink | The Blossom Voice; Every Note Blooms; Bloom | Unicorn Onesie (`petal_and_steel`) |
| **RoxorLoops** | `kuro` | backing, support and soloist, green | The Beatbox Wizard; In the Pocket; Groove | Monster Onesie (`ink_and_insight`) |
| **RawClaw** | `suzu` | backing, unlocked by clearing Act I, violet | The Sound Alchemist; Always Rolling; Reverb | Goat Suit (`moonlit_vigil`) |
| **Andy** | `raiga` | lead, unlocked by clearing Act II, orange | The Thunder Bass; Bass Face; Rumble | none yet |
| **Jordan** | none | not a hero, teal | runs Jordan's Merch Stall, designs the Stickers, gives the tips | |

## The 25 most important glossary terms (bible 4; ids never change)

| Hocus Vocus | Was | | Hocus Vocus | Was |
|---|---|---|---|---|
| Hocus Vocus | Echowake | | Daily Duet | Daily Jam |
| the Soundlands | the land | | Breath | Energy |
| the Gloss | the Hush | | Lead / Backing (spots) | Front / Back row |
| Vox | Echo | | Voiceless | Downed |
| unmute, live, muted, spotted | wake, awake, silent, heard | | Headliner | Keeper |
| Spell (learn, cast) | Song | | Rival | Champion |
| Act | Verse | | Sidekick | Minion |
| tour | journey | | Detour | Fable |
| Charm | Treasure | | Jordan's Merch Stall | Peddler |
| Cheers | Chimes | | Green Room (Rest, Rehearse, Set Gems, Warm Up) | Campfire |
| the Tour Bus | the Hall of Echoes | | Stickers | achievements |
| Encore 1 to 10 | Tempo Trial | | the Tour Diary, an entry | Ballads |
| Bloom, Groove, Reverb, Rumble | the hero resources | | | |

## The phases (HV_PHASES 1; strictly in order, one squash-merged PR each)

| Phase | PR title (`Hocus Vocus Pn: ...`) | What changes on screen |
|---|---|---|
| P0 | plan, kit, baselines and theme-proof tests | nothing (kit copied from the planning scratchpad first; the fork lands on main first if needed) |
| P1 | names and rules text | every name and rules sentence (data only, bot records byte-identical) |
| P2 | story and UI copy | Detours, Tour Diary, barks, tips, Stickers, Encores, menus, How to Play, tutorial |
| P3 | the chibi cast and outfits | the owners' chibi heroes and Jordan, the three outfits |
| P4 | logo, title, stage scenes and the UI skin | logo, title, end scenes, node screens, the UI skin |
| P5 | Act I, Blossom Bay, and the combat look | Act I enemies and Kraki, backdrops, fx, hit words, icons |
| P6 | Act II, Scrollopolis, and the cards | Act II enemies and Scrollspinner, card motifs, Charm icons |
| P7 | Act III, the Perfect Stage, and the map | Act III enemies and Flawless, the map |
| P8 | the band, the sound and the sample hook | all music and sfx, Spell voices, the empty sample manifest |
| P9 | follow the duo, share and support | links, Share, Support, the sixth Tour Bus tab |
| P10 | docs, theme guard, cover and site card | docs, the permanent theme guard, the games index card |
| P11 | independent verification and fixes | fixes only |

## Open questions for the owners (HV_PHASES 8; every one has a default, nothing waits)

1. O1 The real URLs (website, YouTube, Facebook, TikTok, Instagram, Support, the public game address). Default: empty, buttons hidden.
2. O2 Which real samples first, who records, which format, may they be public. Default: everything synthesised.
3. O3 Is the name "Hocus Vocus" free (stores, web, trademarks)?
4. O4 Do RawClaw, Andy and Jordan agree to their handles, looks and jokes (goat suit, "Just Andy", merch gags)?
5. O5 May the chibi card references (not the photos) be stored under `tools/`? More artwork (RawClaw, Andy, Jordan, logo file)?
6. O6 Logo letters: pink HOCUS over green VOCUS (default) or cream?
7. O7 Happy with the nod placements? Arabic Impro can only randomise its targets (mechanics are frozen), not its effect.
8. O8 A by-ear listen after P8. O9 RoxorLoops's hit word `PKAH!` instead of `LA!`? O11 A Danish version later?
9. O12 Keep the plan off the public site (default yes). O13 The games index card colour, tags and text. O14 Should Echowake point here?
10. Editor renames to confirm (all defaults already applied): Jasmin's passive `Every Note Blooms` (was Vocal Runs, too close to the Spell
    Vocal Run, O10), `kuro_creeping_ink` **Word of Mouth** (was Gone Viral: the clip nod lives only in its bible placements), Charm
    `tyrants_crown` **Pitch Fixer** and enemies **Pitch-Perfect Gull**, **Chrome Siren** (no trademarked "Auto-Tune"), **VIP Bouncer**,
    the lethal badge `WON` (`WOW` is the stun badge), Encore 7 `Limited Edition` kept as an allowed survivor (fallback Sold Separately).
